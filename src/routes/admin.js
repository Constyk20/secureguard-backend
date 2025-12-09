// src/routes/admin.js
const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/adminAuth');

// Middleware to attach io instance
let ioInstance = null;

const setIO = (io) => {
    ioInstance = io;
};

// Admin authentication middleware
const adminAuth = [authMiddleware, adminMiddleware];

// GET /api/admin/devices - Get all devices
router.get('/devices', adminAuth, async (req, res) => {
    try {
        console.log('📡 Fetching all devices...');
        
        const devices = await Device.find()
            .populate('user', 'rollNo name email')
            .sort({ lastComplianceCheck: -1 })
            .lean();

        console.log(`✅ Found ${devices.length} devices`);

        // Transform data for frontend
        const transformedDevices = devices.map(device => ({
            _id: device._id,
            deviceId: device.deviceId,
            deviceModel: device.model || 'Unknown Model',
            osVersion: device.osVersion || 'Unknown OS',
            appVersion: device.appVersion || '1.0.0',
            isCompliant: device.isCompliant,
            isLocked: device.isLocked,
            isConnected: device.isConnected || false,
            geofenceStatus: device.geofenceStatus || 'inside',
            violations: device.violations || [],
            lastChecked: device.lastComplianceCheck || device.updatedAt,
            user: {
                rollNo: device.user?.rollNo || 'Unknown',
                name: device.user?.name || 'Unknown User',
                email: device.user?.email || 'No email'
            },
            createdAt: device.createdAt,
            updatedAt: device.updatedAt
        }));

        res.json({
            success: true,
            data: transformedDevices
        });
    } catch (err) {
        console.error('❌ Get devices error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch devices',
            error: err.message
        });
    }
});

// POST /api/admin/devices/:deviceId/lock - Lock a device
router.post('/devices/:deviceId/lock', adminAuth, async (req, res) => {
    const { deviceId } = req.params;
    const { reason } = req.body;

    try {
        console.log(`🔒 Attempting to lock device: ${deviceId}`);
        console.log(`📝 Reason: ${reason}`);

        const device = await Device.findOne({ deviceId })
            .populate('user', 'rollNo name email');

        if (!device) {
            console.log('❌ Device not found');
            return res.status(404).json({
                success: false,
                message: 'Device not found'
            });
        }

        // Update device status
        device.isLocked = true;
        device.isCompliant = false;
        device.lockReason = reason || 'Locked by administrator';
        await device.save();

        // Log the action
        await AuditLog.create({
            action: 'ADMIN_LOCK',
            performedBy: req.user.id,
            targetDevice: device._id,
            reason: reason || 'Manual lock by admin'
        });

        // Send real-time lock command via Socket.IO
        if (ioInstance && device.socketId) {
            console.log(`📤 Sending lock command to socket: ${device.socketId}`);
            ioInstance.to(device.socketId).emit('enforce-lock', {
                reason: reason || 'Device locked by administrator',
                timestamp: new Date()
            });
        } else {
            console.log('⚠️ Socket not available or device not connected');
        }

        console.log('✅ Device locked successfully');

        res.json({
            success: true,
            message: 'Device locked successfully',
            data: {
                deviceId: device.deviceId,
                isLocked: device.isLocked,
                lockReason: device.lockReason
            }
        });
    } catch (err) {
        console.error('❌ Lock device error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to lock device',
            error: err.message
        });
    }
});

