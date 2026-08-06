const User = require('../models/User');

// requirePermission(permissionName)
// - Runs AFTER `authenticate` (middleware/authMiddleware.js), as a separate
//   middleware. `authenticate` itself stays untouched because it is also
//   used by routes/agent/deliveryAgentRoutes.js, where req.user.id is a
//   DeliveryAgent id, not a User id. Agents have no Role/Permission
//   relationship, so this middleware must NEVER be applied to agent routes.
// - Accepts a single permission name (string) or an array of permission
//   names (any-of semantics), matching the frontend's existing
//   Array.isArray "any of these" logic in components/ProtectedRoute.js.
// - Fetches the user + role + permissions fresh on every request (not
//   embedded in the JWT) since access tokens are minimal ({ id }) and
//   long-lived enough that baking permissions into the token would delay
//   role-change effects until token refresh.
const requirePermission = (permissionName) => {
  const requiredPermissions = Array.isArray(permissionName) ? permissionName : [permissionName];

  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(403).json({ status: 'error', message: 'You do not have permission to perform this action' });
      }

      const user = await User.findById(req.user.id).populate({
        path: 'role',
        populate: {
          path: 'permissions',
          select: 'permission_name',
        },
      });

      const role = user?.role;

      if (!user || !role) {
        return res.status(403).json({ status: 'error', message: 'You do not have permission to perform this action' });
      }

      // Admin bypass — mirrors the frontend's existing role === 'Admin' bypass,
      // keeping client/server behavior consistent.
      if (role.role_name?.toLowerCase() === 'admin') {
        return next();
      }

      const grantedPermissions = (role.permissions || []).map((p) => p.permission_name);
      const hasPermission = requiredPermissions.some((p) => grantedPermissions.includes(p));

      if (!hasPermission) {
        return res.status(403).json({ status: 'error', message: 'You do not have permission to perform this action' });
      }

      return next();
    } catch (err) {
      return res.status(403).json({ status: 'error', message: 'You do not have permission to perform this action' });
    }
  };
};

module.exports = { requirePermission };
