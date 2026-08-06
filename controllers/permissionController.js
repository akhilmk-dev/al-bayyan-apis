const { default: mongoose } = require('mongoose');
const Permission = require('../models/Permission');
const catchAsync = require('../utils/catchAsync'); // adjust path accordingly
const Role = require('../models/Role');
const { InternalServerError } = require('../utils/customErrors');

// Create permission
exports.createPermission = catchAsync(async (req, res) => {
  const { permission_name, page_url, group } = req.body;

  const isPermissionExist = await Permission.findOne({ permission_name });
  if (isPermissionExist) {
    return res.status(409).json({
      status: "error",
      message: "Permission already exists",
      error: "Conflict error"
    });
  }

  const permission = new Permission({ permission_name, page_url, group });
  await permission.save();

  res.status(201).json({ status: 'success', data: permission });
});

// Get all permissions
exports.getPermissions = catchAsync(async (req, res) => {
  const permissions = await Permission.find().select('-__v -updatedAt');
  res.json({ status: 'success', data: permissions });
});

// Get single permission by ID
exports.getPermissionById = catchAsync(async (req, res) => {
  const isValidObjectId = mongoose.Types.ObjectId.isValid;

  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid permission ID' });
  }

  const permission = await Permission.findById(req.params.id).select('-__v -updatedAt');
  if (!permission) {
    return res.status(404).json({ status: 'error', message: 'Permission not found' });
  }

  res.json({ status: 'success', data: permission });
});

// Update permission by ID
exports.updatePermission = catchAsync(async (req, res) => {
  const isValidObjectId = mongoose.Types.ObjectId.isValid;

  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid permission ID' });
  }
  const isPermissionExist = await Permission.findById(req.params.id);
  if(!isPermissionExist)return res.status(404).json({ status: 'error', message: 'Permission not found' });
  
  const { permission_name } = req.body;
  const existing = await Permission.findOne({
    permission_name,
    _id: { $ne: req.params.id }
  });

  if (existing) {
    return res.status(409).json({
      status: 'error',
      message: 'Permission name already exists',
      error: "Conflict Error"
    });
  }

  const permission = await Permission.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!permission) {
    return res.status(404).json({ status: 'error', message: 'Permission not found' });
  }

  res.json({ status: 'success', data: permission });
});

// Delete permission by ID
exports.deletePermission = catchAsync(async (req, res) => {
  const isValidObjectId = mongoose.Types.ObjectId.isValid;

  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid permission ID' });
  }
 
  const isPermissionInUse = await Role.findOne({ permissions: new mongoose.Types.ObjectId(req.params.id) });

if (isPermissionInUse) throw new InternalServerError("Cannot delete permission; it is assigned to one or more roles.")

  const permission = await Permission.findByIdAndDelete(req.params.id);
  if (!permission) {
    return res.status(404).json({ status: 'error', message: 'Permission not found'});
  }

  res.json({ status: 'success', message: 'Permission deleted successfully',data:permission });
});
