const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deliveryAgentSchema = new mongoose.Schema({
  name: { type: String, required: [true, "Name is required"] },
  email: { type: String, required: [true, "Email is required"], unique: true },
  mobile: { 
    type: String, 
    required: [true, "Mobile number is required"], 
    unique: true,
    match: [/^\d{10}$/, "Mobile number must be exactly 10 digits"]
  },
  // select: false - never returned by a normal query/toObject(), so it can't
  // leak through profile/list/details responses (formatAgent etc. spread the
  // whole document). Fetch it explicitly with .select('+password') only
  // where actually needed - login, changePasswordAgent.
  password: { type: String, required: [true, "Password is required"], select: false },
  vehicle_type: { 
    type: String, 
    required: [true, "Vehicle type is required"],
    enum: ['bike', 'car', 'van', 'other']
  },
  // Admin-controlled account enable/disable flag - distinct from is_online
  // below, which the agent controls themselves from the app.
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  // Agent-controlled online/offline toggle ("go online"/"go offline" in the
  // app) - used to filter down to currently-available agents, separate from
  // the admin's active/inactive account status above.
  is_online: { type: Boolean, default: false },
  avatar: { type: String },
  // select: false on the internal/sensitive fields below too - none of these
  // are meant to ever be returned to a client.
  otp: { type: Number, select: false },
  otp_expiry: { type: Date, select: false },
  is_verified: { type: Boolean, default: false },
  otp_method: { type: String, enum: ['email', 'mobile'], default: null },
  refresh_token: { type: String, select: false }
}, { timestamps: true });

// Hash password before saving
deliveryAgentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
deliveryAgentSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('DeliveryAgent', deliveryAgentSchema);
