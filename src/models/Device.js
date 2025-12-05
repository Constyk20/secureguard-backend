const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true, unique: true }, // Android ID / iOS IdentifierForVendor
  model: String,
  osVersion: String,
  appVersion: String,
  isCompliant: { type: Boolean, default: true },
  isLocked: { type: Boolean, default: false },
  lastComplianceCheck: Date,
  socketId: String,
  geofenceStatus: { type: String, enum: ['inside', 'outside'], default: 'inside' }
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);