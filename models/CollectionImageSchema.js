const mongoose = require("mongoose");

const CollectionImageSchema = new mongoose.Schema(
  {
    collectionId: {
      type: Number, 
      required: [true, "collectionId is required"],
      index: true,
    },
    image: {
      type: String, 
      required: [true, "image is required"],
      trim: true,
    },
    collection_name:{
      type: String,
      required:[true,"Collection name is required"]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CollectionImage", CollectionImageSchema);
