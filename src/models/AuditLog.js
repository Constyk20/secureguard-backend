const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g., "LOCK_ISSUED", "ROOT_DETECTED"
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  targetDevice: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  reason: String,
  ipAddress: String
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);