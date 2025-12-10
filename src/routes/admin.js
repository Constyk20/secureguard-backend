const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const User = require('../models/User');
const { auth, isAdmin } = require('../middleware/auth');

module.exports = (io) => {
  console.log('Socket.IO instance successfully set in admin routes.');
  
  // Get all devices (admin only) - FIXED: Proper middleware usage
  router.get('/devices', auth, isAdmin, async (req, res) => {
    try {
      const devices = await Device.find().populate('user', 'name email');
      
      res.json({
        success: true,
        count: devices.length,
        devices: devices.map(device => ({
          id: device._id,
          name: device.name,
          status: device.status,
          lastSeen: device.lastSeen,
          lockdown: device.lockdown,
          battery: device.battery,
          location: device.location,
          user: device.user ? {
            id: device.user._id,
            name: device.user.name,
            email: device.user.email
          } : null
        }))
      });
    } catch (error) {
      console.error('Get all devices error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Get all users (admin only)
  router.get('/users', auth, isAdmin, async (req, res) => {
    try {
      const users = await User.find().select('-password');
      
      res.json({
        success: true,
        count: users.length,
        users: users.map(user => ({
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          deviceCount: 0 // You might want to populate this from Device model
        }))
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Bulk lockdown (admin only)
  router.post('/bulk-lockdown', auth, isAdmin, async (req, res) => {
    try {
      const { deviceIds, reason } = req.body;
      
      if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device IDs array is required' 
        });
      }
      
      const devices = await Device.find({ _id: { $in: deviceIds } });
      
      if (devices.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No devices found' 
        });
      }
      
      // Update all devices
      const updates = devices.map(device => {
        device.lockdown = {
          active: true,
          reason: reason || 'Administrative lockdown',
          activatedAt: new Date(),
          activatedBy: req.user._id
        };
        device.status = 'lockdown';
        device.lastSeen = new Date();
        return device.save();
      });
      
      await Promise.all(updates);
      
      // Emit events for each device
      devices.forEach(device => {
        io.to(device._id.toString()).emit('lockdown_activated', {
          deviceId: device._id,
          reason: device.lockdown.reason,
          timestamp: new Date()
        });
      });
      
      res.json({
        success: true,
        message: `Lockdown activated for ${devices.length} device(s)`,
        count: devices.length,
        devices: devices.map(device => ({
          id: device._id,
          name: device.name,
          status: device.status
        }))
      });
    } catch (error) {
      console.error('Bulk lockdown error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Bulk unlock (admin only)
  router.post('/bulk-unlock', auth, isAdmin, async (req, res) => {
    try {
      const { deviceIds } = req.body;
      
      if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device IDs array is required' 
        });
      }
      
      const devices = await Device.find({ _id: { $in: deviceIds } });
      
      if (devices.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No devices found' 
        });
      }
      
      // Update all devices
      const updates = devices.map(device => {
        device.lockdown.active = false;
        device.lockdown.deactivatedAt = new Date();
        device.lockdown.deactivatedBy = req.user._id;
        device.status = 'active';
        device.lastSeen = new Date();
        return device.save();
      });
      
      await Promise.all(updates);
      
      // Emit events for each device
      devices.forEach(device => {
        io.to(device._id.toString()).emit('lockdown_deactivated', {
          deviceId: device._id,
          timestamp: new Date()
        });
      });
      
      res.json({
        success: true,
        message: `Lockdown deactivated for ${devices.length} device(s)`,
        count: devices.length,
        devices: devices.map(device => ({
          id: device._id,
          name: device.name,
          status: device.status
        }))
      });
    } catch (error) {
      console.error('Bulk unlock error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Get system stats (admin only)
  router.get('/stats', auth, isAdmin, async (req, res) => {
    try {
      const [
        totalDevices,
        activeDevices,
        lockdownDevices,
        offlineDevices,
        totalUsers
      ] = await Promise.all([
        Device.countDocuments(),
        Device.countDocuments({ status: 'active' }),
        Device.countDocuments({ 'lockdown.active': true }),
        Device.countDocuments({ status: 'offline' }),
        User.countDocuments()
      ]);
      
      // Get devices updated in last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentDevices = await Device.countDocuments({ 
        lastSeen: { $gte: twentyFourHoursAgo } 
      });
      
      res.json({
        success: true,
        stats: {
          totalDevices,
          activeDevices,
          lockdownDevices,
          offlineDevices,
          totalUsers,
          recentDevices,
          uptime: process.uptime(),
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Get device details (admin only)
  router.get('/device/:deviceId', auth, isAdmin, async (req, res) => {
    try {
      const device = await Device.findById(req.params.deviceId)
        .populate('user', 'name email')
        .populate('lockdown.activatedBy', 'name email')
        .populate('lockdown.deactivatedBy', 'name email');
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      res.json({
        success: true,
        device: {
          id: device._id,
          name: device.name,
          status: device.status,
          lastSeen: device.lastSeen,
          lockdown: device.lockdown,
          battery: device.battery,
          location: device.location,
          user: device.user ? {
            id: device.user._id,
            name: device.user.name,
            email: device.user.email
          } : null,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt
        }
      });
    } catch (error) {
      console.error('Get device details error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Get user details (admin only)
  router.get('/user/:userId', auth, isAdmin, async (req, res) => {
    try {
      const user = await User.findById(req.params.userId).select('-password');
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Get user's devices
      const userDevices = await Device.find({ user: user._id });
      
      res.json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          deviceCount: userDevices.length,
          devices: userDevices.map(device => ({
            id: device._id,
            name: device.name,
            status: device.status,
            lastSeen: device.lastSeen
          }))
        }
      });
    } catch (error) {
      console.error('Get user details error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Update user role (admin only)
  router.put('/user/:userId/role', auth, isAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      
      if (!role || !['user', 'admin'].includes(role)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid role (user or admin) is required' 
        });
      }
      
      const user = await User.findById(req.params.userId);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Prevent admin from removing their own admin role
      if (user._id.toString() === req.user._id.toString() && role === 'user') {
        return res.status(400).json({ 
          success: false, 
          message: 'You cannot remove your own admin privileges' 
        });
      }
      
      user.role = role;
      await user.save();
      
      res.json({
        success: true,
        message: `User role updated to ${role}`,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  return router;
};