const axios = require("axios");

// Shopify credentials are optional at boot time so the rest of the API
// (auth, users, roles, permissions) can run before a Shopify store is
// connected. Any request made through this client will fail naturally
// (bad baseURL / 401) if the credentials are still unset, which is
// handled by the normal catchAsync/errorHandler request-error path.
const shopifyClient = axios.create({
  baseURL: `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-10`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
    "Content-Type": "application/json"
  },
  timeout: 15000
});

module.exports = shopifyClient;
