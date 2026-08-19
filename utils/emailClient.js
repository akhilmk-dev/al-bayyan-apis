const axios = require('axios');

// Sends a transactional email via Brevo's REST API. Fails silently/logs, same
// as this codebase's other external API calls (Shopify, geocoding) - an email
// hiccup must never block the delivery flow. If BREVO_API_KEY isn't set yet,
// skips the real send and just logs, so the OTP flow still works end-to-end
// during setup.
const sendEmail = async ({ to, toName, subject, htmlContent }) => {
  try {
    if (!to) {
      console.warn('sendEmail: no recipient email provided, skipping');
      return null;
    }
    if (!process.env.BREVO_API_KEY) {
      console.log(`[Email skipped - BREVO_API_KEY not configured] To: ${to} | Subject: ${subject}`);
      return null;
    }

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL,
          name: process.env.BREVO_SENDER_NAME || 'Al Bayyan',
        },
        to: [{ email: to, name: toName || undefined }],
        subject,
        htmlContent,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return response.data;
  } catch (err) {
    console.error('Email sending failed:', err.response?.data || err.message);
    return null;
  }
};

module.exports = { sendEmail };
