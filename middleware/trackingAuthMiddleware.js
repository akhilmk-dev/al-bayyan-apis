// Auth for the external customer-tracking app: a single static shared API
// key (not JWT - that caller has no account in this system, just the key).
const requireTrackingApiKey = (req, res, next) => {
  const providedKey = req.headers['x-api-key'];

  if (!process.env.TRACKING_API_KEY) {
    return res.status(503).json({ status: 'error', message: 'Tracking service not configured' });
  }

  if (!providedKey || providedKey !== process.env.TRACKING_API_KEY) {
    return res.status(401).json({ status: 'error', message: 'Invalid or missing API key' });
  }

  next();
};

module.exports = { requireTrackingApiKey };
