const mongoose = require('mongoose');
const DeliveryAgent = require('../models/DeliveryAgent');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const OrderTimeline = require('../models/OrderTimeline');
const catchAsync = require('../utils/catchAsync');
const { NotFoundError, InternalServerError } = require('../utils/customErrors');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const getFullUrl = require('../utils/fullUrl');
const sendNotification = require('../utils/sendNotification');
const axios = require('axios');

// --- Admin Controllers ---

// Create Delivery Agent
exports.createAgent = catchAsync(async (req, res, next) => {
    try {
        const { name, email, mobile, password, status, vehicle_type } = req.body;
        let avatar = req.body.avatar;

        if (req.file) {
            avatar = `agents/${req.file.filename}`;
        }

        const agent = await DeliveryAgent.create({
            name,
            email,
            mobile,
            password,
            vehicle_type,
            avatar,
            status: status?.toLowerCase() || 'active'
        });

        res.status(201).json({
            status: 'success',
            message: 'Agent created successfully',
            data: {
                ...agent.toObject(),
                avatar: getFullUrl(req, agent.avatar)
            }
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
            return res.status(400).json({
                status: 'error',
                message,
                errors: { [field]: [message] }
            });
        }
        res.status(400).json({
            status: 'error',
            message: err.message,
            errors: err.errors
        });
    }
});

// Get All Agents
exports.getAgents = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const agents = await DeliveryAgent.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await DeliveryAgent.countDocuments();

    res.status(200).json({
        status: 'success',
        total,
        data: agents.map(agent => ({
            ...agent.toObject(),
            avatar: getFullUrl(req, agent.avatar)
        }))
    });
});

// Update Agent
exports.updateAgent = catchAsync(async (req, res, next) => {
    try {
        if (req.body.status) req.body.status = req.body.status.toLowerCase();

        // Remove password from update body to prevent inadvertent password changes
        delete req.body.password;

        const agent = await DeliveryAgent.findById(req.params.id);
        if (!agent) throw new NotFoundError('Agent not found');

        // Handle file upload
        if (req.file) {
            // Delete old avatar if it exists
            if (agent.avatar) {
                const oldPath = path.join(__dirname, '..', 'uploads', agent.avatar);
                if (fs.existsSync(oldPath)) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (e) {
                        console.error('Failed to delete old avatar:', e);
                    }
                }
            }
            agent.avatar = `agents/${req.file.filename}`;
        } else if (req.body.avatar === null || req.body.avatar === '') {
            if (agent.avatar) {
                const oldPath = path.join(__dirname, '..', 'uploads', agent.avatar);
                if (fs.existsSync(oldPath)) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (e) {
                        console.error('Failed to delete old avatar:', e);
                    }
                }
            }
            agent.avatar = null;
        }

        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'avatar') {
                agent[key] = req.body[key];
            }
        });

        await agent.save();

        res.status(200).json({
            status: 'success',
            message: 'Agent updated successfully',
            data: {
                ...agent.toObject(),
                avatar: getFullUrl(req, agent.avatar)
            }
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
            return res.status(400).json({
                status: 'error',
                message,
                errors: { [field]: [message] }
            });
        }
        res.status(400).json({
            status: 'error',
            message: err.message,
            errors: err.errors
        });
    }
});

// Delete Agent
exports.deleteAgent = catchAsync(async (req, res, next) => {
    const agent = await DeliveryAgent.findByIdAndDelete(req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    res.status(200).json({ status: 'success', message: 'Agent deleted successfully' });
});

// Update Agent Password
exports.updateAgentPassword = catchAsync(async (req, res, next) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ status: 'error', message: 'Password is required' });
    }
    const agent = await DeliveryAgent.findById(req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');

    agent.password = password;
    await agent.save();

    res.status(200).json({ status: 'success', message: 'Password updated successfully' });
});

