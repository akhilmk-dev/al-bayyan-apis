const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  role_name: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true,
  },
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission',
    required:[true,"permission is required"]
  }],
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
