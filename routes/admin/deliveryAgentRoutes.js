const express = require('express');
const router = express.Router();
const deliveryAgentController = require('../../controllers/deliveryAgentController');
const { authenticate } = require('../../middleware/authMiddleware');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { uploadAgentAvatar } = require('../../middleware/uploadMiddleware');
const validateMiddleware = require('../../utils/validate');
const { createAgentSchema, updateAgentSchema } = require('../../validations/deliveryAgentValidation');

// uploadAgentAvatar runs before validateMiddleware - multer parses the
// multipart/form-data body into req.body first, which validateMiddleware
// then needs to actually validate against.
router.post('/create', authenticate, requirePermission('Delivery Agent Add'), uploadAgentAvatar.single('avatar'), validateMiddleware(createAgentSchema), deliveryAgentController.createAgent);
router.get('/list', authenticate, requirePermission('Delivery Agent List'), deliveryAgentController.getAgents);
router.put('/update/:id', authenticate, requirePermission('Delivery Agent Update'), uploadAgentAvatar.single('avatar'), validateMiddleware(updateAgentSchema), deliveryAgentController.updateAgent);
router.put('/update-password/:id', authenticate, requirePermission('Delivery Agent Password Update'), deliveryAgentController.updateAgentPassword);
router.delete('/delete/:id', authenticate, requirePermission('Delivery Agent Delete'), deliveryAgentController.deleteAgent);
router.post('/assign-order', authenticate, requirePermission('Delivery Agent Update'), deliveryAgentController.assignAgentToOrder);
router.get('/details/:id', authenticate, requirePermission('Delivery Agent List'), deliveryAgentController.getAgentDetails);

module.exports = router;
