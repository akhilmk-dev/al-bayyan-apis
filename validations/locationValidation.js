const { z } = require('zod');

const locationSchema = z.object({
  latitude: z.preprocess(
    (val) => val ?? null, z.number({ message: 'Latitude is required' }).min(-90, 'Invalid latitude').max(90, 'Invalid latitude')),
  longitude: z.preprocess(
    (val) => val ?? null, z.number({ message: 'Longitude is required' }).min(-180, 'Invalid longitude').max(180, 'Invalid longitude')),
});

module.exports = { locationSchema };
