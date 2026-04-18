/**
 * Tool Registry — single source of truth for AI agent tools.
 * Each tool has: name, description, parameters (JSON Schema), handler(args, ctx).
 * ctx = { userId, db } injected by the agent runner from auth middleware.
 */
const TOOLS = [];

function defineTool(name, description, parameters, handler) {
  TOOLS.push({ name, description, parameters, handler });
}

// ── Helper ──
function timeToMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minutesToTime(m) { const h = Math.floor(m / 60); return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function getUtcOffsetMinutes(tz) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const parts = fmt.formatToParts(now);
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || '+0';
    const match = offsetStr.match(/GMT([+-]?\d+)?:?(\d+)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0', 10);
    const mins = parseInt(match[2] || '0', 10);
    return hours * 60 + (hours < 0 ? -mins : mins);
  } catch { return 0; }
}

// ═══════════════════════════════════════
//  CLIENT TOOLS
// ═══════════════════════════════════════

defineTool('list_clients', 'List all clients in the system', {
  type: 'object', properties: {}, required: []
}, (args, { userId, db }) => {
  const rows = db.prepare('SELECT id, name, email, phone, timezone FROM clients WHERE user_id = ? ORDER BY name').all(userId);
  return { count: rows.length, clients: rows };
});

defineTool('create_client', 'Create a new client', {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Full name of the client' },
    email: { type: 'string', description: 'Email address' },
    phone: { type: 'string', description: 'Phone number' },
    timezone: { type: 'string', description: 'IANA timezone e.g. America/New_York' },
  },
  required: ['name']
}, (args, { userId, db }) => {
  const result = db.prepare(
    'INSERT INTO clients (user_id, name, email, phone, timezone, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, args.name, args.email || '', args.phone || '', args.timezone || 'America/New_York', '', '');
  return { id: result.lastInsertRowid, name: args.name, created: true };
});

defineTool('get_client_detail', 'Get detailed information about a specific client', {
  type: 'object',
  properties: { client_id: { type: 'number', description: 'Client ID' } },
  required: ['client_id']
}, (args, { userId, db }) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(args.client_id, userId);
  if (!client) return { error: 'Client not found' };
  const sessions = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('pending','confirmed') THEN 1 ELSE 0 END) as active FROM matches WHERE client_id = ? AND user_id = ?"
  ).get(args.client_id, userId);
  return { ...client, sessions_total: sessions.total, sessions_active: sessions.active };
});

// ═══════════════════════════════════════
//  PROVIDER TOOLS
// ═══════════════════════════════════════

defineTool('list_providers', 'List all providers in the system', {
  type: 'object', properties: {}, required: []
}, (args, { userId, db }) => {
  const rows = db.prepare('SELECT id, name, email, phone, specialty, timezone FROM providers WHERE user_id = ? ORDER BY name').all(userId);
  return { count: rows.length, providers: rows };
});

defineTool('create_provider', 'Create a new provider', {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Full name of the provider' },
    email: { type: 'string', description: 'Email address' },
    phone: { type: 'string', description: 'Phone number' },
    specialty: { type: 'string', description: 'Provider specialty e.g. Physical Therapy' },
    timezone: { type: 'string', description: 'IANA timezone e.g. America/Chicago' },
  },
  required: ['name']
}, (args, { userId, db }) => {
  const result = db.prepare(
    'INSERT INTO providers (user_id, name, email, phone, specialty, timezone, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, args.name, args.email || '', args.phone || '', args.specialty || '', args.timezone || 'America/New_York', '', '');
  return { id: result.lastInsertRowid, name: args.name, created: true };
});

defineTool('get_provider_detail', 'Get detailed information about a specific provider', {
  type: 'object',
  properties: { provider_id: { type: 'number', description: 'Provider ID' } },
  required: ['provider_id']
}, (args, { userId, db }) => {
  const provider = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(args.provider_id, userId);
  if (!provider) return { error: 'Provider not found' };
  const sessions = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('pending','confirmed') THEN 1 ELSE 0 END) as active FROM matches WHERE provider_id = ? AND user_id = ?"
  ).get(args.provider_id, userId);
  return { ...provider, sessions_total: sessions.total, sessions_active: sessions.active };
});

// ═══════════════════════════════════════
//  SCHEDULING TOOLS
// ═══════════════════════════════════════

