const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Permission = require('../models/Permission');
const Role = require('../models/Role');

dotenv.config({ path: path.join(__dirname, '../.env') });

// Al Bayyan permission catalogue. Reuses the exact permission-name strings
// the frontend already hardcodes (allRoutes.js, UserTable.js, etc.) so the
// admin UI keeps working without a cascade of frontend permission-string
// changes.
const PERMISSION_CATALOGUE = [
  // Dashboard
  { permission_name: 'Dashboard', page_url: '/dashboard', group: 'Dashboard' },

  // Users
  { permission_name: 'User List', page_url: '/users', group: 'Users' },
  { permission_name: 'User Add', page_url: '/users', group: 'Users' },
  { permission_name: 'User Edit', page_url: '/users', group: 'Users' },
  { permission_name: 'User Delete', page_url: '/users', group: 'Users' },

  // Roles
  { permission_name: 'List Role', page_url: '/roles', group: 'Roles' },
  { permission_name: 'Add Role', page_url: '/roles', group: 'Roles' },
  { permission_name: 'Edit Role', page_url: '/roles', group: 'Roles' },
  { permission_name: 'Delete Role', page_url: '/roles', group: 'Roles' },

  // Permissions
  { permission_name: 'Permission List', page_url: '/permissions', group: 'Permissions' },
  { permission_name: 'Permission Add', page_url: '/permissions', group: 'Permissions' },
  { permission_name: 'Permission Edit', page_url: '/permissions', group: 'Permissions' },
  { permission_name: 'Permission Delete', page_url: '/permissions', group: 'Permissions' },

  // Products
  { permission_name: 'Product List', page_url: '/products', group: 'Products' },
  { permission_name: 'Product Add', page_url: '/products', group: 'Products' },
  { permission_name: 'Product Edit', page_url: '/products', group: 'Products' },
  { permission_name: 'Product Delete', page_url: '/products', group: 'Products' },

  // Orders
  { permission_name: 'Order List', page_url: '/orders', group: 'Orders' },
  { permission_name: 'Order Details', page_url: '/orders', group: 'Orders' },
  { permission_name: 'Order fulfill', page_url: '/orders', group: 'Orders' },
  { permission_name: 'Order Delete', page_url: '/orders', group: 'Orders' },

  // Delivery Agent
  { permission_name: 'Delivery Agent List', page_url: '/delivery-agents', group: 'Delivery Agent' },
  { permission_name: 'Delivery Agent Add', page_url: '/delivery-agents', group: 'Delivery Agent' },
  { permission_name: 'Delivery Agent Update', page_url: '/delivery-agents', group: 'Delivery Agent' },
  { permission_name: 'Delivery Agent Delete', page_url: '/delivery-agents', group: 'Delivery Agent' },
  { permission_name: 'Delivery Agent Password Update', page_url: '/delivery-agents', group: 'Delivery Agent' },

  // Mobile (CMS)
  { permission_name: 'Home Layout View', page_url: '/homelayout', group: 'Mobile' },
  { permission_name: 'Home Layout Add', page_url: '/homelayout', group: 'Mobile' },
  { permission_name: 'Home Layout Edit', page_url: '/homelayout', group: 'Mobile' },
  { permission_name: 'Home Layout Delete', page_url: '/homelayout', group: 'Mobile' },
  { permission_name: 'Collection Image View', page_url: '/collectionImageUpload', group: 'Mobile' },
  { permission_name: 'Collection Image Add', page_url: '/collectionImageUpload', group: 'Mobile' },
  { permission_name: 'Collection Image Edit', page_url: '/collectionImageUpload', group: 'Mobile' },
  { permission_name: 'Collection Image Delete', page_url: '/collectionImageUpload', group: 'Mobile' },
];

const ADMIN_ROLE_NAME = 'Admin';

const seedPermissions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const permissionIds = [];

    for (const p of PERMISSION_CATALOGUE) {
      let permission = await Permission.findOne({ permission_name: p.permission_name });
      if (!permission) {
        permission = await Permission.create(p);
        console.log(`Permission added: ${p.permission_name}`);
      } else {
        console.log(`Permission already exists: ${p.permission_name}`);
      }
      permissionIds.push(permission._id);
    }

    // Seed an Admin role with every permission assigned so there's a usable
    // superuser immediately. This matches the role_name === 'admin' bypass
    // built into both middleware/permissionMiddleware.js and the existing
    // frontend (components/ProtectedRoute.js).
    let adminRole = await Role.findOne({ role_name: ADMIN_ROLE_NAME });
    if (!adminRole) {
      adminRole = await Role.create({ role_name: ADMIN_ROLE_NAME, permissions: permissionIds });
      console.log(`Role created: ${ADMIN_ROLE_NAME} (with ${permissionIds.length} permissions)`);
    } else {
      adminRole.permissions = permissionIds;
      await adminRole.save();
      console.log(`Role updated: ${ADMIN_ROLE_NAME} (now has ${permissionIds.length} permissions)`);
    }

    console.log('Seeding completed');
    process.exit();
  } catch (err) {
    console.error('Error seeding permissions:', err);
    process.exit(1);
  }
};

seedPermissions();
