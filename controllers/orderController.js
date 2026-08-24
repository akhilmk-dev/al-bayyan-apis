
const { handleOrderEdit, getVendorOrders } = require('../helper/orderHelper');
const Order = require('../models/Order');
const catchAsync = require('../utils/catchAsync');
const axios = require('axios');
const shopifyClient = require('../utils/shopifyClient');
const { NotFoundError } = require('../utils/customErrors');
const RemovedLineItem = require('../models/RemovedLineItem');
const OrderTimeline = require('../models/OrderTimeline');
const User = require('../models/User');
const { geocodeAddress } = require('../utils/geocodeClient');
const shopifyGraphql = require('../utils/shopifyGraphql');
const { ORDER_CANCEL_MUTATION, RETURN_REQUEST_MUTATION, DRAFT_ORDER_CREATE_FROM_ORDER_MUTATION } = require('../graphql/mutations/order.mutation');

// get all orders
exports.getOrdersByCustomer = catchAsync(async (req, res, next) => {
   const customerId = Number(req.params.customerId);
   if (isNaN(customerId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid customer ID' });
   }

   // Pagination parameters
   const page = parseInt(req.query.page) || 1;
   const limit = parseInt(req.query.limit) || 10;
   const skip = (page - 1) * limit;

   // Query MongoDB (all synced orders are stored here)
   const orders = await Order.find({ "customer.id": customerId })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

   const total = await Order.countDocuments({ "customer.id": customerId });

   res.status(200).json({
      status: 'success',
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      results: orders.length,
      data: orders,
   });
});

exports.getOrderDetailByCustomer = catchAsync(async (req, res, next) => {
   const { customerId, orderId } = req.params;
   const cId = Number(customerId);

   if (isNaN(cId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid customer ID' });
   }

   const order = await Order.findOne({
      "customer.id": cId,
      order_id: orderId
   }).populate('assigned_agent').lean();

   if (!order) {
      return next(new NotFoundError("Order not found or access denied"));
   }

   const removedItems = await RemovedLineItem.find({ order_id: order.order_id }).lean();
   const timeline = await OrderTimeline.find({ order_id: order.order_id }).sort({ timestamp: -1 }).lean();

   res.status(200).json({
      status: "success",
      message: "Order details fetched successfully",
      data: {
         ...order,
         removed_line_items: removedItems,
         timeline,
      }
   });
});

// Mobile app: customer requests a return on their own order. Auth is the
// same shared static API key as live tracking (see
// middleware/trackingAuthMiddleware.js) - this app has no per-customer login
// token yet, so ownership is only checked by customer.id/order_id matching,
// same as getOrderDetailByCustomer above.
//
// Uses Shopify's returnRequest mutation (status REQUESTED, needs merchant
// approval in Shopify admin) rather than returnCreate (auto-open) - the
// returns/request|approve|decline|close webhooks below keep the local
// status in sync as the merchant processes it.
exports.requestOrderReturn = catchAsync(async (req, res, next) => {
   const { customerId, orderId } = req.params;
   const cId = Number(customerId);
   const requestedLineItems = req.body?.line_items;

   if (isNaN(cId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid customer ID' });
   }
   if (!Array.isArray(requestedLineItems) || requestedLineItems.length === 0) {
      return res.status(400).json({ status: 'fail', message: 'line_items is required' });
   }

   const order = await Order.findOne({ "customer.id": cId, order_id: orderId });
   if (!order) {
      return next(new NotFoundError("Order not found or access denied"));
   }

   // Can't return something that hasn't reached the customer yet - same
   // style of guard as the cancel-after-pickup restriction on cancelOrder.
   if (order.delivery_status !== 'Delivered') {
      return res.status(400).json({
         status: "fail",
         message: `A return can only be requested once the order is Delivered (currently ${order.delivery_status})`
      });
   }

   // Enrich against the order's own line items (already resolved from
   // Shopify metafields at order-sync time) - same approach as
   // refundOrderWebhook - and build Shopify's ReturnLineItemInput shape.
   const shopifyReturnLineItems = [];
   const localReturnLineItems = [];
   for (const requested of requestedLineItems) {
      const orderLineItem = order.line_items.find(
         li => String(li.fulfillment_item_id) === String(requested.fulfillment_line_item_id)
      );
      shopifyReturnLineItems.push({
         fulfillmentLineItemId: `gid://shopify/FulfillmentLineItem/${requested.fulfillment_line_item_id}`,
         quantity: requested.quantity,
         returnReason: requested.return_reason || 'OTHER',
         returnReasonNote: requested.return_reason_note || null
      });
      localReturnLineItems.push({
         fulfillment_line_item_id: String(requested.fulfillment_line_item_id ?? ''),
         line_item_id: orderLineItem?.id || null,
         quantity: requested.quantity,
         title: orderLineItem?.title || null,
         sku: orderLineItem?.sku || null,
         vendor_id: orderLineItem?.vendor_id || null,
         vendor_name: orderLineItem?.vendor_name || null,
         return_reason: requested.return_reason || 'OTHER',
         return_reason_note: requested.return_reason_note || null
      });
   }

   const { data } = await shopifyGraphql.post("", {
      query: RETURN_REQUEST_MUTATION,
      variables: {
         input: {
            orderId: `gid://shopify/Order/${order.order_id}`,
            returnLineItems: shopifyReturnLineItems
         }
      }
   });

   const returnErrors = data?.data?.returnRequest?.userErrors;
   if (returnErrors?.length) {
      return res.status(400).json({
         status: "fail",
         message: "Shopify rejected the return request",
         errors: returnErrors
      });
   }

   const shopifyReturn = data?.data?.returnRequest?.return;
   order.returns.push({
      return_id: shopifyReturn?.id || null,
      name: shopifyReturn?.name || null,
      status: shopifyReturn?.status || 'REQUESTED',
      requested_at: shopifyReturn?.createdAt || new Date(),
      line_items: localReturnLineItems
   });
   await order.save();

   await OrderTimeline.create({
      order_id: order.order_id,
      action: 'Return Requested',
      changes: { return_id: shopifyReturn?.id, line_items: localReturnLineItems },
      message: `Return ${shopifyReturn?.name || ''} requested`.trim()
   });

   res.status(200).json({
      status: "success",
      message: "Return requested",
      data: { return_id: shopifyReturn?.id, name: shopifyReturn?.name, status: shopifyReturn?.status || 'REQUESTED' }
   });
});

// Mobile app: customer re-orders a past order. Shopify has no dedicated
// "reorder" mutation - draftOrderCreateFromOrder duplicates the past order's
// line items/discounts/shipping into a new Draft Order, and we hand the
// customer its invoiceUrl (Shopify-hosted checkout) to actually pay. No
// payment details are stored/replayed here; the resulting real order
// appears via the existing orders/create webhook once they complete
// checkout, and shows up in GET /orders/customer/:customerId on its own.
exports.reorderCustomerOrder = catchAsync(async (req, res, next) => {
   const { customerId, orderId } = req.params;
   const cId = Number(customerId);

   if (isNaN(cId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid customer ID' });
   }

   const order = await Order.findOne({ "customer.id": cId, order_id: orderId });
   if (!order) {
      return next(new NotFoundError("Order not found or access denied"));
   }

   const { data } = await shopifyGraphql.post("", {
      query: DRAFT_ORDER_CREATE_FROM_ORDER_MUTATION,
      variables: { orderId: `gid://shopify/Order/${order.order_id}` }
   });

   const draftErrors = data?.data?.draftOrderCreateFromOrder?.userErrors;
   if (draftErrors?.length) {
      return res.status(400).json({
         status: "fail",
         message: "Shopify couldn't recreate this order",
         errors: draftErrors
      });
   }

   const draftOrder = data?.data?.draftOrderCreateFromOrder?.draftOrder;

   await OrderTimeline.create({
      order_id: order.order_id,
      action: 'Reorder Requested',
      changes: { draft_order_id: draftOrder?.id },
      message: `Reorder draft ${draftOrder?.name || ''} created`.trim()
   });

   res.status(200).json({
      status: "success",
      message: "Draft order created for reorder",
      data: {
         draft_order_id: draftOrder?.id,
         name: draftOrder?.name,
         invoice_url: draftOrder?.invoiceUrl,
         status: draftOrder?.status
      }
   });
});

// Live order tracking for the external customer app. Auth is a shared static
// API key (see middleware/trackingAuthMiddleware.js), not JWT - the caller
// has no account in this system, just the key.
exports.getOrderTracking = catchAsync(async (req, res, next) => {
   const { orderId } = req.params;

   const order = await Order.findOne({ order_id: orderId })
      .populate('assigned_agent')
      .select('order_id delivery_status shipping_address current_location assigned_agent agent_type')
      .lean();

   if (!order) {
      return next(new NotFoundError("Order not found"));
   }

   res.status(200).json({
      status: "success",
      data: {
         order_id: order.order_id,
         delivery_status: order.delivery_status,
         destination: {
            latitude: order.shipping_address?.latitude ?? null,
            longitude: order.shipping_address?.longitude ?? null,
         },
         current_location: order.current_location?.latitude != null ? order.current_location : null,
         agent: order.assigned_agent
            ? {
               name: order.assigned_agent.name,
               vehicle_type: order.assigned_agent.vehicle_type ?? null,
            }
            : null,
      }
   });
});

exports.getOrders = catchAsync(async (req, res, next) => {
   const page = parseInt(req.query.page) || 0;
   const limit = parseInt(req.query.limit) || 10;
   const skip = page * limit;
   const user = await User.findById(req.user?.id)?.populate('role');
   const { search, financial_status, sortBy, from_date, to_date, assigned_status, order_status } = req.query;

// Vendor role check removed to allow full order visibility for all dashboard users

   // Default sort
   let sort = { createdAt: -1 };
   if (req.query.sortBy) {
      sort = {};
      const sortParams = req.query.sortBy.split(',');
      sortParams.forEach(param => {
         const [field, order] = param.split(':');
         sort[field] = order === 'asc' ? 1 : -1;
      });
   }

   let filter = {
      deleted_at: { $in: [null, undefined] }
   };

   // search filter
   if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
         { order_number: regex },
         { 'customer.firstname': regex },
         { 'customer.lastname': regex }
      ];
   }

   // Financial status filter
   if (financial_status) {
      filter.financial_status = financial_status;
   }

   // Date Range Filter
   if (from_date || to_date) {
      filter.created_at = {};
      if (from_date) {
         filter.created_at.$gte = new Date(from_date);
      }
      if (to_date) {
         // Extend to end of the day or use accurate to_date
         const endDate = new Date(to_date);
         endDate.setHours(23, 59, 59, 999);
         filter.created_at.$lte = endDate;
      }
   }

   // Assigned Status Filter ('assigned' or 'unassigned')
   if (assigned_status === 'assigned') {
      filter.assigned_agent = { $ne: null };
   } else if (assigned_status === 'unassigned') {
      filter.assigned_agent = null;
   }

   // Order Status Filter (Mapping Pickup/Delivered/Pending to fulfillment_status)
   if (order_status) {
      if (order_status === 'Pickup') {
         filter.fulfillment_status = 'scheduled';
      } else if (order_status === 'Delivered') {
         filter.fulfillment_status = 'fulfilled';
      } else if (order_status === 'Pending') {
         filter.$or = [
            { fulfillment_status: null },
            { fulfillment_status: 'unfulfilled' },
            { fulfillment_status: { $exists: false } }
         ];
         filter.cancelled_at = null;
      } else if (order_status === 'Cancelled') {
         filter.cancelled_at = { $ne: null };
      }
   }

   // Fetch matching orders
   const orders = await Order.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('assigned_agent')
      .lean(); 

   const total = await Order.countDocuments(filter);

   // Remove line items filtering logic since vendor_name is removed
   const filteredOrders = orders;

   // Send response
   res.status(200).json({
      status: 'success',
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: filteredOrders,
   });
});

//create order
exports.createOrder = catchAsync(async (req, res, next) => {
   const order = req.body;
   const order_id = order.id ?? order.order_id;
   const orderExists = await Order.findOne({ order_id });

   if (orderExists?.deleted_at) return res.status(200).json({ status: "success", message: "update successfull" });

   // 1. Fetch fulfillment orders from Shopify (needed for both create and update)
   let fulfillmentOrder;
   try {
      const fulfillmentRes = await shopifyClient.get(`/orders/${order_id}/fulfillment_orders.json`);
      fulfillmentOrder = fulfillmentRes?.data?.fulfillment_orders?.[0];
   } catch (err) {
      console.error(`Error fetching fulfillment orders for ${order_id}:`, err.message);
   }

   // 2. Fetch product data (Images + Metafields) for all line items
   const productDataMap = {};
   const productIds = [...new Set(order.line_items.map(item => item.product_id).filter(Boolean))];

   await Promise.all(productIds.map(async productId => {
      try {
         const [productRes, metafieldRes] = await Promise.all([
            shopifyClient.get(`/products/${productId}.json`),
            shopifyClient.get(`/products/${productId}/metafields.json`)
         ]);

         const product = productRes?.data?.product;
         const primaryImage = product?.image?.src || (product?.images?.length > 0 ? product.images[0].src : null);
         const vendorIdMeta = metafieldRes?.data?.metafields?.find(mf => mf.key === "vendorid");
         const vendorMeta = metafieldRes?.data?.metafields?.find(mf => mf.key === "vendor");

         productDataMap[productId] = {
            vendor_id: vendorIdMeta?.value || null,
            vendor_name: vendorMeta?.value || null,
            image: primaryImage
         };
      } catch (err) {
         console.error(`Error fetching product data for ${productId}:`, err.message);
         productDataMap[productId] = { vendor_id: null, vendor_name: null, image: null };
      }
   }));

   // 3. Prepare line items with image and other metadata
   const consolidatedLineItems = order.line_items.map(item => {
      const productData = productDataMap[item.product_id] || {};
      const fulfillmentLineItem = fulfillmentOrder?.line_items?.find(line => line.line_item_id === item.id);
      return {
         id: item.id,
         name: item.name || null,
         price: item.price || null,
         product_id: item.product_id || null,
         sku: item.sku || null,
         total_discount: item.total_discount || 0,
         title: item.title || null,
         quantity: item.quantity || 0,
         variant_id: item.variant_id,
         vendor_name: item.vendor || productData.vendor_name,
         deleted_date: null,
         fulfillment_status: item.fulfillment_status || "",
         fulfillment_item_id: fulfillmentLineItem?.id || "",
         vendor_id: productData.vendor_id,
         image: productData.image
      };
   });

   if (orderExists) {
      // Update existing order
      orderExists.financial_status = order.financial_status;
      orderExists.fulfillment_status = (fulfillmentOrder?.status === 'scheduled') ? 'scheduled' : (order.fulfillment_status || "");
      orderExists.currency = order.currency;
      orderExists.delivery_amount = Number(order.shipping_lines?.[0]?.price || order.total_shipping_price_set?.shop_money?.amount || 0);
      orderExists.line_items = consolidatedLineItems; // Refresh line items with new data/images

      // Backfill geocoding only if it's still unset - avoids re-geocoding on
      // every webhook update (the address doesn't change after placement in
      // the common case) while self-healing an order whose initial geocode
      // attempt failed (bad key, transient error, quota hit).
      if (orderExists.shipping_address?.latitude == null) {
         const geocoded = await geocodeAddress(orderExists.shipping_address);
         if (geocoded) {
            orderExists.shipping_address.latitude = geocoded.latitude;
            orderExists.shipping_address.longitude = geocoded.longitude;
         }
      }

      const data = await orderExists.save();
      return res.status(200).json({ status: "success", message: "order updated successfully", data });
   }

   // Geocode the shipping address into destination coordinates for live
   // tracking. Fails silently (see utils/geocodeClient.js) - never blocks
   // order creation.
   const geocoded = await geocodeAddress(order.shipping_address);
   const shippingAddressWithCoords = {
      ...(order.shipping_address || {}),
      latitude: geocoded?.latitude ?? null,
      longitude: geocoded?.longitude ?? null,
   };

   // Create new order
   const newOrder = new Order({
      order_id: order_id || "",
      fulfillment_id: fulfillmentOrder?.id || "",
      cancel_reason: null,
      cancelled_at: null,
      created_at: order.created_at || new Date(),
      deleted_at: null,
      email: order.email || "",
      name: order.name || "",
      order_number: order.order_number || "",
      payment_gate_way: order.payment_gateway_names?.[0] || null,
      phone: order.phone || "",
      currency: order.currency || "",
      financial_status: order.financial_status || "",
      fulfillment_status: (fulfillmentOrder?.status === 'scheduled') ? 'scheduled' : (order.fulfillment_status || ""),
      total_discounts: order.total_discounts || 0,
      total_price: order.total_price || 0,
      total_tax: order.total_tax || 0,
      subtotal_price: order.subtotal_price || 0,
      delivery_amount: Number(order.shipping_lines?.[0]?.price || order.total_shipping_price_set?.shop_money?.amount || 0),
      shipping_address: shippingAddressWithCoords,
      customer: order.customer || {},
      line_items: consolidatedLineItems
   });

   await newOrder.save();

   await OrderTimeline.create({
      order_id: order_id,
      action: 'created',
      changes: newOrder,
      message: 'Order created'
   });

   res.status(200).json({ message: "New order created", data: newOrder });
});

//get all orders by id
exports.getOrderByVendor = catchAsync(async (req, res, next) => {
   const vendorId = req.params.id
   console.log("vendorId:",vendorId)
   const page = parseInt(req.query.page) || 1;
   const limit = parseInt(req.query.limit) || 10;
   const result = await getVendorOrders(vendorId, page, limit);
   res.status(200).json({ status: "success", message: "orders fetched successfully", data: result })
});

//update order
exports.updateOrder = catchAsync(async (req, res, next) => {
   console.log("edit")
   const orderEditPayload = req.body?.order_edit;
   
   // Track modification
   const order = await Order.findOne({ order_id: orderEditPayload?.order_id });
   const user = await User.findById(req.user.id);

   if (order) {
      order.modified_by = req.user.id;
      await order.save();
   }

   const response = await handleOrderEdit(orderEditPayload);
   await OrderTimeline.create({
      order_id: orderEditPayload?.order_id,
      action: 'updated',
      message: `Order updated by ${user?.name || 'Admin'}`
   });
   res.status(200).json({ status: "success", message: "Order updated successfully" });
});

//Cancell order
// OrderCancelReason enum, confirmed against the live store schema.
const VALID_CANCEL_REASONS = ['CUSTOMER', 'DECLINED', 'FRAUD', 'INVENTORY', 'STAFF', 'OTHER'];

exports.cancelOrder = catchAsync(async (req, res, next) => {
   const orderCancelPayload = req.body;
   const order = await Order.findOne({ order_id: orderCancelPayload.id });
   if (!order) throw new NotFoundError("Order not found");

   // Once an agent has picked it up (or it's already delivered/cancelled),
   // the order is physically out with the customer - cancelling at that
   // point would leave Shopify/inventory out of sync with a delivery that's
   // already happening. Block it here rather than only relying on Shopify's
   // own orderCancel rejection, since Shopify has no concept of our
   // delivery_status and would otherwise happily cancel a picked-up order.
   if (['Picked Up', 'Delivered', 'Cancelled'].includes(order.delivery_status)) {
      return res.status(400).json({
         status: "fail",
         message: `Order can't be cancelled once it's ${order.delivery_status}`
      });
   }

   const user = await User.findById(req.user.id);

   // Actually cancel the order in Shopify first - previously this endpoint
   // only ever updated the local Mongo record, so the "cancelled" status
   // shown here never matched the live Shopify order (inventory wasn't
   // restocked, Shopify-side reporting stayed wrong). Cancellation is
   // asynchronous on Shopify's side; the existing orders/updated webhook
   // (routed to createOrder) reconciles financial/fulfillment status once
   // Shopify's job finishes - no need to poll it here.
   const reason = VALID_CANCEL_REASONS.includes(orderCancelPayload.reason) ? orderCancelPayload.reason : 'OTHER';
   const { data: cancelData } = await shopifyGraphql.post("", {
      query: ORDER_CANCEL_MUTATION,
      variables: {
         orderId: `gid://shopify/Order/${order.order_id}`,
         reason,
         restock: !!orderCancelPayload.restock,
         notifyCustomer: !!orderCancelPayload.notify_customer,
         staffNote: orderCancelPayload?.cancel_reason || null
      }
   });

   const cancelErrors = cancelData?.data?.orderCancel?.orderCancelUserErrors;
   if (cancelErrors?.length) {
      return res.status(400).json({
         status: "fail",
         message: "Shopify rejected the cancellation",
         errors: cancelErrors
      });
   }

   order.cancelled_at = orderCancelPayload?.cancelled_at || new Date();
   order.cancel_reason = orderCancelPayload?.cancel_reason;
   order.financial_status = orderCancelPayload?.financial_status;
   order.modified_by = req.user.id; // Track modification
   const now = new Date();
   order.line_items = order.line_items.map(item => ({
      ...item,
      deleted_date: now
   }));
   order.current_location = undefined;
   await order.save();

   await OrderTimeline.create({
      order_id: order.order_id,
      action: 'cancelled',
      message: `Order cancelled by ${user?.name || 'Admin'}${order.cancel_reason ? ` (${order.cancel_reason})` : ''}`
   });

   const updatedOrder = await Order.findOne({ order_id: order.order_id }).populate('assigned_agent').lean();
   const timeline = await OrderTimeline.find({ order_id: order.order_id }).sort({ created_at: -1 });

   res.status(200).json({
      status: "success",
      message: "Order cancelled",
      data: {
         ...updatedOrder,
         timeline
      }
   });
})

exports.getOrderById = catchAsync(async (req, res, next) => {
   const orderId = req.params.id;
  
   // Fetch the order by ID
   const order = await Order.findById(orderId).populate('assigned_agent').lean();
   if (!order) {
      return next(new NotFoundError("Order not found"));
   }

   // Fetch removed line items
   const removedItems = await RemovedLineItem.find({ order_id: order.order_id }).lean();

   // Fetch timeline for this order
   const timeline = await OrderTimeline.find({ order_id: order.order_id }).sort({ createdAt: -1 }).lean();

   // Fetch user and check if vendor
   const user = await User.findById(req.user?.id).populate('role');
 

   // Vendor line item filtering removed to allow full order visibility for all dashboard users

   return res.status(200).json({
      status: "success",
      message: "Order details fetched successfully",
      data: {
         ...order,
         removed_line_items: removedItems,
         timeline,
      }
   });
});
 
exports.fulfilOrder = catchAsync(async (req, res, next) => {
   const lineItems = req.body?.line_items?.filter(item=> !item?.fulfillment_status)?.map(item => ({
      id: `gid://shopify/FulfillmentOrderLineItem/${item?.fulfillment_item_id}`,
      quantity: item?.quantity
   }));

   // Convert JS object to GraphQL input format
   const lineItemsString = JSON.stringify(lineItems).replace(/"([^"]+)":/g, '$1:');

   const mutation = `
     mutation FulfillSingleLineItem {
       fulfillmentCreateV2(fulfillment: {
         notifyCustomer: false,
         trackingInfo: {
           company: "My Shipping Company",
           number: "TRACKING_NUMBER",
           url: "https://tracking-url.com"
         },
         lineItemsByFulfillmentOrder: [
           {
             fulfillmentOrderId: "gid://shopify/FulfillmentOrder/${req.body?.fulfillment_id}",
             fulfillmentOrderLineItems: ${lineItemsString}
           }
         ]
       }) {
         fulfillment {
           id
           status
           trackingInfo {
             company
             number
             url
           }
         }
         userErrors {
           field
           message
         }
       }
     }
   `;

   try {
      const response = await axios.post(
         process.env.SHOPIFY_ADMIN_API,
         { query: mutation },
         {
            headers: {
               'Content-Type': 'application/json',
               'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
            }
         }
      );
      if(response?.data.data?.fulfillmentCreateV2?.userErrors?.length >0  || response?.data?.errors){
         return res.status(500).json({status:"failed",message:'The requested quantity is not available'})
      }

      const order = await Order.findOne({ order_id: req.body.order_id });
      const user = await User.findById(req.user.id);

      order.fulfillment_status = "Fulfilled"
      order.line_items = order.line_items?.map(item => ({ ...item, fulfillment_status: "Fulfilled" }));
      order.delivery_status = "Delivered"; // Ensure delivery_status is also updated
      order.modified_by = req.user.id; // Track modification

      // Auto-assignment for unassigned orders
      if (!order.assigned_agent) {
         order.assigned_agent = req.user.id;
         order.agent_type = 'User';
         order.assignment_date = new Date();
      }

      order.current_location = undefined;

      const data = await order.save();
      await OrderTimeline.create({
         order_id: order.order_id,
         action: 'Delivered',
         message: `Order marked as Delivered (Fulfilled) by ${user?.name || 'Admin'}`
      });
      res.status(201).json({
         status: "success",
         message: "Fulfillment successful",
         data: data
      });
   } catch (error) {
      console.error(error?.response?.data || error);
      res.status(500).json({
         status: "error",
         message: "Fulfillment failed",
         error: error?.response?.data || error.message
      });
   }
});

exports.fulfillSingleItem = catchAsync(async (req, res, next) => {
   const { fulfillment_id, fulfillment_item_id, quantity, order_id, title } = req.body;
   
   if (!fulfillment_id || !fulfillment_item_id || !quantity) {
     return res.status(400).json({
       status: 'fail',
       message: 'Missing required parameters (fulfillment_id, fulfillment_item_id, quantity)'
     });
   }
 
   const mutation = `
     mutation FulfillSingleItem {
       fulfillmentCreateV2(fulfillment: {
         notifyCustomer: false,
         trackingInfo: {
           company: "My Shipping Company",
           number: "TRACKING_NUMBER",
           url: "https://tracking-url.com"
         },
         lineItemsByFulfillmentOrder: [
           {
             fulfillmentOrderId: "gid://shopify/FulfillmentOrder/${fulfillment_id}",
             fulfillmentOrderLineItems: [
               {
                 id: "gid://shopify/FulfillmentOrderLineItem/${fulfillment_item_id}",
                 quantity: ${quantity}
               }
             ]
           }
         ]
       }) {
         fulfillment {
           id
           status
           trackingInfo {
             company
             number
             url
           }
         }
         userErrors {
           field
           message
         }
       }
     }
   `;
 
   try {
     const response = await axios.post(
       process.env.SHOPIFY_ADMIN_API,
       { query: mutation },
       {
         headers: {
           'Content-Type': 'application/json',
           'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
         }
       }
     );
 
     const { userErrors } = response?.data?.data?.fulfillmentCreateV2 || {};
 
     if (userErrors?.length > 0 || response?.data?.errors) {
       return res.status(500).json({
         status: 'failed',
         message: userErrors?.[0]?.message || 'Fulfillment error occurred',
         errors: userErrors
       });
     }
 
     // Optional: Update internal order DB
     const order = await Order.findOne({ order_id });
 
     if (order) {
       order.line_items = order.line_items?.map(item => {
         if (item.fulfillment_item_id?.toString() === fulfillment_item_id?.toString()) {
           return { ...item, fulfillment_status: 'Fulfilled' };
         }
         return item;
       });
 
       // Optional: Check if all items are now fulfilled
       const allFulfilled = order.line_items.every(item => item.fulfillment_status === 'Fulfilled');
       if (allFulfilled) {
         order.fulfillment_status = 'Fulfilled';
       }

       order.modified_by = req.user.id; // Track modification
        
       // Auto-assignment for unassigned orders
       if (!order.assigned_agent) {
          order.assigned_agent = req.user.id;
          order.agent_type = 'User';
          order.assignment_date = new Date();
       }
 
       const result = await order.save();
 
       await OrderTimeline.create({
         order_id: order.order_id,
         action: 'Fulfilled',
         message: `Line item ${title} fulfilled`
       });

       return res.status(201).json({
         status: 'success',
         message: 'Line item fulfilled successfully',
         data: result 
       });
     }
 
   } catch (error) {
     console.error('Fulfill single item error:', error?.response?.data || error);
     return res.status(500).json({
       status: 'error',
       message: 'Failed to fulfill line item',
       error: error?.response?.data || error.message
     });
   }
 });

exports.pickupOrder = catchAsync(async (req, res, next) => {
   const orderId = req.body.order_id || req.body.id;
   const order = await Order.findOne({ order_id: orderId });
   if (!order) throw new NotFoundError("Order not found");

   const user = await User.findById(req.user.id);

   order.fulfillment_status = "scheduled";
   order.delivery_status = "Picked Up";
   order.picked_up_at = new Date();
   order.modified_by = req.user.id; // Track modification

   // Auto-assignment for unassigned orders
   if (!order.assigned_agent) {
      order.assigned_agent = req.user.id;
      order.agent_type = 'User';
      order.assignment_date = new Date();
   }

   await order.save();

   await OrderTimeline.create({
      order_id: order.order_id,
      action: 'Picked Up',
      message: `Order marked as Picked Up (Scheduled) by ${user?.name || 'Admin'}`
   });

   // Match the structure of getOrderById for frontend consistency
   const updatedOrder = await Order.findOne({ order_id: orderId }).populate('assigned_agent').lean();
   const timeline = await OrderTimeline.find({ order_id: orderId }).sort({ created_at: -1 });

   res.status(200).json({
      status: "success",
      message: "Order marked as Picked Up",
      data: {
         ...updatedOrder,
         timeline
      }
   });
});

// Shopify `refunds/create` webhook receiver — public, no JWT, same as the
// order-create and product-delete receivers (Shopify webhook calls carry no
// bearer token). TODO: verify X-Shopify-Hmac-Sha256 instead of relying on
// obscurity, once a webhook signing secret is available (same gap noted on
// the product-delete receiver).
exports.refundOrderWebhook = catchAsync(async (req, res, next) => {
   const refund = req.body;
   const order_id = String(refund.order_id ?? '');

   const order = await Order.findOne({ order_id });
   if (!order) {
      // Shopify still expects a 200 or it will keep retrying the webhook.
      console.error(`Refund webhook: order ${order_id} not found`);
      return res.status(200).json({ status: "success", message: "order not found, ignored" });
   }

   const refund_id = String(refund.id ?? '');

   // Idempotency: Shopify may redeliver the same webhook.
   if (order.refunds?.some(r => r.refund_id === refund_id)) {
      return res.status(200).json({ status: "success", message: "refund already recorded" });
   }

   const amount = (refund.transactions || [])
      .reduce((sum, txn) => sum + (parseFloat(txn.amount) || 0), 0);

   const refundLineItems = (refund.refund_line_items || []).map(rli => {
      // Enrich with vendor info from the order's own line items, already
      // resolved from Shopify metafields at order-create time - avoids an
      // extra Shopify API round trip here.
      const orderLineItem = order.line_items.find(
         li => String(li.id) === String(rli.line_item_id)
      );
      return {
         line_item_id: String(rli.line_item_id ?? ''),
         quantity: rli.quantity || 0,
         title: rli.line_item?.title || orderLineItem?.title || null,
         sku: rli.line_item?.sku || orderLineItem?.sku || null,
         vendor_id: orderLineItem?.vendor_id || null,
         vendor_name: rli.line_item?.vendor || orderLineItem?.vendor_name || null,
         restock_type: rli.restock_type || null,
         subtotal: parseFloat(rli.subtotal) || 0,
         total_tax: parseFloat(rli.total_tax) || 0
      };
   });

   order.refunds.push({
      refund_id,
      created_at: refund.created_at || new Date(),
      note: refund.note || null,
      restock: !!refund.restock,
      amount,
      line_items: refundLineItems
   });
   order.total_refunded = (order.refunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);

   await order.save();

   await OrderTimeline.create({
      order_id,
      action: 'Refunded',
      changes: { refund_id, amount, line_items: refundLineItems },
      message: amount
         ? `Refund of ${amount} ${order.currency || ''} processed`.trim()
         : 'Refund processed'
   });

   res.status(200).json({ status: "success", message: "refund recorded", data: { order_id, refund_id, amount } });
});

// Shopify Return webhooks (returns/request, returns/approve, returns/decline,
// returns/close) - public, no JWT, same pattern/caveat as refundOrderWebhook
// above. NOTE: the exact payload field names below (admin_graphql_api_id,
// order_id, status, name) should be confirmed against a real Shopify test
// webhook delivery before relying on this in production - Shopify's Returns
// webhook payloads are less documented than the long-standing REST ones.
const findOrderByReturn = async (payload) => {
   const returnGid = payload.admin_graphql_api_id
      || (payload.id ? `gid://shopify/Return/${payload.id}` : null);
   if (returnGid) {
      const order = await Order.findOne({ "returns.return_id": returnGid });
      if (order) return { order, returnGid };
   }
   if (payload.order_id) {
      const order = await Order.findOne({ order_id: String(payload.order_id) });
      if (order) return { order, returnGid };
   }
   return { order: null, returnGid };
};

// returns/request - included in addition to approve/decline/close as a
// defensive catch-all: a return can also be created directly in Shopify
// admin/POS/storefront, bypassing our own requestOrderReturn endpoint. If we
// already recorded it ourselves (return_id already present), leave it alone
// instead of duplicating.
exports.returnRequestedWebhook = catchAsync(async (req, res, next) => {
   const payload = req.body;
   const { order, returnGid } = await findOrderByReturn(payload);
   if (!order) {
      console.error(`Return-requested webhook: order for return ${returnGid} not found`);
      return res.status(200).json({ status: "success", message: "order not found, ignored" });
   }

   if (order.returns.some(r => r.return_id === returnGid)) {
      return res.status(200).json({ status: "success", message: "return already recorded" });
   }

   order.returns.push({
      return_id: returnGid,
      name: payload.name || null,
      status: 'REQUESTED',
      requested_at: payload.created_at || new Date(),
      line_items: []
   });
   await order.save();

   await OrderTimeline.create({
      order_id: order.order_id,
      action: 'Return Requested',
      changes: { return_id: returnGid },
      message: `Return ${payload.name || ''} requested (via Shopify)`.trim()
   });

   res.status(200).json({ status: "success", message: "return recorded" });
});

// Shared status-transition handler for returns/approve, returns/decline and
// returns/close - each just maps to a different local status/timeline action.
const handleReturnStatusWebhook = async (req, res, { status, closesReturn, action, verb }) => {
   const payload = req.body;
   const { order, returnGid } = await findOrderByReturn(payload);
   if (!order) {
      console.error(`Return-${verb} webhook: order for return ${returnGid} not found`);
      return res.status(200).json({ status: "success", message: "order not found, ignored" });
   }

   const returnEntry = order.returns.find(r => r.return_id === returnGid);
   if (!returnEntry) {
      console.error(`Return-${verb} webhook: return ${returnGid} not found on order ${order.order_id}`);
      return res.status(200).json({ status: "success", message: "return not found, ignored" });
   }
   if (returnEntry.status === status) {
      return res.status(200).json({ status: "success", message: "already up to date" });
   }

   returnEntry.status = status;
   if (closesReturn) returnEntry.closed_at = payload.closed_at || new Date();
   await order.save();

   await OrderTimeline.create({
      order_id: order.order_id,
      action,
      changes: { return_id: returnGid, status },
      message: `Return ${returnEntry.name || ''} ${verb}`.trim()
   });

   res.status(200).json({ status: "success", message: `return ${verb}` });
};

exports.returnApprovedWebhook = catchAsync(async (req, res, next) =>
   handleReturnStatusWebhook(req, res, { status: 'OPEN', closesReturn: false, action: 'Return Approved', verb: 'approved' })
);

exports.returnDeclinedWebhook = catchAsync(async (req, res, next) =>
   handleReturnStatusWebhook(req, res, { status: 'DECLINED', closesReturn: false, action: 'Return Declined', verb: 'declined' })
);

exports.returnClosedWebhook = catchAsync(async (req, res, next) =>
   handleReturnStatusWebhook(req, res, { status: 'CLOSED', closesReturn: true, action: 'Return Closed', verb: 'closed' })
);

exports.deleteOrder = catchAsync(async(req,res,next)=>{
   const id = req.body.id
   const order = await Order.findOne({order_id:id});
   if(!order)throw new NotFoundError("order not found");
   order.deleted_at = new Date(); 
   await order.save();

   res.status(200).json({
      status: "success",
      message: "Order deleted successfully",
      data: {
         order_id: id,
         deleted_at: order.deleted_at
      }
   });
})
 