// Assign Agent to Order
exports.assignAgentToOrder = catchAsync(async (req, res, next) => {
    const { order_id, agent_id } = req.body;
    const order = await Order.findOne({ order_id });
    if (!order) throw new NotFoundError('Order not found');

    if (order.fulfillment_status?.toLowerCase() === 'fulfilled') {
        return res.status(400).json({ status: 'error', message: "Cannot change delivery agent for a fulfilled order" });
    }

    const agent = await DeliveryAgent.findById(agent_id);
    if (!agent) throw new NotFoundError('Agent not found');

    const previousAgent = order.assigned_agent;
    order.assigned_agent = agent_id;
    order.assignment_date = new Date();
    order.delivery_status = 'Pending';
    await order.save();

    // Send push notification to the assigned delivery agent
    const title = 'New Order Assigned! 🛵';
    const message = `Order #${order.order_id} has been assigned to you. Please check your app for details.`;
    
    // Pass the MongoDB _id so the app's getOrderDetail endpoint functions correctly
    const notificationData = { id: order._id.toString(), order_id: order.order_id, type: 'order_assigned', screen: 'OrderDetail' };

    await sendNotification(
        agent_id,
        title,
        message,
        notificationData,
        `com.albayyan_staffapp://OrderDetail/${order._id.toString()}`
    );
    console.log("Notification sent to agent", agent_id);

    // Save notification to database
    await Notification.create({
        agent_id,
        title,
        message,
        data: notificationData,
        is_read: false
    });

    // Create timeline entry
    const isReassigned = !!previousAgent;
    await OrderTimeline.create({
        order_id: order_id,
        action: isReassigned ? 'Reassigned' : 'Assigned',
        message: isReassigned 
            ? `Order reassigned to agent: ${agent.name}`
            : `Order assigned to agent: ${agent.name}`
    });

    res.status(200).json({ status: 'success', message: 'Agent assigned to order successfully', data: order });
});

// --- Agent App Controllers ---

exports.loginAgent = catchAsync(async (req, res, next) => {
    const { email, mobile, password } = req.body;

    if (!email && !mobile) {
        return res.status(400).json({ status: 'error', message: 'Email or mobile number is required' });
    }

    const query = email ? { email } : { mobile };
    const agent = await DeliveryAgent.findOne(query);

    if (!agent || !(await agent.comparePassword(password))) {
        return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }


    if (agent.status === 'inactive') {
        return res.status(403).json({ status: 'error', message: 'Your account is inactive. Please contact admin.' });
    }

    const accessToken = generateAccessToken(agent);
    const refreshToken = generateRefreshToken(agent);

    agent.refresh_token = refreshToken;
    await agent.save();

    res.status(200).json({
        status: 'success',
        message: 'Login successful',
        accessToken,
        refreshToken,
        data: {
            ...agent.toObject(),
            avatar: getFullUrl(req, agent.avatar)
        }
    });
});

// Refresh Token
exports.refreshToken = catchAsync(async (req, res, next) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ status: 'error', message: 'Refresh token is required' });
    }
    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const agent = await DeliveryAgent.findById(decoded.id);
        if (!agent || agent.refresh_token !== refreshToken) {
            return res.status(403).json({ status: 'error', message: 'Forbidden' });
        }
        const newAccessToken = generateAccessToken(agent);
        const newRefreshToken = generateRefreshToken(agent);
        agent.refresh_token = newRefreshToken;
        await agent.save();
        res.json({ status: 'success', accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (err) {
        return res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
    }
});

// Update Profile (Agent App)
exports.updateProfile = catchAsync(async (req, res, next) => {
    console.log('Update Profile - Full Debug:', {
        headers: req.headers,
        body: req.body,
        file: req.file,
        allFiles: req.files
    });
    const agent = await DeliveryAgent.findById(req.user.id);
    if (!agent) throw new NotFoundError('Agent not found');

    const allowedUpdates = ['name', 'email', 'mobile', 'vehicle_type'];
    Object.keys(req.body).forEach(key => {
        if (allowedUpdates.includes(key)) {
            agent[key] = req.body[key];
        }
    });

    if (req.file) {
        // Delete old avatar if it exists
        if (agent.avatar) {
            const oldPath = path.join(__dirname, '..', 'uploads', agent.avatar);
            if (fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (e) {
                    console.error('Failed to delete old avatar:', e);
                }
            }
        }
        agent.avatar = `agents/${req.file.filename}`;
    } else if (req.body.avatar === null || req.body.avatar === '') {
        if (agent.avatar) {
            const oldPath = path.join(__dirname, '..', 'uploads', agent.avatar);
            if (fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (e) {
                    console.error('Failed to delete old avatar:', e);
                }
            }
        }
        agent.avatar = null;
    }

    await agent.save();

    res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully',
        data: {
            ...agent.toObject(),
            avatar: getFullUrl(req, agent.avatar)
        }
    });
});

// Forgot Password - Set OTP 55555
exports.forgotPassword = catchAsync(async (req, res, next) => {
    const { email, mobile } = req.body;
    let query = {};
    if (email) query = { email };
    else if (mobile) query = { mobile };
    else return res.status(400).json({ status: 'error', message: 'Please provide email or mobile number' });

    const agent = await DeliveryAgent.findOne(query);
    if (!agent) throw new NotFoundError('Agent not found');

    agent.otp = 555555; // Default as requested
    agent.otp_expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    agent.otp_method = email ? 'email' : 'mobile';
    await agent.save();

    const target = email ? 'email' : 'mobile';
    res.status(200).json({ status: 'success', message: `OTP sent successfully to your ${target} (Default: 555555)` });
});

