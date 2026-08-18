const mongoose = require('mongoose');

const agentEarningSchema = new mongoose.Schema({
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent', required: true },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  amount: { type: Number, required: true },
  delivered_at: { type: Date, required: true },
}, { timestamps: true });

agentEarningSchema.index({ agent_id: 1, delivered_at: -1 });

module.exports = mongoose.model('AgentEarning', agentEarningSchema);
