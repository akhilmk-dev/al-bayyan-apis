const { z } = require('zod');

const preprocessRequiredString = (fieldName) =>
  z.preprocess(
    (val) => val ?? '',
    z.string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    }).min(1, `${fieldName} is required`)
  );

// Accepts Saudi mobile numbers in any of the common input forms
// (05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX, 9665XXXXXXXX, 009665XXXXXXXX) and
// normalizes them all to a single canonical stored format: +9665XXXXXXXX.
// This is what actually makes duplicate-phone detection reliable - without
// normalization, "0501234567" and "501234567" would be treated as two
// different strings by the unique index despite being the same number.
const saudiMobile = (fieldName) =>
  z.preprocess(
    (val) => (typeof val === 'string' ? val.replace(/[\s-]/g, '') : val),
    z.string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    }).regex(
      /^(?:\+966|00966|966|0)?5\d{8}$/,
      `${fieldName} must be a valid Saudi Arabia mobile number (e.g. 05XXXXXXXX or +9665XXXXXXXX)`
    )
  ).transform((val) => {
    const localDigits = val.replace(/^(?:\+966|00966|966|0)/, '');
    return `+966${localDigits}`;
  });

const email = () =>
  z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string({ required_error: 'Email is required' }).email('Invalid email')
  );

const createAgentSchema = z.object({
  name: preprocessRequiredString('Name'),
  email: email(),
  mobile: saudiMobile('Mobile number'),
  password: z.preprocess(
    (val) => val ?? '',
    z.string().min(6, 'Password must be at least 6 characters')
  ),
  vehicle_type: z.enum(['bike', 'car', 'van', 'other'], {
    required_error: 'Vehicle type is required',
    invalid_type_error: 'Vehicle type must be one of bike, car, van, other'
  }),
  status: z.enum(['active', 'inactive']).optional(),
  avatar: z.string().optional(),
});

// Same shape, but every field optional - admin may update just one field at
// a time. Password is deliberately NOT accepted here (the controller
// already strips it): password changes go through the dedicated
// change-password admin endpoint instead.
const updateAgentSchema = z.object({
  name: preprocessRequiredString('Name').optional(),
  email: email().optional(),
  mobile: saudiMobile('Mobile number').optional(),
  vehicle_type: z.enum(['bike', 'car', 'van', 'other']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  avatar: z.string().nullable().optional(),
});

module.exports = { createAgentSchema, updateAgentSchema };
