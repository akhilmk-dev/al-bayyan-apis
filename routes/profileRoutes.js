const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController')
const { authenticate } = require('../middleware/authMiddleware');

router.put('/changepassword',authenticate, profileController.changePassword);
router.get('/',authenticate, profileController.getProfile);

module.exports = router;