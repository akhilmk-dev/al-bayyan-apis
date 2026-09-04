const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, "name is required"] },
  email: { type: String, required: [true, "email is required"], unique: true },
  // select: false - never returned by a normal query, so it can't leak
  // through login/profile/list responses. Fetch it explicitly with
  // .select('+password') only where actually needed - login.
  password: { type: String, required: [true, "password is required"], select: false },
  mobile: { type: String, required: [true, "mobile number is required"] },
  whatsapp_number: {type: String, required:[true,"whatsapp number is required"]},
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  store_name: {type:String},
  business_name: {type:String},
  id_proof_number: String,
  id_proof_file: String,
  tl_number: String,
  vat_number: String,
  corporate_address: String,
  bank_name: String,
  bank_branch: String,
  account_name: String,
  account_number: String,
  iban: String,
  refresh_token: { type: String, select: false }
}, { timestamps: true });

userSchema.pre('validate', async function (next) {
  const user = this;
  const Role = mongoose.model('Role'); 
  const role = await Role.findById(user.role);
  if (role && role?.role_name?.toLowerCase() === 'vendor') {
    const requiredFields = [
      'store_name',
      'business_name',
      'id_proof_number',
      'id_proof_file',
      'tl_number',
      'vat_number',
      'corporate_address',
      'bank_name',
      'bank_branch',
      'account_name',
      'account_number',
      'iban'
    ];
    for (const field of requiredFields) {
      if (!user[field]) {
        user.invalidate(field, `${field.replace(/_/g, ' ')} is required`);
      }
    }
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
