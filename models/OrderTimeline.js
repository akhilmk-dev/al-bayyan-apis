const mongoose = require('mongoose');

const orderTimelineSchema = new mongoose.Schema({
  order_id: { type: String, required: true }, 
  action: {
    type: String,
    enum: ['created', 'updated', 'cancelled', 'deleted','Fulfilled',"MarkAsPaid", 'Assigned', 'Picked Up', 'Delivered', 'Reassigned', 'Accepted', 'Rejected', 'Refunded', 'Return Requested', 'Return Approved', 'Return Declined', 'Return Canceled', 'Return Closed', 'Reorder Requested', 'Reminder Sent'],
    required: true
  },
  timestamp: { type: Date, default: Date.now },
  performed_by: { type: String, default: 'system' },
  changes: { type: Object, default: {} },
  message: { type: String }
});

module.exports = mongoose.model('OrderTimeline', orderTimelineSchema);
