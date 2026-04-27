const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const GROUPS = ['slider', 'homepage', 'catfish', 'sidebar', 'popup'];
const validateId = (id) => /^[a-z0-9-]+$/.test(id);

const buildImageUrl = (filename) => {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  return `${base}/uploads/${filename}`;
};

// GET /api/brands — tất cả brands, mỗi brand kèm banners grouped theo grp
router.get('/', (req, res) => {
  try {
    const brands = db.prepare(
      'SELECT * FROM brands ORDER BY sort_order ASC, created_at ASC'
    ).all();

    const data = brands.map(brand => {
      const banners = {};
      GROUPS.forEach(grp => {
        const banner = db.prepare(
          'SELECT * FROM banners WHERE brand_id = ? AND grp = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1'
        ).get(brand.id, grp);
        banners[grp] = banner
          ? { ...banner, is_active: banner.is_active === 1, image_url: buildImageUrl(banner.image_url) }
          : null;
      });
      return {
        ...brand,
        is_active: brand.is_active === 1,
        banners
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/brands — tạo brand mới
router.post('/', (req, res) => {
  try {
    const { id, name, login_url, register_url } = req.body;

    if (!id || !name) {
      return res.status(400).json({ success: false, message: 'id và name là bắt buộc!' });
    }
    if (!validateId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID chỉ được chứa a-z, 0-9, dấu gạch ngang!'
      });
    }

    const existing = db.prepare('SELECT id FROM brands WHERE id = ?').get(id);
    if (existing) {
      return res.status(400).json({ success: false, message: `ID "${id}" đã tồn tại!` });
    }

    db.prepare(
      'INSERT INTO brands (id, name, login_url, register_url) VALUES (?, ?, ?, ?)'
    ).run(id, name, login_url || '', register_url || '');

    const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
    res.json({ success: true, data: { ...brand, is_active: brand.is_active === 1 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/brands/:id — sửa brand, hỗ trợ đổi ID qua field newId
router.put('/:id', (req, res) => {
  try {
    const oldId = req.params.id;
    const { newId, name, login_url, register_url, is_active, sort_order } = req.body;

    const existing = db.prepare('SELECT * FROM brands WHERE id = ?').get(oldId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Brand không tồn tại!' });
    }

    const finalId = (newId && newId !== oldId) ? newId : oldId;

    if (finalId !== oldId) {
      if (!validateId(finalId)) {
        return res.status(400).json({ success: false, message: 'ID mới không hợp lệ!' });
      }
      const duplicate = db.prepare('SELECT id FROM brands WHERE id = ?').get(finalId);
      if (duplicate) {
        return res.status(400).json({ success: false, message: `ID "${finalId}" đã tồn tại!` });
      }
    }

    const updateOp = db.transaction(() => {
      if (finalId !== oldId) {
        // Cập nhật brand_id trên tất cả banners trước khi đổi brand id
        db.prepare('UPDATE banners SET brand_id = ? WHERE brand_id = ?').run(finalId, oldId);
      }
      db.prepare(`
        UPDATE brands SET
          id = ?,
          name = ?,
          login_url = ?,
          register_url = ?,
          is_active = ?,
          sort_order = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        finalId,
        name ?? existing.name,
        login_url ?? existing.login_url,
        register_url ?? existing.register_url,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        sort_order ?? existing.sort_order,
        oldId
      );
    });
    updateOp();

    res.json({ success: true, message: 'Đã cập nhật brand!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/brands/:id — xóa brand, banners và file ảnh liên quan
router.delete('/:id', (req, res) => {
  try {
    const brand = db.prepare('SELECT id FROM brands WHERE id = ?').get(req.params.id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand không tồn tại!' });
    }

    const banners = db.prepare('SELECT image_url FROM banners WHERE brand_id = ?').all(req.params.id);

    const deleteOp = db.transaction(() => {
      db.prepare('DELETE FROM banners WHERE brand_id = ?').run(req.params.id);
      db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
    });
    deleteOp();

    // Xóa file ảnh sau khi DB transaction thành công
    banners.forEach(banner => {
      const filePath = path.join(__dirname, '../../uploads', banner.image_url);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { /* bỏ qua lỗi xóa file */ }
      }
    });

    res.json({
      success: true,
      message: `Đã xóa brand và ${banners.length} banner liên quan!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
