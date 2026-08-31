require('dotenv').config();
const { sendCustomerNotification } = require('./utils/sendNotification');

async function main() {
  const res = await sendCustomerNotification(
    '9631501975724',
    'Test Notification',
    'This is a connectivity test from the backend (real numeric customer ID).',
    { test: true }
  );
  console.log('Customer push result:', JSON.stringify(res));
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
