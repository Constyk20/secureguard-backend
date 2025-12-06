const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

exports.register = async (req, res) => {
  // IMPORTANT: Flutter sends 'username' but your model expects 'name'
  const { rollNo, username, email, password, role } = req.body;

  console.log('📝 Registration attempt:', { rollNo, username, email });

  try {
    // Check if user already exists
    let user = await User.findOne({ 
      $or: [
        { rollNo }, 
        { email }
      ] 
    });
    
    if (user) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this roll number or email' 
      });
    }

    // Create new user
    // Map 'username' from Flutter to 'name' in your model
    user = new User({
      rollNo,
      name: username, // Map username to name
      email,
      password: await bcrypt.hash(password, 10),
      role: role || 'student',
      isActive: true
    });

    await user.save();
    console.log('✅ User registered:', user._id);

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: { 
        id: user._id, 
        rollNo: user.rollNo, 
        name: user.name, 
        username: user.name, // Also send username for Flutter
        email: user.email, 
        role: user.role 
      }
    });
  } catch (err) {
    console.error('❌ Registration error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: err.message 
    });
  }
};

exports.login = async (req, res) => {
  const { rollNo, password } = req.body;

  console.log('🔑 Login attempt:', { rollNo });

  try {
    // Find user by roll number
    const user = await User.findOne({ rollNo });
    
    if (!user) {
      console.log('❌ User not found:', rollNo);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Account is inactive. Please contact administrator.' 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Password mismatch for user:', user._id);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    console.log('✅ Login successful for user:', user._id);

    // Generate token
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      token,
      user: { 
        id: user._id, 
        rollNo: user.rollNo, 
        name: user.name, 
        username: user.name, // Also send username for Flutter
        email: user.email, 
        role: user.role 
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: err.message 
    });
  }
};

// Optional: Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        rollNo: user.rollNo,
        name: user.name,
        username: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (err) {
    console.error('❌ Get user error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};