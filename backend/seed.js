const db = require('./db');

const USER_ID = 1; // Demo Scheduler user

// --- CLIENTS (15 clients with varied schedules) ---
const clients = [
  { name: 'Sarah Johnson', email: 'sarah.j@email.com', phone: '555-0101', address: '123 Oak St, Seattle', notes: 'Prefers mornings, needs wheelchair access' },
  { name: 'Michael Chen', email: 'mchen@email.com', phone: '555-0102', address: '456 Pine Ave, Bellevue', notes: 'Works from home, flexible afternoons' },
  { name: 'Emma Rodriguez', email: 'emma.r@email.com', phone: '555-0103', address: '789 Elm Dr, Redmond', notes: 'School pickup at 3pm, mornings only' },
  { name: 'James Wilson', email: 'jwilson@email.com', phone: '555-0104', address: '321 Maple Ln, Kirkland', notes: 'Retired, very flexible schedule' },
  { name: 'Priya Patel', email: 'priya.p@email.com', phone: '555-0105', address: '654 Cedar Rd, Renton', notes: 'Needs evening appointments only' },
  { name: 'David Kim', email: 'dkim@email.com', phone: '555-0106', address: '987 Birch St, Tacoma', notes: 'Prefers Tues/Thu, has transportation issues' },
  { name: 'Lisa Thompson', email: 'lisa.t@email.com', phone: '555-0107', address: '147 Spruce Way, Bothell', notes: 'Recovering from surgery, limited mobility' },
  { name: 'Robert Garcia', email: 'rgarcia@email.com', phone: '555-0108', address: '258 Walnut Blvd, Issaquah', notes: 'Spanish-speaking preferred' },
  { name: 'Amanda Foster', email: 'afoster@email.com', phone: '555-0109', address: '369 Ash Ct, Sammamish', notes: 'Has young children, needs in-home visits' },
  { name: 'Thomas Lee', email: 'tlee@email.com', phone: '555-0110', address: '741 Willow Dr, Mercer Island', notes: 'Chronic pain management, weekly sessions needed' },
  { name: 'Jennifer Brown', email: 'jbrown@email.com', phone: '555-0111', address: '852 Poplar St, Woodinville', notes: 'Insurance requires pre-authorization' },
  { name: 'Carlos Mendez', email: 'cmendez@email.com', phone: '555-0112', address: '963 Fir Ave, Kent', notes: 'Works night shift, mornings before 11am' },
  { name: 'Rachel Green', email: 'rgreen@email.com', phone: '555-0113', address: '174 Alder Ln, Lynnwood', notes: 'Anxiety - prefers consistent same-day scheduling' },
  { name: 'William Park', email: 'wpark@email.com', phone: '555-0114', address: '285 Cypress Rd, Shoreline', notes: 'Post-stroke rehab, needs 2x/week' },
  { name: 'Maria Santos', email: 'msantos@email.com', phone: '555-0115', address: '396 Hemlock Way, Federal Way', notes: 'Portuguese speaker, Wed/Fri only' },
];

// Helper: generate dates for the next N weeks for specific weekdays
function datesForWeekdays(weekdays, weeksAhead = 4) {
  const dates = [];
  const today = new Date();
  for (let w = 0; w < weeksAhead; w++) {
    for (const wd of weekdays) {
      const d = new Date(today);
      const diff = (wd - today.getDay() + 7) % 7 + w * 7;
      d.setDate(today.getDate() + diff);
      if (d >= today) {
        dates.push(d.toISOString().split('T')[0]);
      }
    }
  }
  return [...new Set(dates)].sort();
}

// Client availability: realistic date-based schedules over next 4 weeks
const clientAvailability = [
  // Sarah - mornings Mon-Fri
  { idx: 0, weekdays: [1,2,3,4,5], start: '08:00', end: '12:00' },
  // Michael - afternoons Mon/Wed/Fri
  { idx: 1, weekdays: [1,3,5], start: '13:00', end: '17:00' },
  // Emma - mornings Mon-Fri
  { idx: 2, weekdays: [1,2,3,4,5], start: '09:00', end: '14:30' },
  // James - very flexible Mon-Sat
  { idx: 3, weekdays: [1,2,3,4,5,6], start: '08:00', end: '18:00' },
  // Priya - evenings Mon-Thu
  { idx: 4, weekdays: [1,2,3,4], start: '17:00', end: '20:00' },
  // David - Tue/Thu only
  { idx: 5, weekdays: [2,4], start: '10:00', end: '15:00' },
  // Lisa - Mon/Wed/Fri mornings
  { idx: 6, weekdays: [1,3,5], start: '10:00', end: '12:00' },
  // Robert - Mon/Tue + Sat
  { idx: 7, weekdays: [1,2,6], start: '07:00', end: '11:00' },
  // Amanda - Tue/Wed/Thu midday
  { idx: 8, weekdays: [2,3,4], start: '10:00', end: '14:00' },
  // Thomas - weekday mornings
  { idx: 9, weekdays: [1,2,3,4,5], start: '09:00', end: '11:00' },
  // Jennifer - Mon/Wed/Fri afternoons
  { idx: 10, weekdays: [1,3,5], start: '14:00', end: '17:00' },
  // Carlos - mornings Mon-Fri
  { idx: 11, weekdays: [1,2,3,4,5], start: '07:00', end: '11:00' },
  // Rachel - Wed/Fri all day
  { idx: 12, weekdays: [3,5], start: '08:00', end: '17:00' },
  // William - Mon-Fri mornings
  { idx: 13, weekdays: [1,2,3,4,5], start: '08:00', end: '12:00' },
  // Maria - Wed/Fri
  { idx: 14, weekdays: [3,5], start: '09:00', end: '16:00' },
];

