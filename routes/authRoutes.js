const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validateMiddleware = require('../utils/validate');
const userLoginSchema = require('../validations/loginValidation');

router.post('/login',validateMiddleware(userLoginSchema), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout',authController.logout);

module.exports = router;
