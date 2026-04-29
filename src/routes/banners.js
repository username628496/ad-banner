const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const GROUPS = ['homepage', 'catfish', 'sidebar'];

const validateId = (id) => /^[a-z0-9-]+$/.test(id);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const timestamp = Date.now();
    cb(null, `${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận: jpg, jpeg, png, gif, webp'));
    }
  }
});

const buildImageUrl = (filename) => {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  return `${base}/uploads/${filename}`;
};

// GET /api/banners — tất cả hoặc theo group
router.get('/', (req, res) => {
  const { group } = req.query;
  let rows;
  if (group) {
    if (!GROUPS.includes(group)) {
      return res.status(400).json({ success: false, message: `group không hợp lệ. Chọn: ${GROUPS.join(', ')}` });
    }
    rows = db.prepare(
      'SELECT * FROM banners WHERE grp = ? ORDER BY sort_order ASC, created_at ASC'
    ).all(group);
  } else {
    rows = db.prepare(
      'SELECT * FROM banners ORDER BY grp ASC, sort_order ASC, created_at ASC'
    ).all();
  }

  const data = rows.map(b => ({
    ...b,
    is_active: b.is_active === 1,
    image_url: buildImageUrl(b.image_url)
  }));

  res.json({ success: true, data });
});

// GET /api/banners/all — trả về tất cả groups cho WordPress (chỉ active)
router.get('/all', (req, res) => {
  const brands = db.prepare(
    'SELECT id, name, login_url, register_url FROM brands WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC'
  ).all();

  const brandMap = Object.fromEntries(brands.map(b => [b.id, b]));
  const result = { brands };

  GROUPS.forEach(grp => {
    const rows = db.prepare(
      'SELECT * FROM banners WHERE grp = ? AND is_active = 1 ORDER BY sort_order ASC'
    ).all(grp);
    result[`banners_${grp}`] = rows.map(b => ({
      ...b,
      is_active: true,
      click_url: (b.brand_id && brandMap[b.brand_id]?.login_url) || b.click_url,
      image_url: buildImageUrl(b.image_url)
    }));
  });

  res.json({ success: true, data: result });
});

// GET /api/banners/admin/all — trả về tất cả groups kèm is_active cho Admin UI
router.get('/admin/all', (req, res) => {
  const brands = db.prepare(
    'SELECT * FROM brands ORDER BY sort_order ASC, created_at ASC'
  ).all().map(b => ({ ...b, is_active: b.is_active === 1 }));

  const brandMap = Object.fromEntries(brands.map(b => [b.id, b]));
  const result = { brands };

  GROUPS.forEach(grp => {
    const rows = db.prepare(
      'SELECT * FROM banners WHERE grp = ? ORDER BY sort_order ASC, created_at ASC'
    ).all(grp);
    result[`banners_${grp}`] = rows.map(b => ({
      ...b,
      is_active: b.is_active === 1,
      click_url: (b.brand_id && brandMap[b.brand_id]?.login_url) || b.click_url,
      image_url: buildImageUrl(b.image_url, req)
    }));
  });

  res.json({ success: true, data: result });
});

// GET /api/banners/groups
router.get('/groups', (req, res) => {
  res.json({ success: true, data: GROUPS });
});

// POST /api/banners — upload banner mới
router.post('/', upload.single('image'), (req, res) => {
  const { id, grp, title, click_url, sort_order, brand_id } = req.body;

  if (!id || !grp || !click_url || !req.file) {
    return res.status(400).json({
      success: false,
      message: 'id, grp, click_url và image là bắt buộc!'
    });
  }
  if (!validateId(id)) {
    return res.status(400).json({
      success: false,
      message: 'ID chỉ được chứa a-z, 0-9, dấu gạch ngang!'
    });
  }
  if (!GROUPS.includes(grp)) {
    return res.status(400).json({
      success: false,
      message: `group không hợp lệ. Chọn: ${GROUPS.join(', ')}`
    });
  }

  // Validate brand_id nếu có
  if (brand_id) {
    const brand = db.prepare('SELECT id FROM brands WHERE id = ?').get(brand_id);
    if (!brand) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `Brand "${brand_id}" không tồn tại!` });
    }
  }

  const existing = db.prepare('SELECT id FROM banners WHERE id = ?').get(id);
  if (existing) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      success: false,
      message: `ID "${id}" đã tồn tại!`
    });
  }

  db.prepare(
    'INSERT INTO banners (id, grp, title, image_url, click_url, sort_order, brand_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, grp, title || '', req.file.filename, click_url, sort_order || 0, brand_id || null);

  res.json({
    success: true,
    data: { id, grp, title, click_url, brand_id: brand_id || null, image_url: buildImageUrl(req.file.filename) }
  });
});

// PUT /api/banners/:id — sửa banner (không đổi ảnh)
router.put('/:id', (req, res) => {
  const { newId, title, click_url, grp, sort_order, is_active, brand_id } = req.body;
  const oldId = req.params.id;

  const existing = db.prepare('SELECT * FROM banners WHERE id = ?').get(oldId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Banner không tồn tại!' });
  }

  // Nếu đổi ID
  if (newId && newId !== oldId) {
    if (!validateId(newId)) {
      return res.status(400).json({ success: false, message: 'ID mới không hợp lệ!' });
    }
    const duplicate = db.prepare('SELECT id FROM banners WHERE id = ?').get(newId);
    if (duplicate) {
      return res.status(400).json({ success: false, message: `ID "${newId}" đã tồn tại!` });
    }
  }

  // Validate brand_id nếu có thay đổi
  if (brand_id !== undefined && brand_id !== null && brand_id !== '') {
    const brand = db.prepare('SELECT id FROM brands WHERE id = ?').get(brand_id);
    if (!brand) {
      return res.status(400).json({ success: false, message: `Brand "${brand_id}" không tồn tại!` });
    }
  }

  const finalId = (newId && newId !== oldId) ? newId : oldId;
  const finalBrandId = brand_id !== undefined ? (brand_id || null) : existing.brand_id;

  db.prepare(`
    UPDATE banners SET
      id = ?,
      title = ?,
      click_url = ?,
      grp = ?,
      sort_order = ?,
      is_active = ?,
      brand_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    finalId,
    title ?? existing.title,
    click_url ?? existing.click_url,
    grp ?? existing.grp,
    sort_order ?? existing.sort_order,
    is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    finalBrandId,
    oldId
  );

  res.json({ success: true, message: 'Đã cập nhật banner!' });
});