// Provider availability: varied schedules over next 4 weeks
const providerAvailability = [
  // Dr. Watson - Mon-Thu
  { idx: 0, weekdays: [1,2,3,4], start: '08:00', end: '16:00' },
  // Dr. Rivera - Mon/Wed/Fri + Sat
  { idx: 1, weekdays: [1,3,5,6], start: '09:00', end: '17:00' },
  // Nurse Brooks - Tue-Sat
  { idx: 2, weekdays: [2,3,4,5,6], start: '07:00', end: '15:00' },
  // Dr. Park - Mon-Fri mornings
  { idx: 3, weekdays: [1,2,3,4,5], start: '08:00', end: '13:00' },
  // Jessica Nguyen - Mon/Tue/Thu afternoons + Wed all day
  { idx: 4, weekdays: [1,2,4], start: '13:00', end: '19:00' },
  { idx: 4, weekdays: [3], start: '08:00', end: '19:00' },
  // Mark Sullivan - Tue/Wed/Thu
  { idx: 5, weekdays: [2,3,4], start: '09:00', end: '17:00' },
  // Dr. Khan - evenings Mon-Thu
  { idx: 6, weekdays: [1,2,3,4], start: '16:00', end: '21:00' },
  // Patricia Morales - Mon-Fri early
  { idx: 7, weekdays: [1,2,3,4,5], start: '06:00', end: '14:00' },
  // Daniel Foster - early mornings Mon-Fri
  { idx: 8, weekdays: [1,2,3,4,5], start: '06:00', end: '12:00' },
  // Dr. Kim - Mon afternoon, Wed/Fri all day
  { idx: 9, weekdays: [1], start: '13:00', end: '18:00' },
  { idx: 9, weekdays: [3,5], start: '09:00', end: '18:00' },
];

// --- PROVIDERS (10 providers with different specialties and schedules) ---
const providers = [
  { name: 'Dr. Emily Watson', email: 'ewatson@clinic.com', phone: '555-0201', address: '100 Medical Plaza, Seattle', specialty: 'Physical Therapy', notes: 'Board certified, 15 years experience' },
  { name: 'Dr. Alex Rivera', email: 'arivera@clinic.com', phone: '555-0202', address: '200 Health Center, Bellevue', specialty: 'Occupational Therapy', notes: 'Specializes in stroke recovery' },
  { name: 'Nurse Kelly Brooks', email: 'kbrooks@homecare.com', phone: '555-0203', address: '300 Care Lane, Seattle', specialty: 'Home Health', notes: 'Bilingual English/Spanish' },
  { name: 'Dr. Nathan Park', email: 'npark@therapy.com', phone: '555-0204', address: '400 Wellness Dr, Redmond', specialty: 'Speech Therapy', notes: 'Pediatric and adult patients' },
  { name: 'Jessica Nguyen, PT', email: 'jnguyen@rehab.com', phone: '555-0205', address: '500 Rehab Way, Kirkland', specialty: 'Physical Therapy', notes: 'Sports injury specialist' },
  { name: 'Mark Sullivan, OT', email: 'msullivan@therapy.com', phone: '555-0206', address: '600 Therapy Blvd, Renton', specialty: 'Occupational Therapy', notes: 'Geriatric focus, home visits available' },
  { name: 'Dr. Aisha Khan', email: 'akhan@mental.com', phone: '555-0207', address: '700 Mind Center, Bellevue', specialty: 'Mental Health Counseling', notes: 'Evening availability, telehealth options' },
  { name: 'Patricia Morales, RN', email: 'pmorales@homecare.com', phone: '555-0208', address: '800 Nursing St, Tacoma', specialty: 'Home Health', notes: 'Bilingual English/Portuguese, wound care certified' },
  { name: 'Daniel Foster, PTA', email: 'dfoster@rehab.com', phone: '555-0209', address: '900 Movement Ave, Bothell', specialty: 'Physical Therapy', notes: 'Early morning availability' },
  { name: 'Dr. Rachel Kim', email: 'rkim@psych.com', phone: '555-0210', address: '1000 Balance Rd, Issaquah', specialty: 'Mental Health Counseling', notes: 'Specializes in anxiety and chronic pain' },
];

