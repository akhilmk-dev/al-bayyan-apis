const { z } = require('zod');

const verifyDeliveryOtpSchema = z.object({
  otp: z.preprocess(
    (val) => val ?? '', z.string().trim().min(1, 'OTP is required')),
});

module.exports = { verifyDeliveryOtpSchema };
