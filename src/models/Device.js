const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  // Allow string IDs from Flutter (like device UUID)
  _id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    default: function() {
      return `Device-${this._id.substring(0, 8)}`;
    }
  },
  // Add this field to your userSchema:
  devices: [{
    type: String, // Device IDs are strings
    ref: 'Device'
  }],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'lockdown', 'offline', 'lost'],
    default: 'active'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  battery: {
    level: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    isCharging: {
      type: Boolean,
      default: false
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  location: {
    latitude: {
      type: Number,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180
    },
    accuracy: {
      type: Number,
      min: 0
    },
    address: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  lockdown: {
    active: {
      type: Boolean,
      default: false
    },
    reason: {
      type: String,
      default: ''
    },
    activatedAt: Date,
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deactivatedAt: Date,
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  deviceInfo: {
    appVersion: String,
    osVersion: String,
    model: String,
    manufacturer: String,
    deviceId: String,
    platform: String
  },
  geofence: {
    campusLat: {
      type: Number,
      default: 5.7000
    },
    campusLng: {
      type: Number,
      default: 7.3833
    },
    radius: {
      type: Number,
      default: 500
    },
    isInsideGeofence: {
      type: Boolean,
      default: true
    }
  },
  isCompliant: {
    type: Boolean,
    default: true
  },
  settings: {
    allowBiometricUnlock: {
      type: Boolean,
      default: true
    },
    autoLockOnExit: {
      type: Boolean,
      default: true
    },
    sendPingNotifications: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  // Don't auto-generate _id since we're providing it
  _id: false
});

// Index for faster queries
deviceSchema.index({ user: 1 });
deviceSchema.index({ status: 1 });
deviceSchema.index({ 'lockdown.active': 1 });
deviceSchema.index({ lastSeen: -1 });
deviceSchema.index({ isCompliant: 1 });

// Virtual for checking if device is online (seen in last 5 minutes)
deviceSchema.virtual('isOnline').get(function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.lastSeen > fiveMinutesAgo;
});

// Method to update last seen
deviceSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date();
  return this.save();
};

// Method to activate lockdown
deviceSchema.methods.activateLockdown = function(reason, userId) {
  this.lockdown = {
    active: true,
    reason: reason || 'Security breach detected',
    activatedAt: new Date(),
    activatedBy: userId
  };
  this.status = 'lockdown';
  this.lastSeen = new Date();
  return this.save();
};

// Method to deactivate lockdown
deviceSchema.methods.deactivateLockdown = function(userId) {
  this.lockdown.active = false;
  this.lockdown.deactivatedAt = new Date();
  this.lockdown.deactivatedBy = userId;
  this.status = 'active';
  this.lastSeen = new Date();
  return this.save();
};

const Device = mongoose.model('Device', deviceSchema);

module.exports = Device;