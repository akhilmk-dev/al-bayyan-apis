const { sendCustomerNotification } = require('./sendNotification');
const Notification = require('../models/Notification');

// Notifies the customer's mobile app when their order reaches one of these
// milestones. Deep-link scheme uses the customer app's bundle ID
// (com.albayan) - screen/route name is `OrderHistory`, confirmed against the
// actual customer app's navigation.
const STATUS_COPY = {
  'Picked Up': {
    title: 'Order picked up 🛵',
    message: (order) => `Your order #${order.order_number || order.order_id} is on its way!`
  },
  'Delivered': {
    title: 'Order delivered ✅',
    message: (order) => `Your order #${order.order_number || order.order_id} has been delivered. Enjoy!`
  },
  'Cancelled': {
    title: 'Order cancelled',
    message: (order) => `Your order #${order.order_number || order.order_id} has been cancelled.`
  }
};

const notifyCustomerStatus = async (order, status) => {
  if (!order.customer?.id) return; // no customer id on this order, nothing to target
  const copy = STATUS_COPY[status];
  if (!copy) return;

  const title = copy.title;
  const message = copy.message(order);
  // order_id (Shopify) - not the Mongo _id - is what the customer app's own
  // detail/invoice/return/reorder endpoints all key on
  // (GET /orders/customer/:customerId/:orderId etc.), so that's the id the
  // deep link and payload need to carry for the app to fetch order details.
  const data = { order_id: order.order_id, type: 'order_status', status };

  await sendCustomerNotification(
    order.customer.id.toString(),
    title,
    message,
    data,
    `com.albayan://OrderHistory/${order.order_id}`
  );

  // Save notification to database, same as agent notifications
  await Notification.create({
    customer_id: order.customer.id,
    title,
    message,
    data,
    is_read: false
  });
};

module.exports = notifyCustomerStatus;
