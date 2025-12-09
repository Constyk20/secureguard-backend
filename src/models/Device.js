// src/models/Device.js
const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  model: {
    type: String,
    default: 'Unknown Device'
  },
  osVersion: {
    type: String,
    default: 'Unknown OS'
  },
  appVersion: {
    type: String,
    default: '1.0.0'
  },
  isCompliant: {
    type: Boolean,
    default: true
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  isConnected: {
    type: Boolean,
    default: false
  },
  socketId: {
    type: String,
    default: null
  },
  lastComplianceCheck: {
    type: Date,
    default: Date.now
  },
  geofenceStatus: {
    type: String,
    enum: ['inside', 'outside'],
    default: 'inside'
  },
  violations: {
    type: [String],
    default: []
  },
  lockReason: {
    type: String,
    default: null
  },
  lastLocation: {
    latitude: Number,
    longitude: Number,
    timestamp: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
deviceSchema.index({ user: 1, deviceId: 1 });
deviceSchema.index({ isCompliant: 1, isLocked: 1 });
deviceSchema.index({ lastComplianceCheck: -1 });

// Virtual for checking if device is online (checked in last 5 minutes)
deviceSchema.virtual('isOnline').get(function() {
  if (!this.lastComplianceCheck) return false;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.lastComplianceCheck > fiveMinutesAgo;
});

// Method to update connection status
deviceSchema.methods.updateConnectionStatus = async function(isConnected, socketId = null) {
  this.isConnected = isConnected;
  this.socketId = socketId;
  return await this.save();
};

module.exports = mongoose.model('Device', deviceSchema);