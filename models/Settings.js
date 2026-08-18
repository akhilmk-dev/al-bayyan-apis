const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  delivery_earning_rate: { type: Number, required: true, min: 0, default: 0 },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

settingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
