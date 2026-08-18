const express = require('express');
const settingsController = require('../../controllers/settingsController');
const { authenticate } = require('../../middleware/authMiddleware');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { settingsSchema } = require('../../validations/settingsValidation');
const validateMiddleware = require('../../utils/validate');

const router = express.Router();

router.get('/', authenticate, requirePermission('Settings View'), settingsController.getSettings);
router.put('/', authenticate, requirePermission('Settings Update'), validateMiddleware(settingsSchema), settingsController.updateSettings);

module.exports = router;
