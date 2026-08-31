require('dotenv').config();
const mongoose = require('mongoose');
const DeliveryAgent = require('./models/DeliveryAgent');
const { sendNotification } = require('./utils/sendNotification');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const agent = await DeliveryAgent.findOne({ email: 'sreehari@intertoons.com' });
  if (!agent) {
    console.log('NO_AGENT_FOUND');
  } else {
    const res = await sendNotification(
      agent._id.toString(),
      'Test Notification',
      'This is a second connectivity test from the backend.',
      { test: true }
    );
    console.log('Agent push result:', JSON.stringify(res));
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
