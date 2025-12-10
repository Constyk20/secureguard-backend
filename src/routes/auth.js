const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, isAdmin } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// VALIDATION FUNCTIONS
// ---------------------------------------------------------------------------
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validateRollNo = (rollNo) => {
  return /^[A-Z0-9]+$/.test(rollNo);
};

// ---------------------------------------------------------------------------
// REGISTER ENDPOINT
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Registration request body:', req.body);
    
    const { rollNo, name, email, password } = req.body; 
    
    // Validation
    if (!rollNo || !name || !email || !password) { 
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required: rollNo, name, email, password' 
      });
    }
    
    // Validate email
    if (!validateEmail(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide a valid email address' 
      });
    }
    
    // Validate roll number
    if (!validateRollNo(rollNo.toUpperCase())) {
      return res.status(400).json({ 
        success: false,
        message: 'Roll number can only contain letters and numbers' 
      });
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters' 
      });
    }
    
    // Validate name length
    if (name.trim().length < 2) {
      return res.status(400).json({ 
        success: false,
        message: 'Name must be at least 2 characters long' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { rollNo: rollNo.toUpperCase().trim() }
      ]
    });
    
    if (existingUser) {
      if (existingUser.email === email.toLowerCase().trim()) {
        return res.status(400).json({ 
          success: false,
          message: 'User already exists with this email' 
        });
      }
      if (existingUser.rollNo === rollNo.toUpperCase().trim()) {
        return res.status(400).json({ 
          success: false,
          message: 'Roll number already registered' 
        });
      }
    }
    
    // Create new user
    const user = new User({
      rollNo: rollNo.toUpperCase().trim(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      role: 'student',
      isActive: true,
      lastLogin: new Date()
    });
    
    await user.save();
    console.log('✅ User registered successfully:', user._id);
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role, 
        rollNo: user.rollNo,
        name: user.name 
      },
      process.env.JWT_SECRET || 'secureguard-secret-key-2024-change-this',
      { expiresIn: '7d' }
    );
    
    // Get user profile without sensitive data
    const userProfile = user.getPublicProfile();
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: userProfile._id,
        rollNo: userProfile.rollNo,
        name: userProfile.name,
        email: userProfile.email,
        role: userProfile.role,
        isActive: userProfile.isActive,
        lastLogin: userProfile.lastLogin,
        createdAt: userProfile.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' 
        ? 'Email already exists' 
        : 'Roll number already exists';
      return res.status(400).json({ 
        success: false,
        message 
      });
    }
    
    // Generic server error
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
});

