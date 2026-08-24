const { sendCustomerNotification } = require('./sendNotification');

// Notifies the customer's mobile app when their order reaches one of these
// milestones. No deep-link appUrl is passed - the customer app's URL scheme
// isn't known to this backend (that app isn't in this workspace), so only
// `data` is sent for the app team to wire up deep-linking themselves.
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

  await sendCustomerNotification(
    order.customer.id.toString(),
    copy.title,
    copy.message(order),
    { id: order._id.toString(), order_id: order.order_id, type: 'order_status', status }
  );
};

module.exports = notifyCustomerStatus;
