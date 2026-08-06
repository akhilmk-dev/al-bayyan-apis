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
  password: { type: String, required: [true, "Password is required"] },
  vehicle_type: { 
    type: String, 
    required: [true, "Vehicle type is required"],
    enum: ['bike', 'car', 'van', 'other']
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  avatar: { type: String },
  otp: { type: Number },
  otp_expiry: { type: Date },
  is_verified: { type: Boolean, default: false },
  otp_method: { type: String, enum: ['email', 'mobile'], default: null },
  refresh_token: { type: String }
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