// POST /api/admin/devices/:deviceId/unlock - Unlock a device
router.post('/devices/:deviceId/unlock', adminAuth, async (req, res) => {
    const { deviceId } = req.params;

    try {
        console.log(`🔓 Attempting to unlock device: ${deviceId}`);

        const device = await Device.findOne({ deviceId })
            .populate('user', 'rollNo name email');

        if (!device) {
            console.log('❌ Device not found');
            return res.status(404).json({
                success: false,
                message: 'Device not found'
            });
        }

        // Update device status
        device.isLocked = false;
        device.lockReason = null;
        await device.save();

        // Log the action
        await AuditLog.create({
            action: 'ADMIN_UNLOCK',
            performedBy: req.user.id,
            targetDevice: device._id,
            reason: 'Manual unlock by admin'
        });

        // Send real-time unlock command via Socket.IO
        if (ioInstance && device.socketId) {
            console.log(`📤 Sending unlock command to socket: ${device.socketId}`);
            ioInstance.to(device.socketId).emit('unlock-device', {
                timestamp: new Date()
            });
        } else {
            console.log('⚠️ Socket not available or device not connected');
        }

        console.log('✅ Device unlocked successfully');

        res.json({
            success: true,
            message: 'Device unlocked successfully',
            data: {
                deviceId: device.deviceId,
                isLocked: device.isLocked
            }
        });
    } catch (err) {
        console.error('❌ Unlock device error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to unlock device',
            error: err.message
        });
    }
});

// POST /api/admin/devices/:deviceId/ping - Ping a device
router.post('/devices/:deviceId/ping', adminAuth, async (req, res) => {
    const { deviceId } = req.params;

    try {
        console.log(`📍 Attempting to ping device: ${deviceId}`);

        const device = await Device.findOne({ deviceId });

        if (!device) {
            console.log('❌ Device not found');
            return res.status(404).json({
                success: false,
                message: 'Device not found'
            });
        }

        // Send ping command via Socket.IO
        if (ioInstance && device.socketId && device.isConnected) {
            console.log(`📤 Sending ping command to socket: ${device.socketId}`);
            ioInstance.to(device.socketId).emit('ping-device', {
                shouldPing: true,
                timestamp: new Date()
            });

            // Auto-stop ping after 30 seconds
            setTimeout(() => {
                if (ioInstance && device.socketId) {
                    ioInstance.to(device.socketId).emit('ping-device', {
                        shouldPing: false,
                        timestamp: new Date()
                    });
                }
            }, 30000);

            console.log('✅ Ping command sent successfully');

            res.json({
                success: true,
                message: 'Device ping initiated',
                data: {
                    deviceId: device.deviceId,
                    duration: 30
                }
            });
        } else {
            console.log('⚠️ Device not connected');
            res.status(400).json({
                success: false,
                message: 'Device is not connected'
            });
        }
    } catch (err) {
        console.error('❌ Ping device error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to ping device',
            error: err.message
        });
    }
});

// GET /api/admin/stats - Get dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const totalDevices = await Device.countDocuments();
        const compliantDevices = await Device.countDocuments({ isCompliant: true });
        const lockedDevices = await Device.countDocuments({ isLocked: true });
        const connectedDevices = await Device.countDocuments({ isConnected: true });
        
        const totalUsers = await User.countDocuments();
        const recentAudits = await AuditLog.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('performedBy', 'rollNo name')
            .populate('targetDevice', 'deviceId');

        res.json({
            success: true,
            data: {
                devices: {
                    total: totalDevices,
                    compliant: compliantDevices,
                    nonCompliant: totalDevices - compliantDevices,
                    locked: lockedDevices,
                    connected: connectedDevices,
                    offline: totalDevices - connectedDevices
                },
                users: {
                    total: totalUsers
                },
                recentAudits
            }
        });
    } catch (err) {
        console.error('❌ Get stats error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: err.message
        });
    }
});

// GET /api/admin/audit-logs - Get audit logs
router.get('/audit-logs', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        
        const logs = await AuditLog.find()
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('performedBy', 'rollNo name email')
            .populate('targetDevice', 'deviceId model');

        const total = await AuditLog.countDocuments();

        res.json({
            success: true,
            data: {
                logs,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalLogs: total
            }
        });
    } catch (err) {
        console.error('❌ Get audit logs error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch audit logs',
            error: err.message
        });
    }
});

// Middleware to make io available to routes
router.use((req, res, next) => {
    req.io = ioInstance;
    next();
});

// FIX APPLIED HERE: Combine exports into a single object
module.exports = {
    router,
    setIO, 
};

// Removed the old exports:
// module.exports = router;
// module.exports.setIO = setIO;