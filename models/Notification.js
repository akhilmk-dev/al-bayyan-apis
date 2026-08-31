const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Exactly one of agent_id/customer_id is set, depending on recipient.
  // customer_id is a plain Number (the Shopify customer id) since there's no
  // separate Customer collection in this app - customer data only ever lives
  // embedded on Order documents (see Order.customer.id).
  agent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAgent',
    default: null,
  },
  customer_id: {
    type: Number,
    default: null,
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
notificationSchema.index({ customer_id: 1, createdAt: -1 });

notificationSchema.pre('validate', function (next) {
  if (!this.agent_id && this.customer_id == null) {
    return next(new Error('Notification requires either agent_id or customer_id'));
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
