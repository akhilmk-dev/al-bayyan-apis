
const express = require('express');
const { getAllLocations } = require('../controllers/commonController');
const router = express.Router();

// POST /api/products
router.get("/location/all",getAllLocations);

module.exports = router;
