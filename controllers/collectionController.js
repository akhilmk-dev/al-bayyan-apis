// controllers/shopifyController.js
const shopifyClient = require("../utils/shopifyClient");

const getShopifyCategories = async (req, res) => {
  try {
    const response = await shopifyClient.get("/custom_collections.json");

    return res.status(200).json({
      status: "success",
      data: response.data.custom_collections || []
    });

  } catch (error) {
    console.error("Error fetching categories:", error.response?.data || error.message);

    return res.status(error.response?.status || 500).json({
      error: "Failed to fetch Shopify categories",
      details: error.response?.data || error.message
    });
  }
};

module.exports = { getShopifyCategories };
