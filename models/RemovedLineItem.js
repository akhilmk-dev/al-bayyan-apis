// models/RemovedLineItem.js
const mongoose = require('mongoose');

const RemovedLineItemSchema = new mongoose.Schema({
  order_id: { type: String, required: true }, 
  line_item_id: { type: String, required: true },
  name: String,
  price: Number,
  quantity: Number,
  sku: String,
  product_id: String,
  variant_id: String,
  title: String,
  vendor_id: String,
  vendor_name: String,
  removed_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RemovedLineItem', RemovedLineItemSchema);
