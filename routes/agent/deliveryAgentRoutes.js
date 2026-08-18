const express = require('express');
const router = express.Router();
const deliveryAgentController = require('../../controllers/deliveryAgentController');
const { authenticate } = require('../../middleware/authMiddleware');
const { uploadAgentAvatar } = require('../../middleware/uploadMiddleware');
const notificationController = require('../../controllers/notificationController');
const validateMiddleware = require('../../utils/validate');
const { locationSchema } = require('../../validations/locationValidation');
const { rejectOrderSchema } = require('../../validations/rejectOrderValidation');

router.post('/login', deliveryAgentController.loginAgent);
router.post('/refresh-token', deliveryAgentController.refreshToken);
router.post('/forgot-password', deliveryAgentController.forgotPassword);
router.post('/verify-otp', deliveryAgentController.verifyOTP);
router.post('/reset-password', deliveryAgentController.resetPassword);

// Authenticated Agent Routes
router.get('/dashboard-stats', authenticate, deliveryAgentController.getDeliveryStats);
router.get('/earnings', authenticate, deliveryAgentController.getEarnings);
router.get('/assigned-orders', authenticate, deliveryAgentController.getAssignedOrders);
router.get('/order-detail/:id', authenticate, deliveryAgentController.getOrderDetail);
router.put('/update-delivery-status/:id', authenticate, deliveryAgentController.updateDeliveryStatus);
router.put('/orders/:id/accept', authenticate, deliveryAgentController.acceptOrder);
router.put('/orders/:id/reject', authenticate, validateMiddleware(rejectOrderSchema), deliveryAgentController.rejectOrder);
router.put('/update-location/:id', authenticate, validateMiddleware(locationSchema), deliveryAgentController.updateLiveLocation);
router.put('/update-profile', authenticate, uploadAgentAvatar.single('avatar'), deliveryAgentController.updateProfile);
router.put('/change-password', authenticate, deliveryAgentController.changePasswordAgent);
router.get('/profile', authenticate, deliveryAgentController.getProfile);

// Notifications
router.get('/notifications', authenticate, notificationController.getNotifications);
router.get('/notifications/unread-count', authenticate, notificationController.getUnreadCount);
router.patch('/notifications/read', authenticate, notificationController.markAsRead);

module.exports = router;
