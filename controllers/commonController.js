const shopifyClient = require("../utils/shopifyClient");

const getAllLocations = async (req, res) => {
  try {
    const response = await shopifyClient.get("/locations.json");

    return res.status(200).json({
      message: "Locations fetched successfully",
      data: response.data.locations
    });

  } catch (error) {
    console.error("Error fetching locations:", error?.response?.data || error);
    return res.status(500).json({
      message: "Failed to fetch locations"
    });
  }
};

module.exports = { getAllLocations };
