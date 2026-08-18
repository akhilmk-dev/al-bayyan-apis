const { z } = require('zod');

const rejectOrderSchema = z.object({
  reason: z.preprocess(
    (val) => val ?? '', z.string().trim().min(1, 'A reason is required to reject an order')),
});

module.exports = { rejectOrderSchema };
