const express = require('express');
const { getOrders, createOrder, getOrderByVendor, updateOrder, cancelOrder, getOrderById, markAsPaid, fulfilOrder, fulfillSingleItem, deleteOrder, getOrdersByCustomer, getOrderDetailByCustomer, pickupOrder, getOrderTracking } = require('../controllers/orderController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { requireTrackingApiKey } = require('../middleware/trackingAuthMiddleware');
const router = express.Router();

router.get('/',authenticate,requirePermission('Order List'),getOrders);
router.post('/',createOrder);
router.get(`/:id`,authenticate,requirePermission('Order List'),getOrderByVendor);
// customer orders
router.get('/customer/:customerId',getOrdersByCustomer);
router.get('/customer/:customerId/:orderId',getOrderDetailByCustomer);
// live tracking (external customer app, shared API key auth)
router.get('/track/:orderId', requireTrackingApiKey, getOrderTracking);
// full order details
router.get('/all/:id',authenticate,requirePermission('Order Details'),getOrderById);
router.post('/update',authenticate,requirePermission('Order fulfill'),updateOrder);
router.post('/cancel',authenticate,requirePermission('Order fulfill'),cancelOrder);
router.post('/fulfilled',authenticate,requirePermission('Order fulfill'),fulfilOrder);
router.post('/fulfillSingleItem',authenticate,requirePermission('Order fulfill'),fulfillSingleItem);
router.post('/delete',authenticate,requirePermission('Order Delete'),deleteOrder);
router.post('/pickup',authenticate,requirePermission('Order fulfill'),pickupOrder);


module.exports = router;