// Verify OTP
exports.verifyOTP = catchAsync(async (req, res, next) => {
    const { email, mobile, otp } = req.body;
    let query = { otp, otp_expiry: { $gt: Date.now() } };
    if (email) {
        query.email = email;
        query.otp_method = 'email';
    } else if (mobile) {
        query.mobile = mobile;
        query.otp_method = 'mobile';
    } else return res.status(400).json({ status: 'error', message: 'Please provide email or mobile number' });

    const agent = await DeliveryAgent.findOne(query);

    if (!agent) {
        return res.status(400).json({ status: 'error', message: 'Invalid OTP, expired, or incorrect verification method' });
    }

    agent.is_verified = true;
    await agent.save();

    res.status(200).json({ status: 'success', message: 'OTP verified successfully' });
});

// Reset Password
exports.resetPassword = catchAsync(async (req, res, next) => {
    const { email, mobile, password } = req.body;
    let query = { is_verified: true };
    if (email) query.email = email;
    else if (mobile) query.mobile = mobile;
    else return res.status(400).json({ status: 'error', message: 'Please provide email or mobile number' });

    const agent = await DeliveryAgent.findOne(query);

    if (!agent) {
        return res.status(400).json({ status: 'error', message: 'Please verify your account first' });
    }

    agent.password = password;
    agent.is_verified = false;
    agent.otp = null;
    agent.otp_expiry = null;
    await agent.save();

    res.status(200).json({ status: 'success', message: 'Password reset successfully' });
});

// Get Dashboard Stats
exports.getDeliveryStats = catchAsync(async (req, res, next) => {
    const agentId = req.user.id;

    const pending_count = await Order.countDocuments({ assigned_agent: agentId, delivery_status: 'Pending' });
    const delivered_count = await Order.countDocuments({ assigned_agent: agentId, delivery_status: 'Delivered' });

    // Any order that is currently "Picked Up" by this agent
    const current_order = await Order.findOne({
        assigned_agent: agentId,
        delivery_status: 'Picked Up'
    });

    const recent_activity = await Order.find({
        assigned_agent: agentId,
        delivery_status: 'Delivered'
    })
        .sort({ delivered_at: -1 })
        .limit(5)
        .select('order_id delivered_at total_price shipping_address');

    res.status(200).json({
        status: 'success',
        data: {
            pending_count,
            delivered_count,
            current_order: current_order || null,
            recent_activity
        }
    });
});

// Get All Assigned Orders
exports.getAssignedOrders = catchAsync(async (req, res, next) => {
    const agentId = req.user.id;
    const { status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { assigned_agent: agentId };
    if (status) query.delivery_status = status;

    const orders = await Order.find(query)
        .sort({ assignment_date: 1 }) // FIFO
        .skip(skip)
        .limit(limit);

    const total = await Order.countDocuments(query);

    res.status(200).json({
        status: 'success',
        total,
        page,
        limit,
        data: orders
    });
});

// Get Order Detail
exports.getOrderDetail = catchAsync(async (req, res, next) => {
    const order = await Order.findById(req.params.id).lean();
    if (!order) throw new NotFoundError('Order not found');

    if (order.assigned_agent?.toString() !== req.user.id) {
        return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    res.status(200).json({ status: 'success', data: order });
});

// Update Delivery Status
exports.updateDeliveryStatus = catchAsync(async (req, res, next) => {
    const { status } = req.body; // 'Picked Up' or 'Delivered'
    const order = await Order.findById(req.params.id);

    if (!order) throw new NotFoundError('Order not found');

    // Only the assigned agent can update the order status. This also handles unassigned orders.
    if (!order.assigned_agent || order.assigned_agent.toString() !== req.user.id) {
        return res.status(403).json({ 
            status: 'error', 
            message: 'Access denied: You are not assigned to this order or the order is unassigned' 
        });
    }

    // Once an order is Delivered, the status cannot be changed further via this API.
    if (order.delivery_status === 'Delivered') {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Order is already marked as Delivered and cannot be updated' 
        });
    }

    // Once an order is Picked Up, it cannot be marked as Pending again.
    if (order.delivery_status === 'Picked Up' && status === 'Pending') {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Order has already been Picked Up and cannot be marked as Pending' 
        });
    }

    order.delivery_status = status; // Keeping for backward compatibility but focusing on fulfillment_status
    if (status === 'Picked Up') {
        order.picked_up_at = new Date();
        order.fulfillment_status = 'scheduled';
    }
    if (status === 'Delivered') {
        order.delivered_at = new Date();
        order.fulfillment_status = 'fulfilled';

        // SYNC TO SHOPIFY: Create Fulfillment
        if (order.fulfillment_id) {
            try {
                const mutation = `
                    mutation FulfillOrder {
                        fulfillmentCreateV2(fulfillment: {
                            notifyCustomer: true,
                            lineItemsByFulfillmentOrder: [
                                {
                                    fulfillmentOrderId: "gid://shopify/FulfillmentOrder/${order.fulfillment_id}"
                                }
                            ]
                        }) {
                            fulfillment { id status }
                            userErrors { message }
                        }
                    }
                `;
                const shopifyRes = await axios.post(process.env.SHOPIFY_ADMIN_API, { query: mutation }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
                    }
                });

                if (shopifyRes.data?.data?.fulfillmentCreateV2?.userErrors?.length > 0) {
                    console.error("Shopify Sync Errors (Delivered):", shopifyRes.data.data.fulfillmentCreateV2.userErrors);
                } else if (shopifyRes.data?.errors) {
                    console.error("Shopify Sync API Errors (Delivered):", shopifyRes.data.errors);
                } else {
                    console.log(`Order ${order.order_id} fulfilled in Shopify successfully.`);
                }
            } catch (err) {
                console.error("Shopify Sync Exception (Delivered):", err.response?.data || err.message);
            }
        } else {
            console.warn(`Order ${order.order_id} has no fulfillment_id. Cannot sync to Shopify.`);
        }
    }
    if (status === 'Cancelled') order.cancelled_at = new Date();

    await order.save();

    // Create timeline entry
    await OrderTimeline.create({
        order_id: order.order_id,
        action: status === 'Picked Up' ? 'Picked Up' : (status === 'Delivered' ? 'Delivered' : status),
        message: `Order status updated to ${status} (Synced to Shopify)`
    });


    res.status(200).json({ status: 'success', message: `Order status updated to ${status}`, data: order });
});

