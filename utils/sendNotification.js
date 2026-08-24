const axios = require('axios');

/**
 * Shared OneSignal poster. Targets a single external user ID via
 * include_external_user_ids - the app on the receiving end must have called
 * OneSignal.login(externalUserId) client-side for anything to arrive; this
 * backend never stores device tokens itself. Never throws - a notification
 * failure should not break the caller's main flow.
 */
const postOneSignal = async ({ appId, apiKey, externalUserId, title, message, data, appUrl, logLabel }) => {
  try {
    const payload = {
      app_id: appId,
      include_external_user_ids: [externalUserId.toString()],
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
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[OneSignal] Notification sent to ${logLabel} ${externalUserId}:`, response.data);
    return response.data;
  } catch (err) {
    console.error(`[OneSignal] Failed to send notification to ${logLabel} ${externalUserId}:`, err?.response?.data || err.message);
  }
};

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
const sendNotification = (agentId, title, message, data = {}, appUrl = "") =>
  postOneSignal({
    appId: process.env.ONESIGNAL_APP_ID,
    apiKey: process.env.ONESIGNAL_REST_API_KEY,
    externalUserId: agentId,
    title,
    message,
    data,
    appUrl,
    logLabel: 'agent'
  });

/**
 * Send a push notification to a customer using their Shopify customer ID as
 * the external user ID. Requires the customer mobile app to call
 * OneSignal.login(customerId) after identifying the customer - mirrors the
 * staff app's convention above, just for a different app/audience.
 *
 * Falls back to the agent app's OneSignal credentials if
 * ONESIGNAL_CUSTOMER_APP_ID/ONESIGNAL_CUSTOMER_REST_API_KEY aren't set -
 * fine for early testing (external ID namespaces don't collide: Mongo
 * ObjectId hex strings for agents vs. numeric Shopify IDs for customers),
 * but the customer app should get its own registered OneSignal app before
 * production.
 *
 * @param {string|number} customerId - Shopify customer ID (order.customer.id)
 */
const sendCustomerNotification = (customerId, title, message, data = {}, appUrl = "") =>
  postOneSignal({
    appId: process.env.ONESIGNAL_CUSTOMER_APP_ID || process.env.ONESIGNAL_APP_ID,
    apiKey: process.env.ONESIGNAL_CUSTOMER_REST_API_KEY || process.env.ONESIGNAL_REST_API_KEY,
    externalUserId: customerId,
    title,
    message,
    data,
    appUrl,
    logLabel: 'customer'
  });

module.exports = { sendNotification, sendCustomerNotification };
