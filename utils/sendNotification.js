const axios = require('axios');

/**
 * Send a push notification to a specific delivery agent using their external user ID (MongoDB _id).
 * The staff app must call OneSignal.login(agentId) after the agent logs in.
 *
 * @param {string} agentId - MongoDB _id of the delivery agent (used as OneSignal external user ID)
 * @param {string} title - Notification title
 * @param {string} message - Notification body message
 * @param {object} data - Optional additional data payload
 * @param {string} appUrl - Optional custom intent URL (e.g. com.albayyan_staffapp://page)
 */
const sendNotification = async (agentId, title, message, data = {}, appUrl = "") => {
  try {
    const payload = {
      app_id: process.env.ONESIGNAL_APP_ID,
      // target_channel: 'push',
      include_external_user_ids: [agentId.toString()],
      headings: { en: title },
      contents: { en: message },
      data,
    };

    if (appUrl) {
      payload.app_url = appUrl;
    }

    const response = await axios.post(
      'https://onesignal.com/api/v1/notifications',
      payload,
      {
        headers: {
          Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[OneSignal] Notification sent to agent ${agentId}:`, response.data);
    return response.data;
  } catch (err) {
    console.error(`[OneSignal] Failed to send notification to agent ${agentId}:`, err?.response?.data || err.message);
    // Do not throw - notification failure should not break the main flow
  }
};

module.exports = sendNotification;
