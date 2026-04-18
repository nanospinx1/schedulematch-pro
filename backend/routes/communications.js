const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', (req, res) => {
  const logs = db.prepare(`
    SELECT co.*, c.name as client_name
    FROM communications co
    LEFT JOIN clients c ON co.client_id = c.id
    WHERE co.user_id = ?
    ORDER BY co.created_at DESC
  `).all(req.user.id);
  res.json(logs);
});

router.post('/', (req, res) => {
  const { match_id, client_id, comm_type, content } = req.body;
  if (!comm_type || !content) {
    return res.status(400).json({ error: 'comm_type and content are required' });
  }

  const result = db.prepare(
    'INSERT INTO communications (match_id, user_id, client_id, comm_type, content) VALUES (?, ?, ?, ?, ?)'
  ).run(match_id || null, req.user.id, client_id || null, comm_type, content);

  res.json({ id: result.lastInsertRowid, message: 'Communication logged' });
});

module.exports = router;
