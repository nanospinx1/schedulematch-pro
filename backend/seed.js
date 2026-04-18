const db = require('./db');

const USER_ID = 1; // Demo Scheduler user

// US Timezones
const TZ_PACIFIC = 'America/Los_Angeles';
const TZ_MOUNTAIN = 'America/Denver';
const TZ_CENTRAL = 'America/Chicago';
const TZ_EASTERN = 'America/New_York';

// --- CLIENTS (15 clients with varied schedules and US timezones) ---
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

// Helper: generate dates for the next N weeks for specific weekdays (local dates)
function datesForWeekdays(weekdays, weeksAhead = 8) {
  const dates = [];
  const today = new Date();
  for (let w = 0; w < weeksAhead; w++) {
    for (const wd of weekdays) {
      const d = new Date(today);
      const diff = (wd - today.getDay() + 7) % 7 + w * 7;
      d.setDate(today.getDate() + diff);
      if (d >= today) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${day}`);
      }
    }
  }
  return [...new Set(dates)].sort();
}

// Client availability: dense, realistic schedules over next 8 weeks
// Multiple blocks per day for busier schedules
const clientAvailability = [
  // Sarah (Pacific) - busy mornings + some afternoons Mon-Fri
  { idx: 0, weekdays: [1,2,3,4,5], start: '08:00', end: '12:00' },
  { idx: 0, weekdays: [1,3,5], start: '13:00', end: '15:00' },
  // Michael (Pacific) - afternoons Mon-Fri, mornings on Wed
  { idx: 1, weekdays: [1,2,3,4,5], start: '13:00', end: '17:00' },
  { idx: 1, weekdays: [3], start: '09:00', end: '12:00' },
  // Emma (Pacific) - mornings Mon-Fri + Saturday morning
  { idx: 2, weekdays: [1,2,3,4,5], start: '08:30', end: '14:30' },
  { idx: 2, weekdays: [6], start: '09:00', end: '12:00' },
  // James (Mountain) - very flexible Mon-Sat, busy all day
  { idx: 3, weekdays: [1,2,3,4,5], start: '07:00', end: '12:00' },
  { idx: 3, weekdays: [1,2,3,4,5], start: '13:00', end: '18:00' },
  { idx: 3, weekdays: [6], start: '09:00', end: '14:00' },
  // Priya (Mountain) - evenings Mon-Fri + Sat afternoon
  { idx: 4, weekdays: [1,2,3,4,5], start: '16:00', end: '20:00' },
  { idx: 4, weekdays: [6], start: '13:00', end: '17:00' },
  // David (Central) - Tue/Thu/Sat blocks
  { idx: 5, weekdays: [2,4], start: '09:00', end: '12:00' },
  { idx: 5, weekdays: [2,4], start: '13:00', end: '16:00' },
  { idx: 5, weekdays: [6], start: '10:00', end: '14:00' },
  // Lisa (Central) - Mon/Wed/Fri mornings + Tue/Thu afternoons
  { idx: 6, weekdays: [1,3,5], start: '09:00', end: '12:30' },
  { idx: 6, weekdays: [2,4], start: '13:00', end: '16:00' },
  // Robert (Central) - Mon-Fri early mornings + Sat
  { idx: 7, weekdays: [1,2,3,4,5], start: '07:00', end: '11:00' },
  { idx: 7, weekdays: [1,3], start: '14:00', end: '16:00' },
  { idx: 7, weekdays: [6], start: '08:00', end: '12:00' },
  // Amanda (Eastern) - Tue/Wed/Thu midday + Mon/Fri mornings
  { idx: 8, weekdays: [2,3,4], start: '10:00', end: '14:00' },
  { idx: 8, weekdays: [1,5], start: '08:00', end: '11:00' },
  { idx: 8, weekdays: [2,4], start: '15:00', end: '17:00' },
  // Thomas (Eastern) - weekday mornings + afternoons Mon/Wed
  { idx: 9, weekdays: [1,2,3,4,5], start: '08:00', end: '11:30' },
  { idx: 9, weekdays: [1,3], start: '13:00', end: '15:30' },
  // Jennifer (Eastern) - Mon-Fri afternoon + Wed morning
  { idx: 10, weekdays: [1,2,3,4,5], start: '13:00', end: '17:00' },
  { idx: 10, weekdays: [3], start: '09:00', end: '12:00' },
  // Carlos (Pacific) - mornings Mon-Fri + Sat early
  { idx: 11, weekdays: [1,2,3,4,5], start: '06:00', end: '11:00' },
  { idx: 11, weekdays: [6], start: '07:00', end: '10:00' },
  // Rachel (Pacific) - Mon/Wed/Fri all day + Tue/Thu afternoon
  { idx: 12, weekdays: [1,3,5], start: '08:00', end: '12:00' },
  { idx: 12, weekdays: [1,3,5], start: '13:00', end: '17:00' },
  { idx: 12, weekdays: [2,4], start: '14:00', end: '18:00' },
  // William (Eastern) - Mon-Fri mornings + Tue/Thu afternoon
  { idx: 13, weekdays: [1,2,3,4,5], start: '07:30', end: '12:00' },
  { idx: 13, weekdays: [2,4], start: '13:00', end: '15:30' },
  // Maria (Central) - Wed/Fri all day + Mon morning
  { idx: 14, weekdays: [3,5], start: '08:00', end: '12:00' },
  { idx: 14, weekdays: [3,5], start: '13:00', end: '17:00' },
  { idx: 14, weekdays: [1], start: '09:00', end: '12:00' },
];

// --- PROVIDERS (10 providers with US timezones matching client regions) ---
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

// Provider availability: dense schedules over next 8 weeks with overlaps
const providerAvailability = [
  // Dr. Watson (Pacific) - Mon-Thu full day + Fri morning — overlaps Sarah, Michael, Emma, Carlos, Rachel
  { idx: 0, weekdays: [1,2,3,4], start: '08:00', end: '12:00' },
  { idx: 0, weekdays: [1,2,3,4], start: '13:00', end: '17:00' },
  { idx: 0, weekdays: [5], start: '08:00', end: '13:00' },
  // Dr. Rivera (Pacific) - Mon/Wed/Fri + Sat — overlaps Sarah, Emma, Rachel
  { idx: 1, weekdays: [1,3,5], start: '08:00', end: '12:30' },
  { idx: 1, weekdays: [1,3,5], start: '13:30', end: '17:00' },
  { idx: 1, weekdays: [6], start: '09:00', end: '14:00' },
  // Nurse Brooks (Mountain) - Tue-Sat — overlaps James, Priya
  { idx: 2, weekdays: [2,3,4,5], start: '07:00', end: '12:00' },
  { idx: 2, weekdays: [2,3,4,5], start: '13:00', end: '16:00' },
  { idx: 2, weekdays: [6], start: '08:00', end: '14:00' },
  // Dr. Park (Central) - Mon-Fri — overlaps David, Lisa, Robert, Maria
  { idx: 3, weekdays: [1,2,3,4,5], start: '08:00', end: '12:00' },
  { idx: 3, weekdays: [1,3,5], start: '13:00', end: '16:00' },
  // Jessica Nguyen (Pacific) - Mon-Thu afternoon + Wed all day — overlaps Michael, Rachel
  { idx: 4, weekdays: [1,2,4], start: '13:00', end: '18:00' },
  { idx: 4, weekdays: [3], start: '08:00', end: '12:00' },
  { idx: 4, weekdays: [3], start: '13:00', end: '18:00' },
  { idx: 4, weekdays: [5], start: '09:00', end: '14:00' },
  // Mark Sullivan (Central) - Tue-Thu + Mon afternoon — overlaps David, Lisa, Robert, Maria
  { idx: 5, weekdays: [2,3,4], start: '08:30', end: '12:00' },
  { idx: 5, weekdays: [2,3,4], start: '13:00', end: '17:00' },
  { idx: 5, weekdays: [1], start: '13:00', end: '17:00' },
  // Dr. Khan (Eastern) - Mon-Thu evenings + Wed afternoon — overlaps Amanda, Thomas, Jennifer, William
  { idx: 6, weekdays: [1,2,3,4], start: '14:00', end: '17:00' },
  { idx: 6, weekdays: [1,2,3,4], start: '17:00', end: '21:00' },
  { idx: 6, weekdays: [5], start: '13:00', end: '18:00' },
  // Patricia Morales (Central) - Mon-Fri early + Sat — overlaps Robert, Lisa, Maria
  { idx: 7, weekdays: [1,2,3,4,5], start: '06:00', end: '11:00' },
  { idx: 7, weekdays: [1,2,3,4,5], start: '12:00', end: '15:00' },
  { idx: 7, weekdays: [6], start: '08:00', end: '12:00' },
  // Daniel Foster (Eastern) - Mon-Fri mornings + Tue/Thu afternoon — overlaps Thomas, Jennifer, William, Amanda
  { idx: 8, weekdays: [1,2,3,4,5], start: '06:00', end: '12:00' },
  { idx: 8, weekdays: [2,4], start: '13:00', end: '16:00' },
  // Dr. Kim (Mountain) - Mon afternoon, Wed/Fri all day + Sat — overlaps James, Priya
  { idx: 9, weekdays: [1], start: '13:00', end: '18:00' },
  { idx: 9, weekdays: [3,5], start: '08:00', end: '12:00' },
  { idx: 9, weekdays: [3,5], start: '13:00', end: '18:00' },
  { idx: 9, weekdays: [6], start: '10:00', end: '15:00' },
];

// --- SEED ---
console.log('Seeding demo data...');

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

  // Insert clients
  const clientIds = [];
  for (const c of clients) {
    const r = insertClient.run(USER_ID, c.name, c.email, c.phone, c.address, c.notes, c.timezone);
    clientIds.push(r.lastInsertRowid);
  }

  // Insert client availability (date-based, 8 weeks)
  for (const ca of clientAvailability) {
    const dates = datesForWeekdays(ca.weekdays, 8);
    for (const date of dates) {
      insertClientAvail.run(clientIds[ca.idx], date, ca.start, ca.end);
    }
  }

  // Insert providers
  const providerIds = [];
  for (const p of providers) {
    const r = insertProvider.run(USER_ID, p.name, p.email, p.phone, p.address, p.specialty, p.notes, p.timezone);
    providerIds.push(r.lastInsertRowid);
  }

  // Insert provider availability (date-based, 8 weeks)
  for (const pa of providerAvailability) {
    const dates = datesForWeekdays(pa.weekdays, 8);
    for (const date of dates) {
      insertProviderAvail.run(providerIds[pa.idx], date, pa.start, pa.end);
    }
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

  console.log(`✅ Seeded: ${clientIds.length} clients, ${providerIds.length} providers, ${matchIds.length} sessions, ${comms.length} communications`);
});

seedAll();
console.log('Done!');
