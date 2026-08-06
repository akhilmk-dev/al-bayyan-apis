const { z } = require('zod');

const userLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});



module.exports = userLoginSchema;