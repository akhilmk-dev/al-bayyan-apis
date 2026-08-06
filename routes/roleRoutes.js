const express = require('express');
const roleController = require('../controllers/roleController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { roleSchema } = require('../validations/roleValidation');
const validateMiddleware = require('../utils/validate');

const router = express.Router();

router.post('/',authenticate,requirePermission('Add Role'),validateMiddleware(roleSchema), roleController.createRole);
router.get('/',authenticate,requirePermission('List Role'), roleController.getRoles);
router.get('/:id',authenticate,requirePermission('List Role'), roleController.getRoleById);
router.put('/:id',authenticate,requirePermission('Edit Role'),validateMiddleware(roleSchema), roleController.updateRole);
router.delete('/:id',authenticate,requirePermission('Delete Role'), roleController.deleteRole);

module.exports = router;
