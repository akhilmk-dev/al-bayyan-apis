const express = require('express');
const router = express.Router();

const userController = require("../controllers/userController");
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const userUpdateSchema = require('../validations/userUpdateValidation');
const userSchema = require('../validations/userValidation');

router.get('/',authenticate,requirePermission('User List'), userController.getAllUsers);
router.post('/',authenticate,requirePermission('User Add'),validateMiddleware(userSchema), userController.createUser);
router.get('/:id',authenticate,requirePermission('User List'), userController.getUserById);
router.put('/:id',authenticate,requirePermission('User Edit'),validateMiddleware(userUpdateSchema), userController.updateUser);
router.delete('/:id',authenticate,requirePermission('User Delete'), userController.deleteUser);

module.exports = router