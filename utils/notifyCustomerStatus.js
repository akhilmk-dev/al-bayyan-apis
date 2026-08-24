const { sendCustomerNotification } = require('./sendNotification');

// Notifies the customer's mobile app when their order reaches one of these
// milestones. Deep-link scheme uses the customer app's bundle ID
// (com.albayan) - mirrors the staff app's com.albayan_staffapp://OrderDetail/
// convention, but the exact screen/route name (`OrderDetail`) is a guess
// based on that convention, not confirmed against the actual customer app's
// navigation - confirm/adjust with whoever owns that codebase.
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
    { id: order._id.toString(), order_id: order.order_id, type: 'order_status', status },
    `com.albayan://OrderDetail/${order._id.toString()}`
  );
};

module.exports = notifyCustomerStatus;
