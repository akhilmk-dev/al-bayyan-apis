const Settings = require('../models/Settings');
const catchAsync = require('../utils/catchAsync');

// Get settings (singleton)
exports.getSettings = catchAsync(async (req, res) => {
  const settings = await Settings.getSingleton();
  res.json({ status: 'success', data: settings });
});

// Update settings (singleton)
exports.updateSettings = catchAsync(async (req, res) => {
  const { delivery_earning_rate } = req.body;
  const settings = await Settings.getSingleton();

  settings.delivery_earning_rate = delivery_earning_rate;
  settings.updated_by = req.user.id;
  await settings.save();

  res.json({ status: 'success', message: 'Settings updated successfully', data: settings });
});
