const express = require('express');
const { createProduct, getProducts, deleteProduct, getProductById, updateProduct, shopifyProductDeleteWebhook, updateVariantQuantity, updateVariantPrice, getDashboardStats, createProductAndPublishToMarkets, getMarkets, getProvinces } = require('../controllers/productController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const router = express.Router();

// POST /api/products
router.post("/",authenticate,requirePermission('Product Add'), createProductAndPublishToMarkets);
router.get("/", getProducts);
router.get("/market/All",authenticate,getMarkets);
router.get("/province/all",authenticate,getProvinces);
router.delete('/delete/:productId',authenticate,requirePermission('Product Delete'), deleteProduct);
router.get('/:productId',authenticate,requirePermission('Product List'), getProductById);
router.put('/update/:productId',authenticate,requirePermission('Product Edit'), updateProduct);
// Shopify webhook receiver — real Shopify webhook calls carry no bearer JWT, so this
// must stay public. TODO: verify Shopify's X-Shopify-Hmac-Sha256 signature instead of
// relying on obscurity, once a webhook signing secret is available.
router.post('/product-delete', shopifyProductDeleteWebhook);
router.put("/:productId/variant/:variantId/quantity",authenticate,requirePermission('Product Edit'),  updateVariantQuantity);
router.put("/:productId/variant/:variantId/price",authenticate,requirePermission('Product Edit'),  updateVariantPrice);
router.put("/variant/:variantId/quantity",authenticate,requirePermission('Product Edit'),  updateVariantQuantity);
router.put("/variant/:variantId/price",authenticate,requirePermission('Product Edit'),  updateVariantPrice);
router.get("/dashboard/stats",authenticate,requirePermission('Dashboard'),getDashboardStats);

module.exports = router
