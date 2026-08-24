const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');
const catchAsync = require('../utils/catchAsync');
const { InternalServerError, EmptyRequestBodyError, UnAuthorizedError } = require('../utils/customErrors');

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
 
   // Populate role and nested permissions
   const user = await User.findOne({ email })
     .populate({
       path: 'role',
       populate: {
         path: 'permissions',
         select: 'permission_name page_url group _id' 
       }
   });
 
    if (!user) throw new UnAuthorizedError("Invalid credentials");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnAuthorizedError("Invalid credentials");

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refresh_token = refreshToken;
  await user.save();

  const permissions = user.role?.permissions || [];

  res.json({
    status: 'success',
    message:"Login Successfull!",
    accessToken,
    refreshToken,
    user,
    permissions
  });
});


exports.refreshToken = catchAsync(async (req, res, next) => {
  if (!req.body?.refreshToken) throw new InternalServerError("refresh token is required")
  const { refreshToken } = req.body;
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.refresh_token !== refreshToken) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    user.refresh_token = newRefreshToken;
    await user.save();
    res.json({ status: 'success', accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
  }
});

exports.logout = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;
  const user = await User.findOne({ refresh_token: refreshToken });
  if (user) {
    user.refresh_token = null;
    await user.save();
  }
  res.status(204).send();
});
