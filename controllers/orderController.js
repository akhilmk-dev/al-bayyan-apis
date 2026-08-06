
const { handleOrderEdit, getVendorOrders } = require('../helper/orderHelper');
const Order = require('../models/Order');
const catchAsync = require('../utils/catchAsync');
const axios = require('axios');
const shopifyClient = require('../utils/shopifyClient');
const { NotFoundError } = require('../utils/customErrors');
const RemovedLineItem = require('../models/RemovedLineItem');
const OrderTimeline = require('../models/OrderTimeline');
const User = require('../models/User');

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
      
      const data = await orderExists.save();
      return res.status(200).json({ status: "success", message: "order updated successfully", data });
   }

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
      shipping_address: order.shipping_address || {},
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
exports.cancelOrder = catchAsync(async (req, res, next) => {
   const orderCancelPayload = req.body;
   const order = await Order.findOne({ order_id: orderCancelPayload.id });
   const user = await User.findById(req.user.id);

   order.cancelled_at = orderCancelPayload?.cancelled_at;
   order.cancel_reason = orderCancelPayload?.cancel_reason;
   order.financial_status = orderCancelPayload?.financial_status;
   order.modified_by = req.user.id; // Track modification
   const now = new Date();
   order.line_items = order.line_items.map(item => ({
      ...item,
      deleted_date: now
   }));
   const data = await order.save();
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
 

