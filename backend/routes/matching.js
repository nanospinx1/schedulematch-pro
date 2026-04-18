const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// --- Timezone helpers ---
// Compute offset in minutes from UTC for a given IANA timezone
function getUtcOffsetMinutes(tz) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric' });
    const parts = fmt.formatToParts(now);
    const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0');
    const tzH = get('hour') === 24 ? 0 : get('hour');
    const tzM = get('minute');
    const tzDay = get('day');

    const utcFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric' });
    const utcParts = utcFmt.formatToParts(now);
    const getU = (type) => parseInt(utcParts.find(p => p.type === type)?.value || '0');
    const utcH = getU('hour') === 24 ? 0 : getU('hour');
    const utcM = getU('minute');
    const utcDay = getU('day');

    let offset = (tzH * 60 + tzM) - (utcH * 60 + utcM);
    if (tzDay !== utcDay) {
      offset += (tzDay > utcDay ? 1 : -1) * 1440;
    }
    return offset;
  } catch {
    return 0;
  }
}

// Convert "HH:MM" time + date to UTC minutes-from-midnight, accounting for timezone
function toUtcMinutes(time, tzOffsetMin) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m - tzOffsetMin;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Convert a slot to UTC minute ranges for a given timezone offset
function slotToUtcRange(slot, tzOffsetMin) {
  const startMin = toUtcMinutes(slot.start_time, tzOffsetMin);
  const endMin = toUtcMinutes(slot.end_time, tzOffsetMin);
  return { date: slot.date, startMin, endMin };
}

