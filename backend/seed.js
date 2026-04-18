const db = require('./db');

const USER_ID = 1; // Demo Scheduler user

// US Timezones
const TZ_PACIFIC = 'America/Los_Angeles';
const TZ_MOUNTAIN = 'America/Denver';
const TZ_CENTRAL = 'America/Chicago';
const TZ_EASTERN = 'America/New_York';

// --- Seeded random for reproducibility ---
let _seed = 42;
function rand() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function chance(p) { return rand() < p; }

// Round to nearest 30 min
function roundTo30(minutes) { return Math.round(minutes / 30) * 30; }
function minToTime(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Generate a local date string
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Get all dates for next N weeks
function getAllDates(weeksAhead = 9) {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < weeksAhead * 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// --- Person schedule profiles ---
// Each person has a "personality" that drives random generation
// Fields: preferredDays (0=Sun..6=Sat), earlyBird (bool), latePerson (bool),
//         busyLevel (0.0-1.0), blockCount (1-3 typical), flexDay (chance of random extra day)
const clientProfiles = [
  // Sarah (Pacific) - morning person, busy professional, Mon-Fri
  { preferredDays: [1,2,3,4,5], earlyStart: 7*60, lateStart: 9*60, minBlock: 90, maxBlock: 240, busyChance: 0.85, extraBlockChance: 0.4, skipChance: 0.1, weekendChance: 0.15 },
  // Michael (Pacific) - afternoon person, flexible
  { preferredDays: [1,2,3,4,5], earlyStart: 11*60, lateStart: 14*60, minBlock: 60, maxBlock: 210, busyChance: 0.80, extraBlockChance: 0.35, skipChance: 0.12, weekendChance: 0.1 },
  // Emma (Pacific) - strict mornings, school mom
  { preferredDays: [1,2,3,4,5], earlyStart: 8*60, lateStart: 9*60+30, minBlock: 120, maxBlock: 300, busyChance: 0.90, extraBlockChance: 0.2, skipChance: 0.08, weekendChance: 0.25 },
  // James (Mountain) - retired, very flexible, long blocks
  { preferredDays: [1,2,3,4,5,6], earlyStart: 7*60, lateStart: 10*60, minBlock: 120, maxBlock: 360, busyChance: 0.92, extraBlockChance: 0.55, skipChance: 0.05, weekendChance: 0.6 },
  // Priya (Mountain) - evening only, limited
  { preferredDays: [1,2,3,4], earlyStart: 16*60, lateStart: 17*60+30, minBlock: 60, maxBlock: 180, busyChance: 0.78, extraBlockChance: 0.15, skipChance: 0.15, weekendChance: 0.3 },
  // David (Central) - Tue/Thu focused, some flexibility
  { preferredDays: [2,4], earlyStart: 9*60, lateStart: 11*60, minBlock: 60, maxBlock: 210, busyChance: 0.88, extraBlockChance: 0.4, skipChance: 0.1, weekendChance: 0.2 },
  // Lisa (Central) - recovering, limited energy, short blocks
  { preferredDays: [1,3,5], earlyStart: 9*60, lateStart: 11*60, minBlock: 60, maxBlock: 150, busyChance: 0.75, extraBlockChance: 0.3, skipChance: 0.18, weekendChance: 0.05 },
  // Robert (Central) - early riser, mornings only
  { preferredDays: [1,2,3,4,5], earlyStart: 6*60+30, lateStart: 8*60, minBlock: 90, maxBlock: 240, busyChance: 0.82, extraBlockChance: 0.25, skipChance: 0.12, weekendChance: 0.35 },
  // Amanda (Eastern) - mom, scattered midday blocks
  { preferredDays: [1,2,3,4,5], earlyStart: 9*60, lateStart: 11*60, minBlock: 60, maxBlock: 180, busyChance: 0.80, extraBlockChance: 0.45, skipChance: 0.15, weekendChance: 0.1 },
  // Thomas (Eastern) - chronic pain, consistent short mornings + some afternoons
  { preferredDays: [1,2,3,4,5], earlyStart: 8*60, lateStart: 9*60+30, minBlock: 60, maxBlock: 150, busyChance: 0.90, extraBlockChance: 0.35, skipChance: 0.08, weekendChance: 0.05 },
  // Jennifer (Eastern) - office worker, afternoons + lunch breaks
  { preferredDays: [1,2,3,4,5], earlyStart: 12*60, lateStart: 14*60, minBlock: 60, maxBlock: 210, busyChance: 0.85, extraBlockChance: 0.3, skipChance: 0.1, weekendChance: 0.1 },
  // Carlos (Pacific) - night shift, early mornings only
  { preferredDays: [1,2,3,4,5], earlyStart: 6*60, lateStart: 7*60+30, minBlock: 90, maxBlock: 240, busyChance: 0.82, extraBlockChance: 0.2, skipChance: 0.12, weekendChance: 0.25 },
  // Rachel (Pacific) - anxiety, prefers routine, very consistent
  { preferredDays: [1,3,5], earlyStart: 8*60, lateStart: 9*60, minBlock: 120, maxBlock: 300, busyChance: 0.92, extraBlockChance: 0.5, skipChance: 0.05, weekendChance: 0.15 },
  // William (Eastern) - post-stroke, frequent short sessions
  { preferredDays: [1,2,3,4,5], earlyStart: 7*60+30, lateStart: 9*60, minBlock: 60, maxBlock: 180, busyChance: 0.88, extraBlockChance: 0.4, skipChance: 0.08, weekendChance: 0.1 },
  // Maria (Central) - Wed/Fri focused, occasional Monday
  { preferredDays: [3,5], earlyStart: 8*60, lateStart: 10*60, minBlock: 120, maxBlock: 300, busyChance: 0.88, extraBlockChance: 0.45, skipChance: 0.08, weekendChance: 0.1 },
];

const providerProfiles = [
  // Dr. Watson (Pacific) - Mon-Thu heavy, Fri light
  { preferredDays: [1,2,3,4], earlyStart: 7*60+30, lateStart: 9*60, minBlock: 120, maxBlock: 300, busyChance: 0.92, extraBlockChance: 0.6, skipChance: 0.05, weekendChance: 0.05, friChance: 0.7 },
  // Dr. Rivera (Pacific) - Mon/Wed/Fri + occasional Sat
  { preferredDays: [1,3,5], earlyStart: 8*60, lateStart: 9*60+30, minBlock: 120, maxBlock: 270, busyChance: 0.88, extraBlockChance: 0.5, skipChance: 0.08, weekendChance: 0.4 },
  // Nurse Brooks (Mountain) - Tue-Fri, early bird
  { preferredDays: [2,3,4,5], earlyStart: 6*60+30, lateStart: 8*60, minBlock: 120, maxBlock: 300, busyChance: 0.90, extraBlockChance: 0.5, skipChance: 0.07, weekendChance: 0.35 },
  // Dr. Park (Central) - Mon-Fri, mornings dominant
  { preferredDays: [1,2,3,4,5], earlyStart: 7*60+30, lateStart: 9*60, minBlock: 90, maxBlock: 240, busyChance: 0.88, extraBlockChance: 0.4, skipChance: 0.08, weekendChance: 0.05 },
  // Jessica Nguyen (Pacific) - afternoons mostly, Wed all day
  { preferredDays: [1,2,3,4,5], earlyStart: 12*60, lateStart: 14*60, minBlock: 90, maxBlock: 240, busyChance: 0.85, extraBlockChance: 0.4, skipChance: 0.1, weekendChance: 0.1 },
  // Mark Sullivan (Central) - Tue-Thu main, Mon afternoon sometimes
  { preferredDays: [2,3,4], earlyStart: 8*60, lateStart: 10*60, minBlock: 90, maxBlock: 270, busyChance: 0.88, extraBlockChance: 0.5, skipChance: 0.08, weekendChance: 0.05 },
  // Dr. Khan (Eastern) - afternoon/evening specialist
  { preferredDays: [1,2,3,4], earlyStart: 13*60, lateStart: 15*60, minBlock: 90, maxBlock: 270, busyChance: 0.85, extraBlockChance: 0.45, skipChance: 0.1, weekendChance: 0.15 },
  // Patricia Morales (Central) - Mon-Fri early, very consistent
  { preferredDays: [1,2,3,4,5], earlyStart: 6*60, lateStart: 7*60+30, minBlock: 120, maxBlock: 300, busyChance: 0.90, extraBlockChance: 0.45, skipChance: 0.07, weekendChance: 0.3 },
  // Daniel Foster (Eastern) - early mornings Mon-Fri
  { preferredDays: [1,2,3,4,5], earlyStart: 6*60, lateStart: 7*60, minBlock: 90, maxBlock: 270, busyChance: 0.88, extraBlockChance: 0.35, skipChance: 0.08, weekendChance: 0.1 },
  // Dr. Kim (Mountain) - Wed/Fri heavy, Mon light
  { preferredDays: [3,5], earlyStart: 8*60, lateStart: 10*60, minBlock: 120, maxBlock: 300, busyChance: 0.90, extraBlockChance: 0.55, skipChance: 0.06, weekendChance: 0.25 },
];

// Generate randomized availability blocks for one person across all dates
function generateAvailability(profile, allDates) {
  const slots = [];
  for (const date of allDates) {
    const dow = date.getDay();
    const dateStr = toLocalDateStr(date);

    // Is this a preferred day?
    const isPreferred = profile.preferredDays.includes(dow);
    const isWeekend = dow === 0 || dow === 6;

    // Decide if they're available this day
    let available = false;
    if (isPreferred) {
      available = !chance(profile.skipChance); // usually available on preferred days
    } else if (isWeekend && !isPreferred) {
      available = chance(profile.weekendChance);
    } else {
      // Not preferred weekday — occasional extra day
      available = chance(0.2);
    }

    if (!available) continue;

    // Generate 1-3 blocks for this day
    const numBlocks = chance(profile.extraBlockChance) ? (chance(0.3) ? 3 : 2) : 1;
    let cursor = roundTo30(randInt(profile.earlyStart, profile.lateStart));

    for (let b = 0; b < numBlocks; b++) {
      // Jitter the start time a bit
      const jitter = roundTo30(randInt(-30, 30));
      let start = Math.max(0, cursor + jitter);
      start = roundTo30(start);

      // Block duration varies
      const duration = roundTo30(randInt(profile.minBlock, profile.maxBlock));
      let end = Math.min(22 * 60, start + duration); // cap at 10pm
      end = roundTo30(end);

      if (end <= start) break;

      slots.push({ date: dateStr, start_time: minToTime(start), end_time: minToTime(end) });

      // Gap before next block: 30-90 min lunch/break
      cursor = end + roundTo30(randInt(30, 90));
      if (cursor >= 21 * 60) break;
    }
  }
  return slots;
}
const clients = [
  { name: 'Sarah Johnson', email: 'sarah.j@email.com', phone: '555-0101', address: '123 Oak St, Seattle, WA', timezone: TZ_PACIFIC, notes: 'Prefers mornings, needs wheelchair access' },
  { name: 'Michael Chen', email: 'mchen@email.com', phone: '555-0102', address: '456 Pine Ave, Bellevue, WA', timezone: TZ_PACIFIC, notes: 'Works from home, flexible afternoons' },
  { name: 'Emma Rodriguez', email: 'emma.r@email.com', phone: '555-0103', address: '789 Elm Dr, Portland, OR', timezone: TZ_PACIFIC, notes: 'School pickup at 3pm, mornings only' },
  { name: 'James Wilson', email: 'jwilson@email.com', phone: '555-0104', address: '321 Maple Ln, Denver, CO', timezone: TZ_MOUNTAIN, notes: 'Retired, very flexible schedule' },
  { name: 'Priya Patel', email: 'priya.p@email.com', phone: '555-0105', address: '654 Cedar Rd, Phoenix, AZ', timezone: TZ_MOUNTAIN, notes: 'Needs evening appointments only' },
  { name: 'David Kim', email: 'dkim@email.com', phone: '555-0106', address: '987 Birch St, Chicago, IL', timezone: TZ_CENTRAL, notes: 'Prefers Tues/Thu, has transportation issues' },
  { name: 'Lisa Thompson', email: 'lisa.t@email.com', phone: '555-0107', address: '147 Spruce Way, Dallas, TX', timezone: TZ_CENTRAL, notes: 'Recovering from surgery, limited mobility' },
  { name: 'Robert Garcia', email: 'rgarcia@email.com', phone: '555-0108', address: '258 Walnut Blvd, Houston, TX', timezone: TZ_CENTRAL, notes: 'Spanish-speaking preferred' },
  { name: 'Amanda Foster', email: 'afoster@email.com', phone: '555-0109', address: '369 Ash Ct, Atlanta, GA', timezone: TZ_EASTERN, notes: 'Has young children, needs in-home visits' },
  { name: 'Thomas Lee', email: 'tlee@email.com', phone: '555-0110', address: '741 Willow Dr, New York, NY', timezone: TZ_EASTERN, notes: 'Chronic pain management, weekly sessions needed' },
  { name: 'Jennifer Brown', email: 'jbrown@email.com', phone: '555-0111', address: '852 Poplar St, Boston, MA', timezone: TZ_EASTERN, notes: 'Insurance requires pre-authorization' },
  { name: 'Carlos Mendez', email: 'cmendez@email.com', phone: '555-0112', address: '963 Fir Ave, San Francisco, CA', timezone: TZ_PACIFIC, notes: 'Works night shift, mornings before 11am' },
  { name: 'Rachel Green', email: 'rgreen@email.com', phone: '555-0113', address: '174 Alder Ln, Los Angeles, CA', timezone: TZ_PACIFIC, notes: 'Anxiety - prefers consistent same-day scheduling' },
  { name: 'William Park', email: 'wpark@email.com', phone: '555-0114', address: '285 Cypress Rd, Miami, FL', timezone: TZ_EASTERN, notes: 'Post-stroke rehab, needs 2x/week' },
  { name: 'Maria Santos', email: 'msantos@email.com', phone: '555-0115', address: '396 Hemlock Way, Austin, TX', timezone: TZ_CENTRAL, notes: 'Portuguese speaker, Wed/Fri only' },
];

// --- PROVIDERS (10 providers with US timezones) ---
const providers = [
  { name: 'Dr. Emily Watson', email: 'ewatson@clinic.com', phone: '555-0201', address: '100 Medical Plaza, Seattle, WA', specialty: 'Physical Therapy', timezone: TZ_PACIFIC, notes: 'Board certified, 15 years experience' },
  { name: 'Dr. Alex Rivera', email: 'arivera@clinic.com', phone: '555-0202', address: '200 Health Center, Portland, OR', specialty: 'Occupational Therapy', timezone: TZ_PACIFIC, notes: 'Specializes in stroke recovery' },
  { name: 'Nurse Kelly Brooks', email: 'kbrooks@homecare.com', phone: '555-0203', address: '300 Care Lane, Denver, CO', specialty: 'Home Health', timezone: TZ_MOUNTAIN, notes: 'Bilingual English/Spanish' },
  { name: 'Dr. Nathan Park', email: 'npark@therapy.com', phone: '555-0204', address: '400 Wellness Dr, Chicago, IL', specialty: 'Speech Therapy', timezone: TZ_CENTRAL, notes: 'Pediatric and adult patients' },
  { name: 'Jessica Nguyen, PT', email: 'jnguyen@rehab.com', phone: '555-0205', address: '500 Rehab Way, San Francisco, CA', specialty: 'Physical Therapy', timezone: TZ_PACIFIC, notes: 'Sports injury specialist' },
  { name: 'Mark Sullivan, OT', email: 'msullivan@therapy.com', phone: '555-0206', address: '600 Therapy Blvd, Dallas, TX', specialty: 'Occupational Therapy', timezone: TZ_CENTRAL, notes: 'Geriatric focus, home visits available' },
  { name: 'Dr. Aisha Khan', email: 'akhan@mental.com', phone: '555-0207', address: '700 Mind Center, New York, NY', specialty: 'Mental Health Counseling', timezone: TZ_EASTERN, notes: 'Evening availability, telehealth options' },
  { name: 'Patricia Morales, RN', email: 'pmorales@homecare.com', phone: '555-0208', address: '800 Nursing St, Houston, TX', specialty: 'Home Health', timezone: TZ_CENTRAL, notes: 'Bilingual English/Portuguese, wound care certified' },
  { name: 'Daniel Foster, PTA', email: 'dfoster@rehab.com', phone: '555-0209', address: '900 Movement Ave, Boston, MA', specialty: 'Physical Therapy', timezone: TZ_EASTERN, notes: 'Early morning availability' },
  { name: 'Dr. Rachel Kim', email: 'rkim@psych.com', phone: '555-0210', address: '1000 Balance Rd, Phoenix, AZ', specialty: 'Mental Health Counseling', timezone: TZ_MOUNTAIN, notes: 'Specializes in anxiety and chronic pain' },
];

// --- SEED ---
console.log('Seeding demo data...');

const allDates = getAllDates(9); // ~9 weeks of dates

const insertClient = db.prepare('INSERT INTO clients (user_id, name, email, phone, address, notes, timezone) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertClientAvail = db.prepare('INSERT INTO client_availability (client_id, date, start_time, end_time) VALUES (?, ?, ?, ?)');
const insertProvider = db.prepare('INSERT INTO providers (user_id, name, email, phone, address, specialty, notes, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertProviderAvail = db.prepare('INSERT INTO provider_availability (provider_id, date, start_time, end_time) VALUES (?, ?, ?, ?)');
const insertMatch = db.prepare('INSERT INTO matches (user_id, client_id, provider_id, session_date, start_time, end_time, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertComm = db.prepare('INSERT INTO communications (match_id, user_id, client_id, comm_type, content) VALUES (?, ?, ?, ?, ?)');

const seedAll = db.transaction(() => {
  // Clear existing data (keep users)
  db.exec('DELETE FROM communications');
  db.exec('DELETE FROM matches');
  db.exec('DELETE FROM provider_availability');
  db.exec('DELETE FROM client_availability');
  db.exec('DELETE FROM providers');
  db.exec('DELETE FROM clients');
  db.exec('DELETE FROM preferences');

  // Insert clients with randomized availability
  const clientIds = [];
  let totalClientSlots = 0;
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const r = insertClient.run(USER_ID, c.name, c.email, c.phone, c.address, c.notes, c.timezone);
    const cid = r.lastInsertRowid;
    clientIds.push(cid);

    const slots = generateAvailability(clientProfiles[i], allDates);
    for (const slot of slots) {
      insertClientAvail.run(cid, slot.date, slot.start_time, slot.end_time);
    }
    totalClientSlots += slots.length;
  }

  // Insert providers with randomized availability
  const providerIds = [];
  let totalProviderSlots = 0;
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const r = insertProvider.run(USER_ID, p.name, p.email, p.phone, p.address, p.specialty, p.notes, p.timezone);
    const pid = r.lastInsertRowid;
    providerIds.push(pid);

    const slots = generateAvailability(providerProfiles[i], allDates);
    for (const slot of slots) {
      insertProviderAvail.run(pid, slot.date, slot.start_time, slot.end_time);
    }
    totalProviderSlots += slots.length;
  }

  // Create some existing scheduled sessions (past + upcoming)
  const schedules = [
    { ci: 0, pi: 0, date: '2026-04-13', start: '09:00', end: '10:00', status: 'confirmed', notes: 'Weekly PT session' },
    { ci: 0, pi: 0, date: '2026-04-20', start: '09:00', end: '10:00', status: 'pending', notes: 'Weekly PT session' },
    { ci: 1, pi: 4, date: '2026-04-15', start: '14:00', end: '15:00', status: 'confirmed', notes: 'Initial evaluation' },
    { ci: 2, pi: 1, date: '2026-04-16', start: '09:00', end: '10:30', status: 'confirmed', notes: 'OT follow-up' },
    { ci: 3, pi: 2, date: '2026-04-14', start: '10:00', end: '11:30', status: 'confirmed', notes: 'Home health assessment' },
    { ci: 4, pi: 9, date: '2026-04-15', start: '16:00', end: '17:00', status: 'confirmed', notes: 'Evening counseling session' },
    { ci: 4, pi: 9, date: '2026-04-22', start: '16:00', end: '17:00', status: 'pending', notes: 'Follow-up counseling' },
    { ci: 5, pi: 5, date: '2026-04-17', start: '11:00', end: '12:00', status: 'pending', notes: 'Home visit OT' },
    { ci: 7, pi: 7, date: '2026-04-15', start: '08:00', end: '09:00', status: 'confirmed', notes: 'Home health check - Spanish speaking' },
    { ci: 9, pi: 6, date: '2026-04-14', start: '14:00', end: '15:00', status: 'confirmed', notes: 'Pain management counseling' },
    { ci: 9, pi: 8, date: '2026-04-16', start: '08:00', end: '09:00', status: 'confirmed', notes: 'Pain management PT' },
    { ci: 12, pi: 4, date: '2026-04-15', start: '14:00', end: '15:00', status: 'confirmed', notes: 'Anxiety management PT' },
    { ci: 13, pi: 8, date: '2026-04-14', start: '09:00', end: '10:30', status: 'confirmed', notes: 'Post-stroke PT rehab' },
    { ci: 13, pi: 6, date: '2026-04-16', start: '14:00', end: '15:30', status: 'confirmed', notes: 'Post-stroke counseling' },
    { ci: 14, pi: 7, date: '2026-04-17', start: '09:00', end: '10:00', status: 'pending', notes: 'Home health - Portuguese speaker' },
  ];

  const matchIds = [];
  for (const s of schedules) {
    const r = insertMatch.run(USER_ID, clientIds[s.ci], providerIds[s.pi], s.date, s.start, s.end, s.status, s.notes);
    matchIds.push(r.lastInsertRowid);
  }

  // Communication logs
  const comms = [
    { matchId: matchIds[0], clientIdx: 0, type: 'phone', content: 'Called Sarah to confirm Monday PT. She confirmed and requested same time next week.' },
    { matchId: matchIds[2], clientIdx: 1, type: 'email', content: 'Sent intake forms to Michael for his initial PT evaluation with Jessica Nguyen.' },
    { matchId: null, clientIdx: 4, type: 'phone', content: 'Priya called asking about evening availability. Matched her with Dr. Khan for counseling.' },
    { matchId: matchIds[4], clientIdx: 3, type: 'phone', content: 'James confirmed his home health assessment. Reminded him to bring insurance card.' },
    { matchId: matchIds[8], clientIdx: 7, type: 'phone', content: 'Arranged Spanish-speaking nurse Patricia Morales for Robert\'s home visit.' },
    { matchId: null, clientIdx: 11, type: 'phone', content: 'Carlos inquired about early morning PT. Referred to Daniel Foster who starts at 6am.' },
    { matchId: matchIds[11], clientIdx: 12, type: 'email', content: 'Sent appointment confirmation to Rachel for her session with Jessica Nguyen.' },
    { matchId: matchIds[14], clientIdx: 14, type: 'phone', content: 'Maria needs Portuguese-speaking provider. Matched with Patricia Morales, RN.' },
  ];

  for (const c of comms) {
    insertComm.run(c.matchId, USER_ID, clientIds[c.clientIdx], c.type, c.content);
  }

  // Preferences
  const insertPref = db.prepare('INSERT INTO preferences (user_id, preference_text) VALUES (?, ?)');
  insertPref.run(USER_ID, 'Default session duration: 60 minutes');
  insertPref.run(USER_ID, 'Prefer matching clients with closest provider by address');
  insertPref.run(USER_ID, 'Always check language preferences before scheduling');
  insertPref.run(USER_ID, 'Send confirmation email 24 hours before appointment');
  insertPref.run(USER_ID, 'Buffer 30 minutes between provider appointments');

  console.log(`✅ Seeded: ${clientIds.length} clients (${totalClientSlots} slots), ${providerIds.length} providers (${totalProviderSlots} slots), ${matchIds.length} sessions, ${comms.length} communications`);
});

seedAll();
console.log('Done!');
