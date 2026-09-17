require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const rbacRoutes = require('./routes/rbac');
const assetsRoutes = require('./routes/assets');
const categoriesRoutes = require('./routes/categories');
const locationsRoutes = require('./routes/locations');
const assetQrRoutes = require('./routes/assetQr');
const transfersRoutes = require('./routes/transfers');
const maintenanceRoutes = require('./routes/maintenance');
const auditLogsRoutes = require('./routes/auditLogs');
const dashboardRoutes = require('./routes/dashboard');
const custodyRoutes = require('./routes/custody');
const photoRoutes = require('./routes/photos');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Add it to .env before starting the server.');
  process.exit(1);
}

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
app.use(cors({
  origin:  ['http://localhost:5173',
            'http://localhost:5174'
  ],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/assets',custodyRoutes);
app.use('/api/assets',photoRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/rooms', locationsRoutes); 
app.use('/api/asset-qr', assetQrRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unavailable', timestamp: new Date().toISOString() });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`AMS backend running on http://localhost:${PORT}`);
});
