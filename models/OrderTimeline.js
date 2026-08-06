const mongoose = require('mongoose');

const orderTimelineSchema = new mongoose.Schema({
  order_id: { type: String, required: true }, 
  action: {
    type: String,
    enum: ['created', 'updated', 'cancelled', 'deleted','Fulfilled',"MarkAsPaid", 'Assigned', 'Picked Up', 'Delivered', 'Reassigned'],
    required: true
  },
  timestamp: { type: Date, default: Date.now },
  performed_by: { type: String, default: 'system' },
  changes: { type: Object, default: {} },
  message: { type: String }
});

module.exports = mongoose.model('OrderTimeline', orderTimelineSchema);