// ---------------------------------------------------------------------------
// LOGIN ENDPOINT - FIXED VERSION
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    console.log('🔑 Login request body:', req.body);
    
    const { rollNo, password } = req.body;
    
    // Validation
    if (!rollNo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Roll number/email and password are required'
      });
    }
    
    // Use the static method from User model
    let user;
    try {
      user = await User.findByCredentials(rollNo, password);
    } catch (error) {
      console.log('❌ Login failed:', error.message);
      
      // Handle specific error messages from findByCredentials
      if (error.message.includes('Invalid login credentials')) {
        return res.status(401).json({
          success: false,
          message: 'Invalid roll number/email or password'
        });
      }
      
      if (error.message.includes('Account is deactivated')) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact administrator.'
        });
      }
      
      throw error;
    }
    
    console.log('✅ Login successful for user:', user._id);
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role, 
        rollNo: user.rollNo,
        name: user.name 
      },
      process.env.JWT_SECRET || 'secureguard-secret-key-2024-change-this',
      { expiresIn: '7d' }
    );
    
    // Get user profile without sensitive data
    const userProfile = user.getPublicProfile();
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userProfile._id,
        rollNo: userProfile.rollNo,
        name: userProfile.name,
        email: userProfile.email,
        role: userProfile.role,
        isActive: userProfile.isActive,
        lastLogin: userProfile.lastLogin,
        createdAt: userProfile.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    
    // Handle specific errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    // Generic server error
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// ---------------------------------------------------------------------------
// GET CURRENT USER PROFILE (PROTECTED)
// ---------------------------------------------------------------------------
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get user profile without sensitive data
    const userProfile = user.getPublicProfile();
    
    res.json({
      success: true,
      user: userProfile
    });
  } catch (error) {
    console.error('❌ Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---------------------------------------------------------------------------
// CHANGE PASSWORD (PROTECTED)
// ---------------------------------------------------------------------------
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }
    
    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---------------------------------------------------------------------------
// UPDATE PROFILE (PROTECTED)
// ---------------------------------------------------------------------------
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, department, year } = req.body;
    const updates = {};
    
    // Only allow certain fields to be updated
    if (name && name.trim().length >= 2) {
      updates.name = name.trim();
    }
    
    if (email && validateEmail(email)) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.user.id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use by another account'
        });
      }
      
      updates.email = email.toLowerCase();
    }
    
    if (department) {
      updates.department = department.trim();
    }
    
    if (year && year >= 1 && year <= 5) {
      updates.year = year;
    }
    
    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const userProfile = user.getPublicProfile();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: userProfile
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---------------------------------------------------------------------------
// GET ALL USERS (PROTECTED - ADMIN ONLY)
// ---------------------------------------------------------------------------
router.get('/users', auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find({});
    const userProfiles = users.map(user => user.getPublicProfile());
    
    res.json({
      success: true,
      count: userProfiles.length,
      users: userProfiles
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---------------------------------------------------------------------------
// UPDATE USER ROLE (PROTECTED - ADMIN ONLY)
// ---------------------------------------------------------------------------
router.put('/users/:id/role', auth, isAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;
    
    // Validate role
    if (!role || !['student', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid role (student or admin) is required'
      });
    }
    
    // Prevent admin from removing their own admin role
    if (userId === req.user.id && role === 'student') {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove your own admin privileges'
      });
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const userProfile = user.getPublicProfile();
    
    res.json({
      success: true,
      message: `User role updated to ${role}`,
      user: userProfile
    });
  } catch (error) {
    console.error('❌ Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---------------------------------------------------------------------------
// TOGGLE USER ACTIVE STATUS (PROTECTED - ADMIN ONLY)
// ---------------------------------------------------------------------------
router.put('/users/:id/active', auth, isAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    const userId = req.params.id;
    
    // Validate isActive
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean (true/false)'
      });
    }
    
    // Prevent admin from deactivating themselves
    if (userId === req.user.id && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const userProfile = user.getPublicProfile();
    
    res.json({
      success: true,
      message: `User account ${isActive ? 'activated' : 'deactivated'}`,
      user: userProfile
    });
  } catch (error) {
    console.error('❌ Toggle user active status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---------------------------------------------------------------------------
// LOGOUT (CLIENT-SIDE - JUST RETURNS SUCCESS)
// ---------------------------------------------------------------------------
router.post('/logout', auth, async (req, res) => {
  try {
    // Note: JWT tokens are stateless, so server-side logout isn't possible
    // without token blacklisting. This endpoint just acknowledges the logout.
    res.json({
      success: true,
      message: 'Logout successful (client should discard token)'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---------------------------------------------------------------------------
// DATABASE TEST ENDPOINT (PUBLIC)
// ---------------------------------------------------------------------------
router.get('/test-db', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const admins = await User.countDocuments({ role: 'admin' });
    
    res.json({
      success: true,
      message: 'Database connection successful',
      stats: {
        totalUsers: userCount,
        activeUsers,
        admins,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Database test error:', error);
    res.json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// ---------------------------------------------------------------------------
// HEALTH CHECK ENDPOINT (PUBLIC)
// ---------------------------------------------------------------------------
router.get('/health', async (req, res) => {
  try {
    // Test database connection
    await User.findOne({});
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      service: 'SecureGuard Auth API',
      version: '1.0.0'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed'
    });
  }
});

// ---------------------------------------------------------------------------
// ROUTE INFORMATION (PUBLIC)
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'SecureGuard Authentication API',
    version: '1.0.0',
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      profile: 'GET /api/auth/me (protected)',
      changePassword: 'POST /api/auth/change-password (protected)',
      updateProfile: 'PUT /api/auth/profile (protected)',
      users: 'GET /api/auth/users (admin only)',
      health: 'GET /api/auth/health',
      test: 'GET /api/auth/test-db'
    },
    documentation: 'See API documentation for more details'
  });
});

module.exports = router;