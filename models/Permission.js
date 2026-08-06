// models/Permission.js
const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  permission_name: { type: String, required: [true,"permission name is required"],unique:true },
  page_url: { type: String, required: [true,"page url is required"] },
  group: { type: String, required: [true,"group is required"]},
}, { timestamps: true });

module.exports = mongoose.model('Permission', permissionSchema);
