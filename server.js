const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();
const connectDB = require('./config/db');
// routes imports
const authRoutes = require('./routes/authRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const roleRoutes = require('./routes/roleRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const orderRoutes = require('./routes/orderRoutes')
const productRoutes = require('./routes/productRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const commonRoutes = require("./routes/commonRoutes")
const uploadRoutes = require("./routes/uploadRoutes")
const itemRoutes = require('./routes/ItemRoutes');

const swaggerDocs = require('./docs/swagger');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const clc = require('cli-color');
const morgan = require('morgan');
connectDB();

const app = express();

app.use(cors());
// Increase limit to 50mb or more, as needed
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
const uploadsPath = path.resolve(__dirname, 'uploads');
console.log('Static serving directory:', uploadsPath);
app.use("/uploads", express.static(uploadsPath));

app.use(morgan("dev"));
app.use('/api/V1/auth', authRoutes);
app.use("/api/V1", uploadRoutes);
app.use('/api/V1/items', itemRoutes);
app.use('/api/V1/permissions', permissionRoutes);
app.use('/api/V1/roles', roleRoutes);
app.use('/api/V1/admin/delivery-agent', require('./routes/admin/deliveryAgentRoutes'));
app.use('/api/V1/agent/delivery-agent', require('./routes/agent/deliveryAgentRoutes'));
app.use('/api/V1/users', userRoutes);
app.use('/api/V1/profile', profileRoutes);
app.use('/api/V1/orders', orderRoutes)
app.use("/api/V1/products", productRoutes);
app.use("/api/V1/common", commonRoutes)
app.use('/api/V1/collections', collectionRoutes)

// swagger documentation 
swaggerDocs(app);
// handle the error when none of the above routes works
app.use(errorHandler);

app.listen(process.env.PORT, () => {
    console.log(clc.blueBright("────────────────────────────────────────────"));
    console.log(`${clc.green("🚀 Server Started Successfully")}`);
    console.log(`${clc.cyan("🌐 Environment")} : ${clc.whiteBright(process.env.NODE_ENV)}`);
    console.log(`${clc.cyan("📦 Host")}        : ${clc.whiteBright(process.env.HOST)}`);
    console.log(`${clc.cyan("📦 Port")}        : ${clc.whiteBright(process.env.PORT)}`);
    console.log(`${clc.cyan("🔗 Base URL")}    : ${clc.whiteBright(process.env.BASE_URL)}`);
    console.log(`${clc.cyan("📁 API URL")}     : ${clc.whiteBright(`${process.env.BASE_URL}${process.env.API_PREFIX}`)}`);
    console.log(clc.blueBright("────────────────────────────────────────────"));
});
