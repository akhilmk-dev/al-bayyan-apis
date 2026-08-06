const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const preprocessRequiredString = (fieldName) =>
  z.preprocess(
    (val) => val ?? '',
    z.string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    }).min(1, `${fieldName} is required`)
  );

const userSchema = z.object({
  name: preprocessRequiredString('Name'),
  email: z.preprocess(
    (val) => val ?? '',
    z.string({required_error:"email is required"}).email('Invalid email')
  ),
  password: z.preprocess(
    (val) => val ?? '',
    z.string().min(6, 'Password must be at least 6 characters')
  ),
  mobile: z.preprocess(
    (val) => (val ? val : ''),
    z.string({
      required_error: 'Mobile number is required',
      invalid_type_error: 'Mobile number must be a string'
    }).regex(/^\d{10,}$/, 'Mobile number must be at least 10 digits')
  ),
  whatsapp_number: z.preprocess(
    (val) => val ?? '',
    z.string({required_error:"Whatsapp number is required"}).regex(/^\d{10,}$/, 'whatsapp number must be at least 10 digits')
  ),

  role: z.preprocess(
    (val) => val ?? '',
    z.string({required_error:"Role is required"}).regex(objectIdRegex, 'Role is required')
  ),

  store_name: preprocessRequiredString('Store name').optional(),
  business_name: preprocessRequiredString('Business name').optional(),
  id_proof_number: preprocessRequiredString('ID proof number').optional(),
  id_proof_file: preprocessRequiredString('ID proof file').optional(),
  tl_number: preprocessRequiredString('TL number').optional(),
  vat_number: preprocessRequiredString('VAT number').optional(),
  corporate_address: preprocessRequiredString('Corporate address').optional(),
  bank_name: preprocessRequiredString('Bank name').optional(),
  bank_branch: preprocessRequiredString('Bank branch').optional(),
  account_name: preprocessRequiredString('Account name').optional(),
  account_number: preprocessRequiredString('Account number').optional(),
  iban: preprocessRequiredString('IBAN number').optional(),
});

module.exports = userSchema;