// Get booked time ranges for a person (client or provider) from matches table
function getBookedRanges(userId, personType, personId, today) {
  const col = personType === 'client' ? 'client_id' : 'provider_id';
  const booked = db.prepare(
    `SELECT session_date, start_time, end_time FROM matches 
     WHERE user_id = ? AND ${col} = ? AND session_date >= ? AND status IN ('pending', 'confirmed')`
  ).all(userId, personId, today);
  return booked.map(b => ({
    date: b.session_date,
    startMin: timeToMinutes(b.start_time),
    endMin: timeToMinutes(b.end_time)
  }));
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Subtract booked ranges from an overlap range, returning remaining free segments
function subtractBooked(overlapStart, overlapEnd, bookedOnDate) {
  let free = [{ start: overlapStart, end: overlapEnd }];
  for (const b of bookedOnDate) {
    const next = [];
    for (const seg of free) {
      if (b.startMin >= seg.end || b.endMin <= seg.start) {
        next.push(seg);
      } else {
        if (b.startMin > seg.start) next.push({ start: seg.start, end: b.startMin });
        if (b.endMin < seg.end) next.push({ start: b.endMin, end: seg.end });
      }
    }
    free = next;
  }
  return free;
}

// --- Enhanced suggestions endpoint ---
router.get('/suggestions/:clientId', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(req.params.clientId, req.user.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const today = new Date().toISOString().split('T')[0];
  const clientSlots = db.prepare('SELECT * FROM client_availability WHERE client_id = ? AND date >= ? ORDER BY date, start_time').all(client.id, today);
  const providers = db.prepare('SELECT * FROM providers WHERE user_id = ?').all(req.user.id);

  const clientTzOffset = getUtcOffsetMinutes(client.timezone || 'America/New_York');

  // Get client's booked ranges
  const clientBooked = getBookedRanges(req.user.id, 'client', client.id, today);

  const suggestions = [];
  for (const provider of providers) {
    const providerSlots = db.prepare('SELECT * FROM provider_availability WHERE provider_id = ? AND date >= ? ORDER BY date, start_time').all(provider.id, today);
    const providerTzOffset = getUtcOffsetMinutes(provider.timezone || 'America/New_York');

    // Count existing bookings for this provider (for load scoring)
    const providerBookingCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM matches WHERE user_id = ? AND provider_id = ? AND session_date >= ? AND status IN ('pending', 'confirmed')`
    ).get(req.user.id, provider.id, today).cnt;

    // Get provider's booked ranges
    const providerBooked = getBookedRanges(req.user.id, 'provider', provider.id, today);

    // Timezone proximity bonus (same offset = 10, within 1hr = 5, within 2hr = 2)
    const tzDiffHours = Math.abs(clientTzOffset - providerTzOffset) / 60;
    const tzProximityScore = tzDiffHours === 0 ? 10 : tzDiffHours <= 1 ? 5 : tzDiffHours <= 2 ? 2 : 0;

    const overlaps = [];
    for (const cs of clientSlots) {
      for (const ps of providerSlots) {
        if (cs.date !== ps.date) continue;

        // Convert both to UTC minutes for comparison
        const csStart = toUtcMinutes(cs.start_time, clientTzOffset);
        const csEnd = toUtcMinutes(cs.end_time, clientTzOffset);
        const psStart = toUtcMinutes(ps.start_time, providerTzOffset);
        const psEnd = toUtcMinutes(ps.end_time, providerTzOffset);

        const overlapStart = Math.max(csStart, psStart);
        const overlapEnd = Math.min(csEnd, psEnd);

        if (overlapStart >= overlapEnd) continue;

        // Subtract already-booked ranges for both client and provider on this date
        const bookedOnDate = [
          ...clientBooked.filter(b => b.date === cs.date),
          ...providerBooked.filter(b => b.date === cs.date)
        ];
        const freeSegments = subtractBooked(overlapStart, overlapEnd, bookedOnDate);

        for (const seg of freeSegments) {
          const durationMin = seg.end - seg.start;
          if (durationMin < 15) continue; // Skip tiny fragments

          // Convert back to provider's local time for display
          const displayStart = seg.start + providerTzOffset;
          const displayEnd = seg.end + providerTzOffset;

          // Score: duration weight (1 pt per 15 min) + tz proximity + load balance
          const durationScore = Math.floor(durationMin / 15);
          const loadScore = Math.max(0, 10 - providerBookingCount); // fewer bookings = higher score
          const score = durationScore + tzProximityScore + loadScore;

          overlaps.push({
            date: cs.date,
            start_time: minutesToTime(displayStart),
            end_time: minutesToTime(displayEnd),
            duration_minutes: durationMin,
            score
          });
        }
      }
    }

    if (overlaps.length > 0) {
      // Sort by score desc, then date asc
      overlaps.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));

      const totalScore = overlaps.reduce((sum, o) => sum + o.score, 0);
      suggestions.push({
        provider: {
          id: provider.id,
          name: provider.name,
          specialty: provider.specialty,
          address: provider.address,
          timezone: provider.timezone
        },
        total_score: totalScore,
        match_count: overlaps.length,
        provider_load: providerBookingCount,
        tz_proximity: tzDiffHours,
        available_slots: overlaps.slice(0, 20) // Top 20 slots per provider
      });
    }
  }

  // Rank providers by total score
  suggestions.sort((a, b) => b.total_score - a.total_score);

  res.json({
    client: { id: client.id, name: client.name, timezone: client.timezone },
    suggestions
  });
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

// --- Recurring scheduling helpers ---
function generateRecurringDates(startDate, cadence, count) {
  const dates = [];
  const d = new Date(startDate + 'T12:00:00');
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().split('T')[0]);
    if (cadence === 'weekly') d.setDate(d.getDate() + 7);
    else if (cadence === 'biweekly') d.setDate(d.getDate() + 14);
    else if (cadence === 'monthly') {
      const targetDay = new Date(startDate + 'T12:00:00').getDate();
      d.setMonth(d.getMonth() + 1);
      // Clamp to last day of month if target day doesn't exist
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(targetDay, lastDay));
    }
  }
  return dates;
}

function classifyOccurrence(userId, clientId, providerId, date, startTime, endTime, clientSlots, providerSlots, clientTzOffset, providerTzOffset) {
  // Check conflicts with existing matches
  const conflicts = db.prepare(
    `SELECT m.*, c.name as client_name, p.name as provider_name
     FROM matches m JOIN clients c ON m.client_id = c.id JOIN providers p ON m.provider_id = p.id
     WHERE m.user_id = ? AND m.session_date = ? AND m.status IN ('pending', 'confirmed')
     AND (m.client_id = ? OR m.provider_id = ?)
     AND m.start_time < ? AND m.end_time > ?`
  ).all(userId, date, clientId, providerId, endTime, startTime);

  if (conflicts.length > 0) return { status: 'conflict', conflicts };

  // Check if availability exists for this date
  const clientHasAvail = clientSlots.some(s => s.date === date);
  const providerHasAvail = providerSlots.some(s => s.date === date);

  if (clientHasAvail && providerHasAvail) {
    // Verify the time actually falls within available slots
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const clientCovered = clientSlots.some(s => s.date === date && timeToMinutes(s.start_time) <= startMin && timeToMinutes(s.end_time) >= endMin);
    const providerCovered = providerSlots.some(s => s.date === date && timeToMinutes(s.start_time) <= startMin && timeToMinutes(s.end_time) >= endMin);
    if (clientCovered && providerCovered) return { status: 'verified' };
    return { status: 'partial', reason: !clientCovered ? 'Client not available at this time' : 'Provider not available at this time' };
  }

  return { status: 'unverified', reason: !clientHasAvail && !providerHasAvail ? 'No availability data for either party' : !clientHasAvail ? 'No client availability data' : 'No provider availability data' };
}

// Preview recurring series (dry run)
router.post('/recurring/preview', (req, res) => {
  const { client_id, provider_id, start_date, start_time, end_time, cadence, num_sessions } = req.body;
  if (!client_id || !provider_id || !start_date || !start_time || !end_time || !cadence || !num_sessions) {
    return res.status(400).json({ error: 'All fields required: client_id, provider_id, start_date, start_time, end_time, cadence, num_sessions' });
  }
  if (!['weekly', 'biweekly', 'monthly'].includes(cadence)) return res.status(400).json({ error: 'Cadence must be weekly, biweekly, or monthly' });
  if (num_sessions < 2 || num_sessions > 52) return res.status(400).json({ error: 'num_sessions must be between 2 and 52' });

  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(client_id, req.user.id);
  const provider = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(provider_id, req.user.id);
  if (!client || !provider) return res.status(404).json({ error: 'Client or provider not found' });

  const dates = generateRecurringDates(start_date, cadence, num_sessions);
  const clientSlots = db.prepare('SELECT * FROM client_availability WHERE client_id = ?').all(client_id);
  const providerSlots = db.prepare('SELECT * FROM provider_availability WHERE provider_id = ?').all(provider_id);
  const clientTzOffset = getUtcOffsetMinutes(client.timezone || 'America/New_York');
  const providerTzOffset = getUtcOffsetMinutes(provider.timezone || 'America/New_York');

  const occurrences = dates.map(date => {
    const result = classifyOccurrence(req.user.id, client_id, provider_id, date, start_time, end_time, clientSlots, providerSlots, clientTzOffset, providerTzOffset);
    return { date, start_time, end_time, ...result };
  });

  const summary = {
    verified: occurrences.filter(o => o.status === 'verified').length,
    unverified: occurrences.filter(o => o.status === 'unverified' || o.status === 'partial').length,
    conflict: occurrences.filter(o => o.status === 'conflict').length,
  };

  res.json({ client, provider, cadence, occurrences, summary });
});

// Create recurring series
router.post('/recurring', (req, res) => {
  const { client_id, provider_id, start_date, start_time, end_time, cadence, num_sessions, notes, skip_conflicts } = req.body;
  if (!client_id || !provider_id || !start_date || !start_time || !end_time || !cadence || !num_sessions) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(client_id, req.user.id);
  const provider = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(provider_id, req.user.id);
  if (!client || !provider) return res.status(404).json({ error: 'Client or provider not found' });

  const dates = generateRecurringDates(start_date, cadence, num_sessions);
  const clientSlots = db.prepare('SELECT * FROM client_availability WHERE client_id = ?').all(client_id);
  const providerSlots = db.prepare('SELECT * FROM provider_availability WHERE provider_id = ?').all(provider_id);
  const clientTzOffset = getUtcOffsetMinutes(client.timezone || 'America/New_York');
  const providerTzOffset = getUtcOffsetMinutes(provider.timezone || 'America/New_York');
  const recurrenceGroup = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const insertStmt = db.prepare(
    'INSERT INTO matches (user_id, client_id, provider_id, session_date, start_time, end_time, notes, recurrence_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const created = [];
  const skipped = [];

  const txn = db.transaction(() => {
    for (const date of dates) {
      const result = classifyOccurrence(req.user.id, client_id, provider_id, date, start_time, end_time, clientSlots, providerSlots, clientTzOffset, providerTzOffset);
      if (result.status === 'conflict') {
        if (skip_conflicts !== false) {
          skipped.push({ date, reason: 'conflict' });
          continue;
        }
      }
      const r = insertStmt.run(req.user.id, client_id, provider_id, date, start_time, end_time, notes || null, recurrenceGroup);
      created.push({ id: r.lastInsertRowid, date, status: result.status });
    }
  });
  txn();

  res.json({ recurrence_group: recurrenceGroup, created, skipped, total_requested: dates.length });
});

// Delete entire recurring series
router.delete('/recurring/:groupId', (req, res) => {
  const result = db.prepare('DELETE FROM matches WHERE recurrence_group = ? AND user_id = ?').run(req.params.groupId, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Series not found' });
  res.json({ message: `Deleted ${result.changes} sessions`, deleted: result.changes });
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

// Create a match (schedule a session) — with conflict detection
router.post('/', (req, res) => {
  const { client_id, provider_id, session_date, start_time, end_time, notes } = req.body;
  if (!client_id || !provider_id || !session_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'client_id, provider_id, session_date, start_time, and end_time are required' });
  }

  // Conflict detection: check for overlapping sessions
  const conflicts = db.prepare(`
    SELECT m.*, c.name as client_name, p.name as provider_name
    FROM matches m
    JOIN clients c ON m.client_id = c.id
    JOIN providers p ON m.provider_id = p.id
    WHERE m.user_id = ? AND m.session_date = ? AND m.status IN ('pending', 'confirmed')
    AND (m.client_id = ? OR m.provider_id = ?)
    AND m.start_time < ? AND m.end_time > ?
  `).all(req.user.id, session_date, client_id, provider_id, end_time, start_time);

  if (conflicts.length > 0 && !req.body.force) {
    return res.status(409).json({
      error: 'Scheduling conflict detected',
      conflicts: conflicts.map(c => ({
        id: c.id,
        client_name: c.client_name,
        provider_name: c.provider_name,
        session_date: c.session_date,
        start_time: c.start_time,
        end_time: c.end_time,
        status: c.status,
        conflict_type: c.client_id == client_id ? 'client' : 'provider'
      }))
    });
  }

  const result = db.prepare(
    'INSERT INTO matches (user_id, client_id, provider_id, session_date, start_time, end_time, notes, recurrence_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, client_id, provider_id, session_date, start_time, end_time, notes || null, null);

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
