
const express = require('express');
const { getShopifyCategories } = require('../controllers/collectionController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { createCollectionImage, updateCollectionImage, deleteCollectionImage, getCollectionImages, getCollectionImage } = require('../controllers/collectionImageController');
const router = express.Router();

// POST /api/products
router.get("/", authenticate,getShopifyCategories);
router.get("/collection-images",authenticate,requirePermission('Collection Image View'),getCollectionImages)
router.post("/collection-images",authenticate,requirePermission('Collection Image Add'),createCollectionImage);
router.get("/collection-images/:id",authenticate,requirePermission('Collection Image View'),getCollectionImage);
router.put("/collection-images/:id",authenticate,requirePermission('Collection Image Edit'),updateCollectionImage);
router.delete("/collection-images/:id",authenticate,requirePermission('Collection Image Delete'),deleteCollectionImage);

module.exports = router;
