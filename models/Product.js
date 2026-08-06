const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  shopifyId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  price: { type: Number },
  vendor_name: { type: String },
  // Save multiple collection IDs
  collectionIds: { 
    type: [String], 
    default: [] 
  },
  // Save total stock of all variants combined
  stock: { 
    type: Number, 
    default: 0 
  }
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
