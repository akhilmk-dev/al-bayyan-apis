const express = require('express');
const { getOrders, createOrder, getOrderByVendor, updateOrder, cancelOrder, getOrderById, markAsPaid, fulfilOrder, fulfillSingleItem, deleteOrder, getOrdersByCustomer, getOrderDetailByCustomer, pickupOrder, getOrderTracking, getOrderInvoice, refundOrderWebhook, requestOrderReturn, adminRequestOrderReturn, adminApproveReturn, adminDeclineReturn, adminProcessReturnRefund, reorderCustomerOrder, returnRequestedWebhook, returnApprovedWebhook, returnDeclinedWebhook, returnClosedWebhook } = require('../controllers/orderController');
const { getCustomerNotifications, getCustomerUnreadCount, markCustomerNotificationsAsRead } = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { requireTrackingApiKey } = require('../middleware/trackingAuthMiddleware');
const router = express.Router();

router.get('/',authenticate,requirePermission('Order List'),getOrders);
router.post('/',createOrder);
// Shopify webhook receiver for `refunds/create` (order returns/refunds) -
// public, no bearer JWT, same pattern as the order-create receiver above.
router.post('/refund', refundOrderWebhook);
router.get(`/:id`,authenticate,requirePermission('Order List'),getOrderByVendor);
// customer orders
router.get('/customer/:customerId',getOrdersByCustomer);
// customer app: notification listing (same shared API key as tracking below).
// Must be registered BEFORE the generic '/customer/:customerId/:orderId'
// route, otherwise Express would match "notifications" as an :orderId value.
router.get('/customer/:customerId/notifications', requireTrackingApiKey, getCustomerNotifications);
router.get('/customer/:customerId/notifications/unread-count', requireTrackingApiKey, getCustomerUnreadCount);
router.patch('/customer/:customerId/notifications/read', requireTrackingApiKey, markCustomerNotificationsAsRead);
router.get('/customer/:customerId/:orderId',getOrderDetailByCustomer);
// live tracking (external customer app, shared API key auth)
router.get('/track/:orderId', requireTrackingApiKey, getOrderTracking);
// mobile app: return request + reorder (same shared API key as tracking above)
router.post('/customer/:customerId/:orderId/return', requireTrackingApiKey, requestOrderReturn);
router.post('/customer/:customerId/:orderId/reorder', requireTrackingApiKey, reorderCustomerOrder);
router.get('/customer/:customerId/:orderId/invoice', requireTrackingApiKey, getOrderInvoice);
// Shopify webhook receivers for the return lifecycle - public, no bearer JWT,
// same pattern as /refund above.
router.post('/return-requested', returnRequestedWebhook);
router.post('/return-approved', returnApprovedWebhook);
router.post('/return-declined', returnDeclinedWebhook);
router.post('/return-closed', returnClosedWebhook);
// full order details
router.get('/all/:id',authenticate,requirePermission('Order Details'),getOrderById);
router.post('/update',authenticate,requirePermission('Order fulfill'),updateOrder);
router.post('/cancel',authenticate,requirePermission('Order fulfill'),cancelOrder);
router.post('/return',authenticate,requirePermission('Order fulfill'),adminRequestOrderReturn);
router.post('/return/approve',authenticate,requirePermission('Order fulfill'),adminApproveReturn);
router.post('/return/decline',authenticate,requirePermission('Order fulfill'),adminDeclineReturn);
router.post('/return/refund',authenticate,requirePermission('Order fulfill'),adminProcessReturnRefund);
router.post('/fulfilled',authenticate,requirePermission('Order fulfill'),fulfilOrder);
router.post('/fulfillSingleItem',authenticate,requirePermission('Order fulfill'),fulfillSingleItem);
router.post('/delete',authenticate,requirePermission('Order Delete'),deleteOrder);
router.post('/pickup',authenticate,requirePermission('Order fulfill'),pickupOrder);


module.exports = router;
