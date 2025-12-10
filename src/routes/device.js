const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const { auth } = require('../middleware/auth');
const mongoose = require('mongoose');

module.exports = (io) => {
  console.log('Socket.IO instance successfully set in device routes.');
  
  // Register new device
  router.post('/register', auth, async (req, res) => {
    try {
      const { name, deviceId } = req.body;
      
      // Validate input
      if (!deviceId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device ID is required' 
        });
      }
      
      // Check if device already exists
      const existingDevice = await Device.findById(deviceId);
      if (existingDevice) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device already registered' 
        });
      }
      
      // Create new device
      const device = new Device({
        _id: deviceId,
        name: name || `Device-${deviceId.substring(0, 8)}`,
        user: req.user._id,
        status: 'active',
        lastSeen: new Date()
      });
      
      await device.save();
      
      // Add device to user's devices array
      // Assuming you have this field in your User model
      
      res.status(201).json({
        success: true,
        message: 'Device registered successfully',
        device: {
          id: device._id,
          name: device.name,
          status: device.status,
          user: req.user._id
        }
      });
    } catch (error) {
      console.error('Device registration error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error', 
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Get user's devices
  router.get('/my-devices', auth, async (req, res) => {
    try {
      const devices = await Device.find({ user: req.user._id });
      
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
          location: device.location
        }))
      });
    } catch (error) {
      console.error('Get devices error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Get device status
  router.get('/status/:deviceId', auth, async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      
      // Validate device ID format
      if (!mongoose.Types.ObjectId.isValid(deviceId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid device ID format' 
        });
      }
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. You do not own this device.' 
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
          location: device.location
        }
      });
    } catch (error) {
      console.error('Get device status error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Activate lockdown
  router.post('/lockdown/:deviceId', auth, async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      
      // Validate device ID format
      if (!mongoose.Types.ObjectId.isValid(deviceId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid device ID format' 
        });
      }
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. You do not own this device.' 
        });
      }
      
      // Check if already in lockdown
      if (device.lockdown?.active) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device is already in lockdown mode' 
        });
      }
      
      // Update device status
      device.lockdown = {
        active: true,
        reason: req.body.reason || 'Security breach detected',
        activatedAt: new Date(),
        activatedBy: req.user._id
      };
      device.status = 'lockdown';
      device.lastSeen = new Date();
      
      await device.save();
      
      // Emit socket event
      io.to(device._id.toString()).emit('lockdown_activated', {
        deviceId: device._id,
        reason: device.lockdown.reason,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: 'Lockdown activated successfully',
        device: {
          id: device._id,
          name: device.name,
          lockdown: device.lockdown,
          status: device.status
        }
      });
    } catch (error) {
      console.error('Activate lockdown error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Deactivate lockdown
  router.post('/unlock/:deviceId', auth, async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      
      // Validate device ID format
      if (!mongoose.Types.ObjectId.isValid(deviceId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid device ID format' 
        });
      }
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. You do not own this device.' 
        });
      }
      
      // Check if not in lockdown
      if (!device.lockdown?.active) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device is not in lockdown mode' 
        });
      }
      
      // Update device status
      device.lockdown.active = false;
      device.lockdown.deactivatedAt = new Date();
      device.lockdown.deactivatedBy = req.user._id;
      device.status = 'active';
      device.lastSeen = new Date();
      
      await device.save();
      
      // Emit socket event
      io.to(device._id.toString()).emit('lockdown_deactivated', {
        deviceId: device._id,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: 'Lockdown deactivated successfully',
        device: {
          id: device._id,
          name: device.name,
          lockdown: device.lockdown,
          status: device.status
        }
      });
    } catch (error) {
      console.error('Deactivate lockdown error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Send ping to device
  router.post('/ping/:deviceId', auth, async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      
      // Validate device ID format
      if (!mongoose.Types.ObjectId.isValid(deviceId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid device ID format' 
        });
      }
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. You do not own this device.' 
        });
      }
      
      const duration = parseInt(req.body.duration) || 30;
      
      // Validate duration
      if (duration < 5 || duration > 300) {
        return res.status(400).json({ 
          success: false, 
          message: 'Duration must be between 5 and 300 seconds' 
        });
      }
      
      // Emit ping event
      io.to(device._id.toString()).emit('ping_device', {
        deviceId: device._id,
        duration: duration,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: 'Ping command sent to device',
        deviceId: device._id,
        duration: duration
      });
    } catch (error) {
      console.error('Ping device error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Update device location
  router.post('/location/:deviceId', auth, async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      
      // Validate device ID format
      if (!mongoose.Types.ObjectId.isValid(deviceId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid device ID format' 
        });
      }
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. You do not own this device.' 
        });
      }
      
      const { latitude, longitude, accuracy } = req.body;
      
      // Validate coordinates
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ 
          success: false, 
          message: 'Latitude and longitude are required' 
        });
      }
      
      // Update location
      device.location = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: parseFloat(accuracy) || 0,
        timestamp: new Date()
      };
      device.lastSeen = new Date();
      
      await device.save();
      
      // Emit location update
      io.to(device._id.toString()).emit('location_updated', {
        deviceId: device._id,
        location: device.location
      });
      
      res.json({
        success: true,
        message: 'Location updated successfully',
        location: device.location
      });
    } catch (error) {
      console.error('Update location error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Update device heartbeat (keep-alive)
  router.post('/heartbeat/:deviceId', auth, async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      
      // Validate device ID format
      if (!mongoose.Types.ObjectId.isValid(deviceId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid device ID format' 
        });
      }
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. You do not own this device.' 
        });
      }
      
      // Update last seen
      device.lastSeen = new Date();
      
      // Update battery if provided
      if (req.body.battery) {
        device.battery = {
          level: req.body.battery.level,
          isCharging: req.body.battery.isCharging || false,
          lastUpdated: new Date()
        };
      }
      
      await device.save();
      
      res.json({
        success: true,
        message: 'Heartbeat received',
        lastSeen: device.lastSeen
      });
    } catch (error) {
      console.error('Heartbeat error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  return router;
};