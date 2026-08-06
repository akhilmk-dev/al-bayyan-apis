const axios = require("axios");

const shopifyGraphql = axios.create({
  baseURL: `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-10/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
    "Content-Type": "application/json"
  }
});

module.exports = shopifyGraphql;
