// validation/permissionValidation.js
const { z } = require('zod');

const permissionSchema = z.object({
  permission_name: z.string().min(1, 'Permission name is required'),
  page_url: z
    .string()
    .regex(/^\/.*/, 'Page URL must start with "/"'),
    group: z.preprocess(
      (val) => val ?? '',
      z.string({
        required_error: "Group is required"
      }).min(1, "Group is required")
    ),
});

module.exports = permissionSchema;