// PUT /api/banners/:id/image — đổi ảnh banner
router.put('/:id/image', upload.single('image'), (req, res) => {
  const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!banner) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ success: false, message: 'Banner không tồn tại!' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh!' });
  }

  // Xóa ảnh cũ
  const oldPath = path.join(__dirname, '../../uploads', banner.image_url);
  if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

  db.prepare('UPDATE banners SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.file.filename, req.params.id);

  res.json({
    success: true,
    data: { image_url: buildImageUrl(req.file.filename) }
  });
});

// PUT /api/banners/reorder — cập nhật thứ tự hàng loạt
router.put('/reorder', (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders)) {
    return res.status(400).json({ success: false, message: 'orders phải là array!' });
  }
  const update = db.prepare('UPDATE banners SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const updateMany = db.transaction((items) => {
    items.forEach(({ id, sort_order }) => update.run(sort_order, id));
  });
  updateMany(orders);
  res.json({ success: true, message: 'Đã cập nhật thứ tự!' });
});

// DELETE /api/banners/:id
router.delete('/:id', (req, res) => {
  const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!banner) {
    return res.status(404).json({ success: false, message: 'Banner không tồn tại!' });
  }
  const filePath = path.join(__dirname, '../../uploads', banner.image_url);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Đã xóa banner!' });
});

module.exports = { router, upload };
