const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', (req, res) => {
  const prefs = db.prepare('SELECT * FROM preferences WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(prefs);
});

router.post('/', (req, res) => {
  const { preference_text } = req.body;
  if (!preference_text) return res.status(400).json({ error: 'preference_text is required' });

  const result = db.prepare(
    'INSERT INTO preferences (user_id, preference_text) VALUES (?, ?)'
  ).run(req.user.id, preference_text);

  res.json({ id: result.lastInsertRowid, message: 'Preference saved' });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM preferences WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Preference not found' });
  res.json({ message: 'Preference deleted' });
});

module.exports = router;
