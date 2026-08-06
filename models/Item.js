const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, "type is required"],
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    data: {
      type: String,
      required: [true, "data is required"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", ItemSchema);