// Helper for formatting agent with full avatar
const formatAgent = (req, agent) => {
    if (!agent) return null;
    const agentObj = typeof agent.toObject === 'function' ? agent.toObject() : agent;
    return {
        ...agentObj,
        avatar: getFullUrl(req, agentObj.avatar)
    };
};
// Get Profile Data (Agent App)
exports.getProfile = catchAsync(async (req, res, next) => {
    const agent = await DeliveryAgent.findById(req.user.id);
    console.log('Get Profile Debug - Avatar from DB:', agent?.avatar);
    if (!agent) throw new NotFoundError('Agent not found');

    const total_delivered_count = await Order.countDocuments({
        assigned_agent: req.user.id,
        delivery_status: 'Delivered'
    });

    res.status(200).json({
        status: 'success',
        data: {
            ...formatAgent(req, agent),
            total_delivered_count
        }
    });
});

// --- Admin Only Controllers ---

// Get Agent Details with Stats and Orders
exports.getAgentDetails = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const agent = await DeliveryAgent.findById(id);
    if (!agent) throw new NotFoundError('Agent not found');

    // Fetch stats
    const stats = await Order.aggregate([
        { $match: { assigned_agent: new mongoose.Types.ObjectId(id) } },
        {
            $group: {
                _id: "$delivery_status",
                count: { $sum: 1 }
            }
        }
    ]);

    const statsMap = {
        Pending: 0,
        'Picked Up': 0,
        Delivered: 0,
        Cancelled: 0
    };
    stats.forEach(s => {
        if (s._id) statsMap[s._id] = s.count;
    });

    // Fetch orders with pagination and filter
    let query = { assigned_agent: id };
    if (status) query.delivery_status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orders = await Order.find(query)
        .sort({ assignment_date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const totalOrders = await Order.countDocuments(query);

    res.status(200).json({
        status: 'success',
        data: {
            agent: formatAgent(req, agent),
            stats: statsMap,
            orders,
            pagination: {
                total: totalOrders,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalOrders / parseInt(limit))
            }
        }
    });
});

// Change Password (Agent App)
exports.changePasswordAgent = catchAsync(async (req, res, next) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({
            status: 'error',
            message: 'Both old and new passwords are required'
        });
    }

    // Check if old and new passwords are the same (case-insensitive)
    if (oldPassword.toLowerCase() === newPassword.toLowerCase()) {
        return res.status(400).json({
            status: 'error',
            message: 'New password cannot be the same as the old password'
        });
    }

    const agent = await DeliveryAgent.findById(req.user.id).select('+password');
    if (!agent) throw new NotFoundError('Agent not found');

    // Check if old password is correct
    const isMatch = await agent.comparePassword(oldPassword);
    if (!isMatch) {
        return res.status(404).json({
            status: 'error',
            message: 'Incorrect old password'
        });
    }

    // Update password
    agent.password = newPassword;
    await agent.save();

    res.status(200).json({
        status: 'success',
        message: 'Password changed successfully'
    });
});
