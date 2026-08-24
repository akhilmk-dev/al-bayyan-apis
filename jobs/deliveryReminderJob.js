const cron = require('node-cron');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const OrderTimeline = require('../models/OrderTimeline');
const { sendNotification } = require('../utils/sendNotification');

// Reminds an agent if an assignment has sat in 'pending_acceptance' longer
// than Settings.assignment_reminder_minutes (admin-configurable, default 15).
// Fires at most once per assignment cycle - reminder_sent_at is reset to
// null on every (re)assignment in assignAgentToOrder.
const checkStaleAssignments = async () => {
  try {
    const settings = await Settings.getSingleton();
    const thresholdMs = (settings.assignment_reminder_minutes || 15) * 60 * 1000;
    const staleOrders = await Order.find({
      assignment_status: 'pending_acceptance',
      reminder_sent_at: null,
      assignment_date: { $lte: new Date(Date.now() - thresholdMs) }
    });

    for (const order of staleOrders) {
      await sendNotification(
        order.assigned_agent.toString(),
        'Order awaiting your response ⏰',
        `Order #${order.order_number || order.order_id} is still awaiting your acceptance.`,
        { id: order._id.toString(), order_id: order.order_id, type: 'assignment_reminder' },
        `com.albayyan_staffapp://OrderDetail/${order._id.toString()}`
      );
      order.reminder_sent_at = new Date();
      await order.save();
      await OrderTimeline.create({
        order_id: order.order_id,
        action: 'Reminder Sent',
        message: 'Agent reminded to accept assignment'
      });
    }
  } catch (err) {
    console.error('[deliveryReminderJob] failed:', err.message);
  }
};

const start = () => {
  cron.schedule('*/5 * * * *', checkStaleAssignments);
};

module.exports = { start };