defineTool('find_available_providers', 'Find providers with available time slots that match a client\'s schedule. Returns ranked providers with their open slots.', {
  type: 'object',
  properties: {
    client_id: { type: 'number', description: 'Client ID to find providers for' },
    day_of_week: { type: 'array', items: { type: 'number' }, description: 'Day numbers (0=Sun, 1=Mon, ..., 6=Sat) to filter by' },
    time_start: { type: 'string', description: 'Earliest preferred time in HH:MM format' },
    time_end: { type: 'string', description: 'Latest preferred time in HH:MM format' },
    min_duration: { type: 'number', description: 'Minimum session duration in minutes (default 30)' },
    weeks_ahead: { type: 'number', description: 'How many weeks ahead to search (default 4)' },
    specialty: { type: 'string', description: 'Filter providers by specialty keyword' },
  },
  required: ['client_id']
}, (args, { userId, db }) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(args.client_id, userId);
  if (!client) return { error: 'Client not found' };

  const today = new Date().toISOString().split('T')[0];
  const horizon = args.weeks_ahead || 4;
  const endDate = new Date(); endDate.setDate(endDate.getDate() + horizon * 7);
  const endDateStr = endDate.toISOString().split('T')[0];
  const clientTzOff = getUtcOffsetMinutes(client.timezone || 'America/New_York');
  const minDur = args.min_duration || 30;

  // Build date filter
  const allowed = new Set();
  if (args.day_of_week?.length > 0) {
    const daySet = new Set(args.day_of_week);
    const cur = new Date(today + 'T12:00:00');
    while (cur.toISOString().split('T')[0] <= endDateStr) {
      if (daySet.has(cur.getDay())) allowed.add(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }
  const hasFilter = allowed.size > 0;
  const timeStartMin = args.time_start ? timeToMinutes(args.time_start) : 0;
  const timeEndMin = args.time_end ? timeToMinutes(args.time_end) : 1440;

  // Get booked ranges helper
  const getBooked = (col, personId) => db.prepare(
    `SELECT session_date, start_time, end_time FROM matches WHERE user_id = ? AND ${col} = ? AND session_date >= ? AND status IN ('pending','confirmed')`
  ).all(userId, personId, today).map(b => ({ date: b.session_date, startMin: timeToMinutes(b.start_time), endMin: timeToMinutes(b.end_time) }));

  const clientBooked = getBooked('client_id', client.id);
  let providersList = db.prepare('SELECT * FROM providers WHERE user_id = ?').all(userId);
  if (args.specialty) {
    const sl = args.specialty.toLowerCase();
    providersList = providersList.filter(p => p.specialty?.toLowerCase().includes(sl));
  }

  const results = [];
  for (const prov of providersList) {
    const provTzOff = getUtcOffsetMinutes(prov.timezone || 'America/New_York');
    const slots = db.prepare('SELECT * FROM provider_availability WHERE provider_id = ? AND date >= ? AND date <= ? ORDER BY date, start_time').all(prov.id, today, endDateStr);
    const provBooked = getBooked('provider_id', prov.id);
    const matchedSlots = [];

    for (const ps of slots) {
      if (hasFilter && !allowed.has(ps.date)) continue;
      const psStartUtc = timeToMinutes(ps.start_time) - provTzOff;
      const psEndUtc = timeToMinutes(ps.end_time) - provTzOff;
      const wStartUtc = timeStartMin - clientTzOff;
      const wEndUtc = timeEndMin - clientTzOff;
      const cs = Math.max(psStartUtc, wStartUtc);
      const ce = Math.min(psEndUtc, wEndUtc);
      if (ce - cs < minDur) continue;

      const bookedOnDate = [...clientBooked.filter(b => b.date === ps.date), ...provBooked.filter(b => b.date === ps.date)];
      let free = [{ start: cs, end: ce }];
      for (const b of bookedOnDate) {
        const next = [];
        for (const seg of free) {
          if (b.startMin >= seg.end || b.endMin <= seg.start) next.push(seg);
          else {
            if (b.startMin > seg.start) next.push({ start: seg.start, end: b.startMin });
            if (b.endMin < seg.end) next.push({ start: b.endMin, end: seg.end });
          }
        }
        free = next;
      }

      for (const seg of free) {
        if (seg.end - seg.start < minDur) continue;
        matchedSlots.push({
          date: ps.date, start_time: minutesToTime(seg.start + provTzOff),
          end_time: minutesToTime(seg.end + provTzOff), duration_minutes: seg.end - seg.start
        });
      }
    }

    if (matchedSlots.length > 0) {
      results.push({
        provider: { id: prov.id, name: prov.name, specialty: prov.specialty, timezone: prov.timezone },
        slots: matchedSlots.slice(0, 8)
      });
    }
  }

  results.sort((a, b) => b.slots.length - a.slots.length);
  return { client: { id: client.id, name: client.name, timezone: client.timezone }, provider_count: results.length, providers: results.slice(0, 8) };
});

defineTool('book_session', 'Book a scheduling session between a client and provider. Checks for conflicts first.', {
  type: 'object',
  properties: {
    client_id: { type: 'number', description: 'Client ID' },
    provider_id: { type: 'number', description: 'Provider ID' },
    session_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
    start_time: { type: 'string', description: 'Start time in HH:MM format' },
    end_time: { type: 'string', description: 'End time in HH:MM format' },
    notes: { type: 'string', description: 'Optional session notes' },
  },
  required: ['client_id', 'provider_id', 'session_date', 'start_time', 'end_time']
}, (args, { userId, db }) => {
  // Transaction for atomicity
  const bookTxn = db.transaction(() => {
    // Re-check conflicts inside transaction
    const conflicts = db.prepare(
      `SELECT m.*, c.name as client_name, p.name as provider_name FROM matches m
       JOIN clients c ON m.client_id = c.id JOIN providers p ON m.provider_id = p.id
       WHERE m.user_id = ? AND m.session_date = ? AND m.status IN ('pending','confirmed')
       AND ((m.client_id = ? OR m.provider_id = ?) AND m.start_time < ? AND m.end_time > ?)`
    ).all(userId, args.session_date, args.client_id, args.provider_id, args.end_time, args.start_time);

    if (conflicts.length > 0) {
      return { booked: false, conflict: true, conflicts: conflicts.map(c => ({
        client: c.client_name, provider: c.provider_name,
        time: `${c.start_time}-${c.end_time}`
      }))};
    }

    const result = db.prepare(
      'INSERT INTO matches (user_id, client_id, provider_id, session_date, start_time, end_time, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, args.client_id, args.provider_id, args.session_date, args.start_time, args.end_time, 'pending', args.notes || '');

    const client = db.prepare('SELECT name FROM clients WHERE id = ?').get(args.client_id);
    const provider = db.prepare('SELECT name FROM providers WHERE id = ?').get(args.provider_id);
    return { booked: true, session_id: result.lastInsertRowid, client: client?.name, provider: provider?.name, date: args.session_date, start_time: args.start_time, end_time: args.end_time };
  });

  return bookTxn();
});

defineTool('list_sessions', 'List scheduled sessions, optionally filtered by status or client/provider', {
  type: 'object',
  properties: {
    status: { type: 'string', description: 'Filter by status: pending, confirmed, completed, cancelled' },
    client_id: { type: 'number', description: 'Filter by client ID' },
    provider_id: { type: 'number', description: 'Filter by provider ID' },
    limit: { type: 'number', description: 'Max results (default 20)' },
  },
  required: []
}, (args, { userId, db }) => {
  let sql = `SELECT m.*, c.name as client_name, p.name as provider_name FROM matches m
             JOIN clients c ON m.client_id = c.id JOIN providers p ON m.provider_id = p.id
             WHERE m.user_id = ?`;
  const params = [userId];
  if (args.status) { sql += ' AND m.status = ?'; params.push(args.status); }
  if (args.client_id) { sql += ' AND m.client_id = ?'; params.push(args.client_id); }
  if (args.provider_id) { sql += ' AND m.provider_id = ?'; params.push(args.provider_id); }
  sql += ' ORDER BY m.session_date DESC, m.start_time LIMIT ?';
  params.push(args.limit || 20);
  const rows = db.prepare(sql).all(...params);
  return { count: rows.length, sessions: rows.map(r => ({
    id: r.id, client: r.client_name, provider: r.provider_name,
    date: r.session_date, start_time: r.start_time, end_time: r.end_time, status: r.status, notes: r.notes
  }))};
});

defineTool('update_session_status', 'Update the status of a scheduled session', {
  type: 'object',
  properties: {
    session_id: { type: 'number', description: 'Session/match ID' },
    status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'], description: 'New status' },
  },
  required: ['session_id', 'status']
}, (args, { userId, db }) => {
  const result = db.prepare('UPDATE matches SET status = ? WHERE id = ? AND user_id = ?').run(args.status, args.session_id, userId);
  return result.changes > 0 ? { updated: true, session_id: args.session_id, new_status: args.status } : { error: 'Session not found' };
});

// ═══════════════════════════════════════
//  CALENDAR TOOLS
// ═══════════════════════════════════════

defineTool('get_availability', 'Get availability schedule for a client or provider over the next few weeks', {
  type: 'object',
  properties: {
    person_type: { type: 'string', enum: ['client', 'provider'], description: 'Whether to look up a client or provider' },
    person_id: { type: 'number', description: 'The client or provider ID' },
    weeks_ahead: { type: 'number', description: 'Weeks to look ahead (default 2)' },
  },
  required: ['person_type', 'person_id']
}, (args, { userId, db }) => {
  const table = args.person_type === 'client' ? 'client_availability' : 'provider_availability';
  const ownerCol = args.person_type === 'client' ? 'client_id' : 'provider_id';
  const personTable = args.person_type === 'client' ? 'clients' : 'providers';

  const person = db.prepare(`SELECT * FROM ${personTable} WHERE id = ? AND user_id = ?`).get(args.person_id, userId);
  if (!person) return { error: `${args.person_type} not found` };

  const today = new Date().toISOString().split('T')[0];
  const end = new Date(); end.setDate(end.getDate() + (args.weeks_ahead || 2) * 7);
  const endStr = end.toISOString().split('T')[0];

  const slots = db.prepare(`SELECT date, start_time, end_time FROM ${table} WHERE ${ownerCol} = ? AND date >= ? AND date <= ? ORDER BY date, start_time`).all(args.person_id, today, endStr);
  return { person: { id: person.id, name: person.name, timezone: person.timezone || null, specialty: person.specialty || null }, slots };
});

defineTool('compare_calendars', 'Compare a client and provider calendar to find overlapping available time slots', {
  type: 'object',
  properties: {
    client_id: { type: 'number', description: 'Client ID' },
    provider_id: { type: 'number', description: 'Provider ID' },
    weeks_ahead: { type: 'number', description: 'Weeks to compare (default 2)' },
  },
  required: ['client_id', 'provider_id']
}, (args, { userId, db }) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(args.client_id, userId);
  const provider = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(args.provider_id, userId);
  if (!client) return { error: 'Client not found' };
  if (!provider) return { error: 'Provider not found' };

  const today = new Date().toISOString().split('T')[0];
  const end = new Date(); end.setDate(end.getDate() + (args.weeks_ahead || 2) * 7);
  const endStr = end.toISOString().split('T')[0];

  const clientSlots = db.prepare('SELECT date, start_time, end_time FROM client_availability WHERE client_id = ? AND date >= ? AND date <= ? ORDER BY date').all(args.client_id, today, endStr);
  const provSlots = db.prepare('SELECT date, start_time, end_time FROM provider_availability WHERE provider_id = ? AND date >= ? AND date <= ? ORDER BY date').all(args.provider_id, today, endStr);

  const overlaps = [];
  for (const cs of clientSlots) {
    for (const ps of provSlots) {
      if (cs.date !== ps.date) continue;
      const s = Math.max(timeToMinutes(cs.start_time), timeToMinutes(ps.start_time));
      const e = Math.min(timeToMinutes(cs.end_time), timeToMinutes(ps.end_time));
      if (e - s >= 30) overlaps.push({ date: cs.date, start_time: minutesToTime(s), end_time: minutesToTime(e), duration_minutes: e - s });
    }
  }

  return { client: { id: client.id, name: client.name, timezone: client.timezone }, provider: { id: provider.id, name: provider.name, timezone: provider.timezone }, overlapping_slots: overlaps };
});

// ═══════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════

/** Get all tool definitions in OpenAI function-calling format */
function getToolDefinitions() {
  return TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));
}

/** Execute a tool by name */
function executeTool(name, args, ctx) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return tool.handler(args, ctx);
  } catch (e) {
    return { error: e.message };
  }
}

/** Get MCP-compatible tool list (for future MCP server wrapper) */
function getMcpToolList() {
  return TOOLS.map(t => ({
    name: t.name, description: t.description, inputSchema: t.parameters
  }));
}

module.exports = { getToolDefinitions, executeTool, getMcpToolList, TOOLS };
