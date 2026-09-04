const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');
const catchAsync = require('../utils/catchAsync');
const { InternalServerError, EmptyRequestBodyError, UnAuthorizedError } = require('../utils/customErrors');

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
 
   // Populate role and nested permissions. +password is required here to
   // verify credentials below - password/refresh_token are select: false by
   // default (never returned by a normal query) specifically so they can't
   // leak through responses like this one, so they're explicitly stripped
   // again before the user object goes out in the response.
   const user = await User.findOne({ email })
     .select('+password')
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

  const safeUser = user.toObject();
  delete safeUser.password;
  delete safeUser.refresh_token;

  res.json({
    status: 'success',
    message:"Login Successfull!",
    accessToken,
    refreshToken,
    user: safeUser,
    permissions
  });
});


exports.refreshToken = catchAsync(async (req, res, next) => {
  if (!req.body?.refreshToken) throw new InternalServerError("refresh token is required")
  const { refreshToken } = req.body;
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refresh_token');
    if (!user || user.refresh_token !== refreshToken) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }
    // Only reissue the access token - the refresh token itself is NOT
    // rotated here. Rotating on every call caused concurrent/parallel
    // refresh requests (e.g. several widgets 401'ing around the same time)
    // to race: the first rotates and saves a new refresh_token, then every
    // other in-flight request's still-valid-by-expiry old token no longer
    // matches, so it gets rejected with 403 and the client force-logs-out.
    // The refresh token stays valid until its own expiry or a fresh login.
    const newAccessToken = generateAccessToken(user);
    res.json({ status: 'success', accessToken: newAccessToken, refreshToken });
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
