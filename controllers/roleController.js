const mongoose = require('mongoose');
const Role = require('../models/Role');
const catchAsync = require('../utils/catchAsync');
const { InternalServerError, NotFoundError, ConflictError, ForbiddenError } = require('../utils/customErrors');
const User = require('../models/User');


// Create role
exports.createRole = catchAsync(async (req, res) => {
  const { role_name, permissions } = req.body;
  const existingRole = await Role.findOne({ role_name });
  if (existingRole) throw new ConflictError("Role name already exists")
  const role = new Role({ role_name, permissions });
  await role.save();
  res.status(201).json({ status: 'success', data: role });
});

// Get all roles
exports.getRoles = catchAsync(async (req, res) => {
  const roles = await Role.find()
    .sort({ createdAt: -1 }) // newest first
    .select('-__v -updatedAt')
    .populate({
      path: 'permissions',
      select: '-__v -updatedAt'
    });

  res.json({
    status: 'success',
    data: roles
  });
});


// Get role by ID
exports.getRoleById = catchAsync(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new InternalServerError("Invalid role ID")
  const role = await Role.findById(req.params.id).populate({
    path: 'permissions',
    select: '-__v -updatedAt'
  });
  if (!role) throw new NotFoundError("Role not found")
  res.json({ status: 'success', data: role });
});

// Update role by ID
exports.updateRole = catchAsync(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new InternalServerError("Invalid role ID")
  const { role_name, permissions } = req.body;

  // Check if another role has the same role_name
  const existing = await Role.findOne({
    role_name,
    _id: { $ne: req.params.id },
  });
  if (existing) throw new ConflictError("Role name already exists")
  const role = await Role.findByIdAndUpdate(
    req.params.id,
    { role_name, permissions },
    { new: true, runValidators: true }
  ).populate('permissions');

  if (!role) throw new NotFoundError("Role not found")
  res.json({ status: 'success', data: role });
});

// Delete role by ID
exports.deleteRole = catchAsync(async (req, res) => {
  const roleId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw new InternalServerError('Invalid role ID');
  }

  const role = await Role.findById(roleId);
  if (!role) throw new NotFoundError('Role not found');

  if (role.role_name?.toLowerCase() === "admin") {
    throw new ForbiddenError("Cannot delete the admin role");
  }

  if (role.role_name?.toLowerCase() === "vendor") {
    throw new ForbiddenError("Cannot delete the vendor role");
  }

  const usersWithRole = await User.findOne({ role: roleId });
  if (usersWithRole) {
    throw new ConflictError(
      "Cannot delete this role because it is assigned to one or more users"
    );
  }

  await Role.findByIdAndDelete(roleId);

  res.json({
    status: 'success',
    message: 'Role deleted successfully',
    data:role
  });
});

