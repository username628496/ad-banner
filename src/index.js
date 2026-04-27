const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

// Auth chỉ cho POST/PUT/DELETE
const authIfWrite = (req, res, next) => {
  if (req.method === 'GET') return next();
  return auth(req, res, next);
};

const brandsRouter = require('./routes/brands');
const { router: bannersRouter } = require('./routes/banners');
const loginUrlsRouter = require('./routes/login-urls');

// Login endpoint (public)
app.post('/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu!' });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Sai mật khẩu!' });
  }
  res.json({ success: true, token: process.env.ADMIN_TOKEN });
});

// Brands phải đặt trước banners
app.use('/api/brands', authIfWrite, brandsRouter);

app.get('/api/banners/admin/all', auth, bannersRouter);
app.use('/api/banners', authIfWrite, bannersRouter);
app.use('/api/login-urls', authIfWrite, loginUrlsRouter);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Ad Banner Server v4.0',
    groups: ['slider', 'homepage', 'catfish', 'sidebar', 'popup'],
    endpoints: {
      all: '/api/banners/all',
      adminAll: '/api/banners/admin/all',
      byGroup: '/api/banners?group=slider',
      brands: '/api/brands',
      loginUrls: '/api/login-urls'
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Ad Server v4.0 chạy tại http://localhost:${PORT}`);
  console.log(`🔑 Admin Token: ${process.env.ADMIN_TOKEN}`);
});
