const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const roleSchema = z.object({
  role_name: z.preprocess(
    (val) => val ?? '',z.string().min(1, "Role name is required")),
  permissions:z.preprocess(
    (val) => val ?? [], z.array(
    z.string().regex(objectIdRegex, 'Invalid permission ID')
  ).min(1, 'At least one permission is required'))
});

module.exports = { roleSchema };