// --- SEED ---
console.log('Seeding demo data...');

const insertClient = db.prepare('INSERT INTO clients (user_id, name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)');
const insertClientAvail = db.prepare('INSERT INTO client_availability (client_id, date, start_time, end_time) VALUES (?, ?, ?, ?)');
const insertProvider = db.prepare('INSERT INTO providers (user_id, name, email, phone, address, specialty, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
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
    const r = insertClient.run(USER_ID, c.name, c.email, c.phone, c.address, c.notes);
    clientIds.push(r.lastInsertRowid);
  }

  // Insert client availability (date-based)
  for (const ca of clientAvailability) {
    const dates = datesForWeekdays(ca.weekdays, 4);
    for (const date of dates) {
      insertClientAvail.run(clientIds[ca.idx], date, ca.start, ca.end);
    }
  }

  // Insert providers
  const providerIds = [];
  for (const p of providers) {
    const r = insertProvider.run(USER_ID, p.name, p.email, p.phone, p.address, p.specialty, p.notes);
    providerIds.push(r.lastInsertRowid);
  }

  // Insert provider availability (date-based)
  for (const pa of providerAvailability) {
    const dates = datesForWeekdays(pa.weekdays, 4);
    for (const date of dates) {
      insertProviderAvail.run(providerIds[pa.idx], date, pa.start, pa.end);
    }
  }

  // Create some existing scheduled sessions (past + upcoming)
  const schedules = [
    { ci: 0, pi: 0, date: '2026-04-13', start: '09:00', end: '10:00', status: 'confirmed', notes: 'Weekly PT session' },
    { ci: 0, pi: 0, date: '2026-04-20', start: '09:00', end: '10:00', status: 'pending', notes: 'Weekly PT session' },
    { ci: 1, pi: 4, date: '2026-04-15', start: '14:00', end: '15:00', status: 'confirmed', notes: 'Initial evaluation' },
    { ci: 2, pi: 3, date: '2026-04-16', start: '10:00', end: '11:00', status: 'confirmed', notes: 'Speech therapy follow-up' },
    { ci: 3, pi: 1, date: '2026-04-14', start: '10:00', end: '11:30', status: 'confirmed', notes: 'OT assessment' },
    { ci: 4, pi: 6, date: '2026-04-14', start: '18:00', end: '19:00', status: 'confirmed', notes: 'Evening counseling session' },
    { ci: 4, pi: 6, date: '2026-04-21', start: '18:00', end: '19:00', status: 'pending', notes: 'Follow-up counseling' },
    { ci: 5, pi: 5, date: '2026-04-17', start: '11:00', end: '12:00', status: 'pending', notes: 'Home visit OT' },
    { ci: 7, pi: 2, date: '2026-04-15', start: '08:00', end: '09:00', status: 'confirmed', notes: 'Home health check - Spanish speaking' },
    { ci: 9, pi: 0, date: '2026-04-14', start: '10:00', end: '11:00', status: 'confirmed', notes: 'Pain management PT' },
    { ci: 9, pi: 0, date: '2026-04-16', start: '10:00', end: '11:00', status: 'confirmed', notes: 'Pain management PT' },
    { ci: 12, pi: 9, date: '2026-04-15', start: '10:00', end: '11:00', status: 'confirmed', notes: 'Anxiety management session' },
    { ci: 13, pi: 1, date: '2026-04-14', start: '09:00', end: '10:30', status: 'confirmed', notes: 'Post-stroke OT rehab' },
    { ci: 13, pi: 0, date: '2026-04-16', start: '08:00', end: '09:30', status: 'confirmed', notes: 'Post-stroke PT rehab' },
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
    { matchId: matchIds[4], clientIdx: 3, type: 'phone', content: 'James confirmed his OT assessment appointment. Reminded him to bring insurance card.' },
    { matchId: matchIds[8], clientIdx: 7, type: 'phone', content: 'Arranged Spanish-speaking nurse Kelly Brooks for Robert\'s home visit.' },
    { matchId: null, clientIdx: 11, type: 'phone', content: 'Carlos inquired about early morning PT. Referred to Daniel Foster who starts at 6am.' },
    { matchId: matchIds[11], clientIdx: 12, type: 'email', content: 'Sent appointment confirmation to Rachel for her session with Dr. Kim.' },
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
