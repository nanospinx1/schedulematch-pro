const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients WHERE user_id = ? ORDER BY name').all(req.user.id);
  res.json(clients);
});

router.post('/', (req, res) => {
  const { name, email, phone, address, notes, timezone, availability } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = db.prepare(
    'INSERT INTO clients (user_id, name, email, phone, address, notes, timezone) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, email || null, phone || null, address || null, notes || null, timezone || null);

  const clientId = result.lastInsertRowid;

  if (availability && Array.isArray(availability)) {
    const stmt = db.prepare('INSERT INTO client_availability (client_id, date, start_time, end_time, note) VALUES (?, ?, ?, ?, ?)');
    for (const slot of availability) {
      stmt.run(clientId, slot.date, slot.start_time, slot.end_time, slot.note || '');
    }
  }

  res.json({ id: clientId, message: 'Client created' });
});

router.get('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const availability = db.prepare('SELECT * FROM client_availability WHERE client_id = ?').all(client.id);
  res.json({ ...client, availability });
});

router.put('/:id', (req, res) => {
  const { name, email, phone, address, notes, timezone, availability } = req.body;
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  db.prepare(
    'UPDATE clients SET name=?, email=?, phone=?, address=?, notes=?, timezone=? WHERE id=?'
  ).run(name || client.name, email ?? client.email, phone ?? client.phone, address ?? client.address, notes ?? client.notes, timezone ?? client.timezone, client.id);

  if (availability && Array.isArray(availability)) {
    db.prepare('DELETE FROM client_availability WHERE client_id = ?').run(client.id);
    const stmt = db.prepare('INSERT INTO client_availability (client_id, date, start_time, end_time, note) VALUES (?, ?, ?, ?, ?)');
    for (const slot of availability) {
      stmt.run(client.id, slot.date, slot.start_time, slot.end_time, slot.note || '');
    }
  }

  res.json({ message: 'Client updated' });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM clients WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });
  res.json({ message: 'Client deleted' });
});

module.exports = router;
