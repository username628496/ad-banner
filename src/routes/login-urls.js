const express = require('express');
const router = express.Router();
const db = require('../db');

const validateId = (id) => /^[a-z0-9-]+$/.test(id);

// GET /api/login-urls
router.get('/', (req, res) => {
  const urls = db.prepare(
    'SELECT * FROM login_urls ORDER BY created_at ASC'
  ).all();
  res.json({ success: true, data: urls });
});

// POST /api/login-urls
router.post('/', (req, res) => {
  const { id, url } = req.body;
  if (!id || !url) {
    return res.status(400).json({ success: false, message: 'id và url là bắt buộc!' });
  }
  if (!validateId(id)) {
    return res.status(400).json({ success: false, message: 'ID chỉ được chứa a-z, 0-9, dấu gạch ngang!' });
  }
  const existing = db.prepare('SELECT id FROM login_urls WHERE id = ?').get(id);
  if (existing) {
    return res.status(400).json({ success: false, message: `ID "${id}" đã tồn tại!` });
  }
  db.prepare('INSERT INTO login_urls (id, url) VALUES (?, ?)').run(id, url);
  res.json({ success: true, data: { id, url } });
});

// PUT /api/login-urls/:id
router.put('/:id', (req, res) => {
  const { url, newId } = req.body;
  const oldId = req.params.id;

  if (!url) {
    return res.status(400).json({ success: false, message: 'url là bắt buộc!' });
  }

  const existing = db.prepare('SELECT id FROM login_urls WHERE id = ?').get(oldId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy!' });
  }

  // Nếu đổi ID
  if (newId && newId !== oldId) {
    if (!validateId(newId)) {
      return res.status(400).json({ success: false, message: 'ID mới không hợp lệ!' });
    }
    const duplicate = db.prepare('SELECT id FROM login_urls WHERE id = ?').get(newId);
    if (duplicate) {
      return res.status(400).json({ success: false, message: `ID "${newId}" đã tồn tại!` });
    }
    db.prepare('UPDATE login_urls SET id = ?, url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newId, url, oldId);
  } else {
    db.prepare('UPDATE login_urls SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(url, oldId);
  }

  res.json({ success: true, message: 'Đã cập nhật!' });
});

// DELETE /api/login-urls/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM login_urls WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy!' });
  }
  db.prepare('DELETE FROM login_urls WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Đã xóa!' });
});

module.exports = router;