const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  id: {type: String},
  name: { type: String },
  price: { type: Number },
  product_id: {type: String },
  sku: { type: String },
  total_discount: { type: Number, default: 0 },
  title: { type: String },
  quantity: { type: Number },
  variant_id: { type:String },
  vendor_name: { type: String },
  fulfillment_item_id:{type:String},
  fulfillment_status: {type:String},
  deleted_date:{type:String},
  vendor_id: { type: String },
  image: { type: String }
}, { _id: true });

// One entry per Shopify `refunds/create` webhook event. Append-only - a
// second partial refund on the same order adds a new entry rather than
// merging into the first, mirroring how Shopify itself keeps refunds as
// separate records under an order.
const refundLineItemSchema = new mongoose.Schema({
  line_item_id: { type: String },
  quantity: { type: Number },
  title: { type: String },
  sku: { type: String },
  vendor_id: { type: String },
  vendor_name: { type: String },
  restock_type: { type: String },
  subtotal: { type: Number, default: 0 },
  total_tax: { type: Number, default: 0 }
}, { _id: false });

const refundSchema = new mongoose.Schema({
  refund_id: { type: String },
  created_at: { type: Date },
  note: { type: String, default: null },
  restock: { type: Boolean, default: false },
  amount: { type: Number, default: 0 },
  line_items: [refundLineItemSchema]
}, { _id: false });

// One entry per Shopify Return (requestReturn from the mobile app, or a
// return created directly in Shopify) - status moves REQUESTED -> OPEN
// (approved) or DECLINED, then eventually CLOSED, synced in via the
// returns/request|approve|decline|close webhooks.
const returnLineItemSchema = new mongoose.Schema({
  fulfillment_line_item_id: { type: String },
  line_item_id: { type: String },
  quantity: { type: Number },
  title: { type: String },
  sku: { type: String },
  vendor_id: { type: String },
  vendor_name: { type: String },
  return_reason: { type: String },
  return_reason_note: { type: String, default: null }
}, { _id: false });

const returnSchema = new mongoose.Schema({
  return_id: { type: String },
  name: { type: String },
  status: { type: String, enum: ['REQUESTED', 'OPEN', 'DECLINED', 'CANCELED', 'CLOSED'], default: 'REQUESTED' },
  requested_at: { type: Date },
  closed_at: { type: Date, default: null },
  // Only set when status is DECLINED - carried here (not just OrderTimeline)
  // so the mobile app can read the rejection reason directly off the order.
  decline_reason: { type: String, default: null },
  decline_note: { type: String, default: null },
  declined_at: { type: Date, default: null },
  line_items: [returnLineItemSchema]
}, { _id: false });

const orderSchema = new mongoose.Schema({
  order_id: { type: String, unique: true },
  fulfillment_id:{type:String},
  cancel_reason: { type: String, default: null },
  cancelled_at: { type: Date, default: null },
  contact_email: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: {type:Date, default: Date.now},
  email: { type: String },
  name: { type: String },
  order_number: { type: String },
  payment_gate_way: { type: String },
  phone: { type: String },
  currency: {type: String},
  financial_status: {type:String},
  fulfillment_status: {type:String},
  total_discounts: { type: Number, default: 0 },
  total_price: { type: Number },
  total_tax: { type: Number, default: 0 },
  subtotal_price: {type:Number,default:0},
  delivery_amount: { type: Number, default: 0 },
  shipping_address:{type: String},
  customer: {type:String},
  deleted_at:{type:String},
  shipping_address:{
    first_name: { type: String },
    last_name: { type: String },
    address1: { type: String },
    address2: { type: String, default: null },
    company: { type: String, default: null },
    phone: { type: String },
    city: { type: String },
    country: { type: String },
    country_code: { type: String },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  customer: {
    id: { type: Number },
    created_at: { type: Date },
    first_name: { type: String },
    last_name: { type: String },
    email: { type: String },
    currency: { type: String },
    default_address: {
      id: { type: Number },
      first_name: { type: String },
      last_name: { type: String },
      address1: { type: String },
      address2: { type: String, default: null },
      city: { type: String },
      country: { type: String },
      country_code: { type: String },
      phone: { type: String }
    }
  },
  line_items: [lineItemSchema],
  assigned_agent: { type: mongoose.Schema.Types.ObjectId, refPath: 'agent_type', default: null },
  agent_type: { type: String, enum: ['DeliveryAgent', 'User'], default: 'DeliveryAgent' },
  modified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignment_date: { type: Date, default: null },
  delivery_status: { type: String, enum: ['Pending', 'Picked Up', 'Delivered', 'Cancelled'], default: 'Pending' },
  // Tracks the current assignment's accept/reject handshake, independent of
  // delivery_status. Accepting moves delivery_status straight to 'Picked Up'
  // (no separate manual pickup step); rejecting clears the assignment.
  assignment_status: { type: String, enum: ['pending_acceptance', 'accepted', 'rejected'], default: null },
  // Set once jobs/deliveryReminderJob.js pings the agent about a stale
  // pending_acceptance assignment, so it only fires once per assignment
  // cycle. Reset to null on every (re)assignment in assignAgentToOrder.
  reminder_sent_at: { type: Date, default: null },
  // Persistent history of agents who rejected this order, so they're excluded
  // from being reassigned to it again. Accumulates across reassignment cycles.
  rejected_agents: [{
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },
    reason: { type: String },
    rejected_at: { type: Date, default: Date.now }
  }],
  picked_up_at: { type: Date, default: null },
  delivered_at: { type: Date, default: null },
  // OTP verification required before an agent can mark an order Delivered -
  // generated and emailed to the customer when the agent requests it.
  delivery_otp: { type: String, default: null },
  delivery_otp_expiry: { type: Date, default: null },
  current_location: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    updated_at: { type: Date, default: null }
  },
  // Populated from the Shopify `refunds/create` webhook. financial_status
  // (partially_refunded/refunded) still comes from the regular orders/updated
  // sync - this just adds the structured "what/how much" detail Shopify's
  // order-level fields don't carry.
  refunds: [refundSchema],
  total_refunded: { type: Number, default: 0 },
  returns: [returnSchema]
});

module.exports = mongoose.model('Order', orderSchema);
