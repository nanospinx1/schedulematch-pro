const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Get suggestions: find overlapping availability between a client and providers on specific dates
router.get('/suggestions/:clientId', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(req.params.clientId, req.user.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Only consider future availability (today onwards)
  const today = new Date().toISOString().split('T')[0];
  const clientSlots = db.prepare('SELECT * FROM client_availability WHERE client_id = ? AND date >= ? ORDER BY date, start_time').all(client.id, today);
  const providers = db.prepare('SELECT * FROM providers WHERE user_id = ?').all(req.user.id);

  const suggestions = [];
  for (const provider of providers) {
    const providerSlots = db.prepare('SELECT * FROM provider_availability WHERE provider_id = ? AND date >= ? ORDER BY date, start_time').all(provider.id, today);

    const overlaps = [];
    for (const cs of clientSlots) {
      for (const ps of providerSlots) {
        if (cs.date === ps.date) {
          const overlapStart = cs.start_time > ps.start_time ? cs.start_time : ps.start_time;
          const overlapEnd = cs.end_time < ps.end_time ? cs.end_time : ps.end_time;
          if (overlapStart < overlapEnd) {
            overlaps.push({
              date: cs.date,
              start_time: overlapStart,
              end_time: overlapEnd
            });
          }
        }
      }
    }

    if (overlaps.length > 0) {
      suggestions.push({
        provider: { id: provider.id, name: provider.name, specialty: provider.specialty, address: provider.address },
        available_slots: overlaps
      });
    }
  }

  suggestions.sort((a, b) => b.available_slots.length - a.available_slots.length);

  res.json({ client: { id: client.id, name: client.name }, suggestions });
});

// Real-time suggestion endpoint (for use during phone calls)
router.post('/realtime-suggest', (req, res) => {
  const { client_id, preferred_dates, preferred_time_start, preferred_time_end } = req.body;

  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(client_id, req.user.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const today = new Date().toISOString().split('T')[0];
  const providers = db.prepare('SELECT * FROM providers WHERE user_id = ?').all(req.user.id);
  const results = [];

  for (const provider of providers) {
    const providerSlots = db.prepare('SELECT * FROM provider_availability WHERE provider_id = ? AND date >= ? ORDER BY date, start_time').all(provider.id, today);

    for (const slot of providerSlots) {
      const dateMatch = !preferred_dates || preferred_dates.length === 0 || preferred_dates.includes(slot.date);
      const timeMatch = (!preferred_time_start || slot.end_time > preferred_time_start) &&
                        (!preferred_time_end || slot.start_time < preferred_time_end);

      if (dateMatch && timeMatch) {
        results.push({
          provider: { id: provider.id, name: provider.name, specialty: provider.specialty },
          date: slot.date,
          start_time: slot.start_time > (preferred_time_start || '00:00') ? slot.start_time : preferred_time_start,
          end_time: slot.end_time < (preferred_time_end || '23:59') ? slot.end_time : preferred_time_end
        });
      }
    }
  }

  results.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  res.json({ suggestions: results });
});

// Get all matches
router.get('/', (req, res) => {
  const matches = db.prepare(`
    SELECT m.*, c.name as client_name, p.name as provider_name
    FROM matches m
    JOIN clients c ON m.client_id = c.id
    JOIN providers p ON m.provider_id = p.id
    WHERE m.user_id = ?
    ORDER BY m.session_date DESC, m.start_time
  `).all(req.user.id);
  res.json(matches);
});

// Create a match (schedule a session)
router.post('/', (req, res) => {
  const { client_id, provider_id, session_date, start_time, end_time, notes } = req.body;
  if (!client_id || !provider_id || !session_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'client_id, provider_id, session_date, start_time, and end_time are required' });
  }

  const result = db.prepare(
    'INSERT INTO matches (user_id, client_id, provider_id, session_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, client_id, provider_id, session_date, start_time, end_time, notes || null);

  res.json({ id: result.lastInsertRowid, message: 'Session scheduled' });
});

// Update match status
router.put('/:id', (req, res) => {
  const { status, notes } = req.body;
  const match = db.prepare('SELECT * FROM matches WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  db.prepare('UPDATE matches SET status=?, notes=? WHERE id=?')
    .run(status || match.status, notes ?? match.notes, match.id);

  res.json({ message: 'Match updated' });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM matches WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Match not found' });
  res.json({ message: 'Match deleted' });
});

module.exports = router;
