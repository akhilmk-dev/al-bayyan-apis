const axios = require('axios');

// Converts a Shopify shipping_address object into { latitude, longitude } via
// the Google Maps Geocoding API. Never throws - a geocoding hiccup (bad/missing
// key, network error, no match) must never block order ingestion, mirroring the
// fail-silent pattern already used for Shopify calls in orderController.js.
const geocodeAddress = async (shippingAddress) => {
  try {
    if (!shippingAddress) return null;
    if (!process.env.GOOGLE_MAPS_API_KEY) return null;

    const addressParts = [
      shippingAddress.address1,
      shippingAddress.address2,
      shippingAddress.city,
      shippingAddress.country,
    ].filter(Boolean);

    if (addressParts.length === 0) return null;

    const address = addressParts.join(', ');

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: process.env.GOOGLE_MAPS_API_KEY },
      timeout: 10000,
    });

    if (response.data?.status !== 'OK' || !response.data?.results?.length) {
      console.error('Geocoding failed:', response.data?.status, response.data?.error_message);
      return null;
    }

    const location = response.data.results[0].geometry?.location;
    if (!location) return null;

    return { latitude: location.lat, longitude: location.lng };
  } catch (err) {
    console.error('Geocoding error:', err.message);
    return null;
  }
};

module.exports = { geocodeAddress };
