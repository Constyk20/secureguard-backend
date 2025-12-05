const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

exports.register = async (req, res) => {
  const { rollNo, name, email, password, role } = req.body;

  try {
    let user = await User.findOne({ $or: [{ rollNo }, { email }] });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    user = new User({
      rollNo,
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role: role || 'student'
    });

    await user.save();

    res.status(201).json({
      token: generateToken(user),
      user: { id: user._id, rollNo, name, email, role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
  const { rollNo, password } = req.body;

  try {
    const user = await User.findOne({ rollNo });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials or inactive user' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({
      token: generateToken(user),
      user: { id: user._id, rollNo: user.rollNo, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};