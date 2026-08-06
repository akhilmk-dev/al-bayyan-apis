// routes/permissionRoutes.js
const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const validateMiddleware = require('../utils/validate');
const permissionSchema = require('../validations/permissionValidation');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

router.post('/', authenticate, requirePermission('Permission Add'), validateMiddleware(permissionSchema), permissionController.createPermission);
router.get('/', authenticate, requirePermission('Permission List'), permissionController.getPermissions);
router.get('/:id', authenticate, requirePermission('Permission List'), permissionController.getPermissionById);
router.put('/:id', authenticate, requirePermission('Permission Edit'), validateMiddleware(permissionSchema), permissionController.updatePermission);
router.delete('/:id', authenticate, requirePermission('Permission Delete'), permissionController.deletePermission);

module.exports = router;
