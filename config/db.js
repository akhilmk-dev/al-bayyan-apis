const mongoose = require('mongoose');
const dns = require('dns');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    // Some Windows machines (VPN clients, security/firewall software) leave
    // Node's default DNS resolver unable to complete the SRV lookup that
    // mongodb+srv:// URIs require, even though normal DNS resolution works
    // fine everywhere else on the same machine. Retry once against public
    // DNS resolvers before giving up.
    const isSrvUri = (process.env.MONGO_URI || '').startsWith('mongodb+srv://');
    const isSrvLookupFailure = err.message && err.message.includes('querySrv');

    if (isSrvUri && isSrvLookupFailure) {
      console.warn('MongoDB SRV lookup failed via the system DNS resolver, retrying with public DNS (8.8.8.8, 1.1.1.1)...');
      dns.setServers(['8.8.8.8', '1.1.1.1']);
      try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected (via fallback DNS)');
        return;
      } catch (retryErr) {
        console.error('MongoDB connection failed even after DNS fallback:', retryErr.message);
        process.exit(1);
      }
    }

    console.error(err.message);
    process.exit(1);
  }
};
module.exports = connectDB;
