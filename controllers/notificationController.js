const Notification = require('../models/Notification');
const catchAsync = require('../utils/catchAsync');

// @desc    Get paginated notifications for the logged in agent
// @route   GET /api/v1/agent/notifications
// @access  Private
exports.getNotifications = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ agent_id: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await Notification.countDocuments({ agent_id: req.user.id });

    res.status(200).json({
        status: 'success',
        total,
        page,
        limit,
        data: notifications
    });
});

// @desc    Get unread notification count
// @route   GET /api/v1/agent/notifications/unread-count
// @access  Private
exports.getUnreadCount = catchAsync(async (req, res, next) => {
    const count = await Notification.countDocuments({ agent_id: req.user.id, is_read: false });
    
    res.status(200).json({
        status: 'success',
        data: { unread_count: count }
    });
});

// @desc    Mark notifications as read
// @route   PATCH /api/v1/agent/notifications/read
// @access  Private
// @body    { "notification_ids": ["id1", "id2"] } (Optional: ommiting array marks ALL as read)
exports.markAsRead = catchAsync(async (req, res, next) => {
    const { notification_ids } = req.body;

    let query = { agent_id: req.user.id, is_read: false };
    
    // If specific array of string IDs provided, only mark those. Else, Mark All Unread -> Read.
    if (notification_ids && Array.isArray(notification_ids) && notification_ids.length > 0) {
        query._id = { $in: notification_ids };
    }

    const result = await Notification.updateMany(query, { is_read: true });

    res.status(200).json({
        status: 'success',
        message: `${result.modifiedCount} notification(s) marked as read.`,
        data: { marked_count: result.modifiedCount }
    });
});

// Customer app equivalents of the three endpoints above. Auth is the shared
// static x-api-key (requireTrackingApiKey), not JWT, so there's no req.user -
// the customer is identified by :customerId in the path instead, same as the
// other customer-app order endpoints.

// @desc    Get paginated notifications for a customer
// @route   GET /api/V1/orders/customer/:customerId/notifications
// @access  Public (shared tracking API key)
exports.getCustomerNotifications = catchAsync(async (req, res, next) => {
    const cId = Number(req.params.customerId);
    if (isNaN(cId)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid customer ID' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ customer_id: cId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await Notification.countDocuments({ customer_id: cId });

    res.status(200).json({
        status: 'success',
        total,
        page,
        limit,
        data: notifications
    });
});

// @desc    Get unread notification count for a customer
// @route   GET /api/V1/orders/customer/:customerId/notifications/unread-count
// @access  Public (shared tracking API key)
exports.getCustomerUnreadCount = catchAsync(async (req, res, next) => {
    const cId = Number(req.params.customerId);
    if (isNaN(cId)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid customer ID' });
    }

    const count = await Notification.countDocuments({ customer_id: cId, is_read: false });

    res.status(200).json({
        status: 'success',
        data: { unread_count: count }
    });
});

// @desc    Mark a customer's notifications as read
// @route   PATCH /api/V1/orders/customer/:customerId/notifications/read
// @access  Public (shared tracking API key)
// @body    { "notification_ids": ["id1", "id2"] } (Optional: omitting array marks ALL as read)
exports.markCustomerNotificationsAsRead = catchAsync(async (req, res, next) => {
    const cId = Number(req.params.customerId);
    if (isNaN(cId)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid customer ID' });
    }

    const { notification_ids } = req.body;
    let query = { customer_id: cId, is_read: false };

    if (notification_ids && Array.isArray(notification_ids) && notification_ids.length > 0) {
        query._id = { $in: notification_ids };
    }

    const result = await Notification.updateMany(query, { is_read: true });

    res.status(200).json({
        status: 'success',
        message: `${result.modifiedCount} notification(s) marked as read.`,
        data: { marked_count: result.modifiedCount }
    });
});
