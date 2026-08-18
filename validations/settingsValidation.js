const { z } = require('zod');

const settingsSchema = z.object({
  delivery_earning_rate: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number({ message: 'Delivery earning rate is required' }).min(0, 'Rate cannot be negative')
  ),
});

module.exports = { settingsSchema };
