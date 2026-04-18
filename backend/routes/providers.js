const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', (req, res) => {
  const providers = db.prepare('SELECT * FROM providers WHERE user_id = ? ORDER BY name').all(req.user.id);
  res.json(providers);
});

router.post('/', (req, res) => {
  const { name, email, phone, address, specialty, notes, availability } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = db.prepare(
    'INSERT INTO providers (user_id, name, email, phone, address, specialty, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, email || null, phone || null, address || null, specialty || null, notes || null);

  const providerId = result.lastInsertRowid;

  if (availability && Array.isArray(availability)) {
    const stmt = db.prepare('INSERT INTO provider_availability (provider_id, date, start_time, end_time, note) VALUES (?, ?, ?, ?, ?)');
    for (const slot of availability) {
      stmt.run(providerId, slot.date, slot.start_time, slot.end_time, slot.note || '');
    }
  }

  res.json({ id: providerId, message: 'Provider created' });
});

router.get('/:id', (req, res) => {
  const provider = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  const availability = db.prepare('SELECT * FROM provider_availability WHERE provider_id = ?').all(provider.id);
  res.json({ ...provider, availability });
});

router.put('/:id', (req, res) => {
  const { name, email, phone, address, specialty, notes, availability } = req.body;
  const provider = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  db.prepare(
    'UPDATE providers SET name=?, email=?, phone=?, address=?, specialty=?, notes=? WHERE id=?'
  ).run(name || provider.name, email ?? provider.email, phone ?? provider.phone, address ?? provider.address, specialty ?? provider.specialty, notes ?? provider.notes, provider.id);

  if (availability && Array.isArray(availability)) {
    db.prepare('DELETE FROM provider_availability WHERE provider_id = ?').run(provider.id);
    const stmt = db.prepare('INSERT INTO provider_availability (provider_id, date, start_time, end_time, note) VALUES (?, ?, ?, ?, ?)');
    for (const slot of availability) {
      stmt.run(provider.id, slot.date, slot.start_time, slot.end_time, slot.note || '');
    }
  }

  res.json({ message: 'Provider updated' });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM providers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Provider not found' });
  res.json({ message: 'Provider deleted' });
});

module.exports = router;
