const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  agent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAgent',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  data: {
    type: Object, // Stores deep link mapping, order ids, routing parameters
    default: {},
  },
  is_read: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

// Create index for faster queries since notifications are usually fetched by agent
notificationSchema.index({ agent_id: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
