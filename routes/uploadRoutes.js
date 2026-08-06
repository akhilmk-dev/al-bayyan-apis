// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const { uploadBase64Image } = require('../controllers/uploadController');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/upload-base64', authenticate, uploadBase64Image);

module.exports = router;
