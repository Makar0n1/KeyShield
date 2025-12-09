const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const connectDB = require('../config/database');
const { testConnection } = require('../config/tron');
const errorHandler = require('./middleware/errorHandler');

// Routes
const dealsRouter = require('./routes/deals');
const multisigRouter = require('./routes/multisig');
const transactionsRouter = require('./routes/transactions');
const disputesRouter = require('./routes/disputes');
const adminRouter = require('./routes/admin');

// Blog routes
const blogAdminRoutes = require('../web/routes/blog');
const blogPublicRoutes = require('../web/routes/blogPublic');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Trust proxy (nginx)
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for admin panel
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);

// Root redirect to admin panel
app.get('/', (req, res) => {
  res.redirect('/admin.html');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'KeyShield Multisig Escrow API',
    timestamp: new Date().toISOString()
  });
});

// IP check endpoint for FeeSaver whitelist debugging
app.get('/api/check-ip', async (req, res) => {
  const axios = require('axios');

  try {
    // Get outgoing IP
    const ipifyResponse = await axios.get('https://api.ipify.org?format=json', {
      timeout: 5000
    });
    const outgoingIP = ipifyResponse.data.ip;

    // Check FeeSaver access
    let feesaverStatus = 'not_configured';
    let feesaverError = null;
    let feesaverBalance = null;

    if (process.env.FEESAVER_API_KEY && process.env.FEESAVER_ENABLED === 'true') {
      try {
        const feesaverResponse = await axios.get('https://api.feesaver.com/balance', {
          params: { token: process.env.FEESAVER_API_KEY },
          timeout: 5000
        });
        feesaverStatus = 'accessible';
        feesaverBalance = feesaverResponse.data.balance_trx;
      } catch (error) {
        feesaverStatus = 'blocked';
        feesaverError = error.response?.data?.err || error.message;
      }
    }

    // Return comprehensive info
    res.json({
      success: true,
      outgoing_ip: outgoingIP,
      cloudflare_detected: req.headers['cf-connecting-ip'] ? true : false,
      cloudflare_ip: req.headers['cf-connecting-ip'] || null,
      request_ip: req.ip,
      feesaver: {
        status: feesaverStatus,
        balance: feesaverBalance,
        error: feesaverError,
        whitelist_needed: feesaverStatus === 'blocked'
      },
      env: {
        http_proxy: process.env.HTTP_PROXY ? 'configured' : 'not set',
        https_proxy: process.env.HTTPS_PROXY ? 'configured' : 'not set',
        api_port: process.env.API_PORT || 3000
      },
      recommendation: feesaverStatus === 'blocked'
        ? `Tell FeeSaver support to whitelist IP: ${outgoingIP}`
        : feesaverStatus === 'accessible'
        ? 'FeeSaver is accessible! No action needed.'
        : 'FeeSaver not configured in .env'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// API Routes
app.use('/api/deals', dealsRouter);
app.use('/api/multisig', multisigRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/admin', adminRouter);

// Blog admin routes (with Basic Auth)
const blogAdminAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  const [username, password] = credentials;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
};
app.use('/api/admin/blog', blogAdminAuth, blogAdminRoutes);

// Public blog API
app.use('/api/blog', blogPublicRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Test TRON connection
    await testConnection();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 KeyShield API Server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/health\n`);
    });
  } catch (error) {
    console.error('Failed to start API server:', error);
    process.exit(1);
  }
};

// Only start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
