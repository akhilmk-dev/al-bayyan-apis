const express = require('express');
const router = express.Router();
const deliveryAgentController = require('../../controllers/deliveryAgentController');
const { authenticate } = require('../../middleware/authMiddleware');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { uploadAgentAvatar } = require('../../middleware/uploadMiddleware');

router.post('/create', authenticate, requirePermission('Delivery Agent Add'), uploadAgentAvatar.single('avatar'), deliveryAgentController.createAgent);
router.get('/list', authenticate, requirePermission('Delivery Agent List'), deliveryAgentController.getAgents);
router.put('/update/:id', authenticate, requirePermission('Delivery Agent Update'), uploadAgentAvatar.single('avatar'), deliveryAgentController.updateAgent);
router.put('/update-password/:id', authenticate, requirePermission('Delivery Agent Password Update'), deliveryAgentController.updateAgentPassword);
router.delete('/delete/:id', authenticate, requirePermission('Delivery Agent Delete'), deliveryAgentController.deleteAgent);
router.post('/assign-order', authenticate, requirePermission('Delivery Agent Update'), deliveryAgentController.assignAgentToOrder);
router.get('/details/:id', authenticate, requirePermission('Delivery Agent List'), deliveryAgentController.getAgentDetails);

module.exports = router;
