import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

/* ─── helpers ─── */
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt12(t){ if(!t)return''; const[h,m]=t.split(':').map(Number); return `${h===0?12:h>12?h-12:h}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
function fmtDate(d){ if(!d)return''; const o=new Date(d+'T00:00:00'); return `${DAY_NAMES[o.getDay()]}, ${MONTHS[o.getMonth()]} ${o.getDate()}`; }
function fmtMd(t){ return t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n/g,'<br/>'); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ─── Timezone helpers ─── */
const TZ_LABELS = {
  'America/New_York':'Eastern','America/Chicago':'Central',
  'America/Denver':'Mountain','America/Los_Angeles':'Pacific',
  'America/Phoenix':'Arizona','Pacific/Honolulu':'Hawaii',
  'America/Anchorage':'Alaska','Europe/London':'London',
};
function tzShort(tz){ return TZ_LABELS[tz] || tz?.split('/').pop().replace(/_/g,' ') || ''; }

/* ─── intent parser ─── */
function parseIntent(text, clients, providers) {
  const lo = text.toLowerCase().trim();
  const res = {
    action: null,
    clientName: null, clientId: null,
    providerName: null, providerId: null,
    days: [], timeHint: null, duration: null, specialty: null,
    // For create
    newName: null, newEmail: null, newPhone: null, newTimezone: null, newSpecialty: null, newAddress: null,
  };

  // ─ Create client / provider ─
  const addClientRx = /add\s+(a\s+)?(new\s+)?client/i;
  const addProvRx   = /add\s+(a\s+)?(new\s+)?provider/i;
  if (addClientRx.test(lo)) { res.action = 'create_client'; parseCreateFields(text, res); return res; }
  if (addProvRx.test(lo))   { res.action = 'create_provider'; parseCreateFields(text, res); return res; }

  // ─ List / count ─
  if (/how many client/i.test(lo) || /count.*client/i.test(lo)) { res.action = 'count_clients'; return res; }
  if (/how many provider/i.test(lo) || /count.*provider/i.test(lo)) { res.action = 'count_providers'; return res; }
  if (/how many session/i.test(lo) || /count.*session/i.test(lo) || /how many.*book/i.test(lo)) { res.action = 'count_sessions'; return res; }
  if (/list.*client|show.*client|my client|all client/i.test(lo)) { res.action = 'list_clients'; return res; }
  if (/list.*provider|show.*provider|my provider|all provider/i.test(lo)) { res.action = 'list_providers'; return res; }
  if (/upcoming session|scheduled session|my session|list.*session|show.*session|booked session/i.test(lo)) { res.action = 'list_sessions'; return res; }

  // ─ Entity lookup ─
  for (const c of clients) {
    const first = c.name.split(' ')[0].toLowerCase();
    const full = c.name.toLowerCase();
    if (lo.includes(full) || (first.length > 2 && lo.includes(first))) {
      res.clientName = c.name; res.clientId = c.id; break;
    }
  }
  for (const p of providers) {
    const first = p.name.split(' ').pop().toLowerCase(); // last name
    const full = p.name.toLowerCase();
    if (lo.includes(full) || lo.includes(first)) {
      res.providerName = p.name; res.providerId = p.id; break;
    }
  }

  // ─ Calendar / availability ─
  if (/calendar|availability|schedule\s+for|schedule\s+of|what.*available/i.test(lo) && !(/book|find.*provider|match|need/i.test(lo))) {
    if (res.clientId && res.providerId) { res.action = 'compare_calendars'; return res; }
    if (res.clientId)   { res.action = 'view_client_calendar'; return res; }
    if (res.providerId) { res.action = 'view_provider_calendar'; return res; }
    res.action = 'view_calendar_help'; return res;
  }

  // ─ Client/provider detail ─
  if (res.clientId && /(detail|info|about|show|profile)/i.test(lo) && !res.providerId) { res.action = 'client_detail'; return res; }
  if (res.providerId && /(detail|info|about|show|profile)/i.test(lo) && !res.clientId) { res.action = 'provider_detail'; return res; }

  // ─ Cancel session ─
  if (/cancel\s+session|delete\s+session/i.test(lo)) { res.action = 'cancel_session'; return res; }

  // ─ Scheduling (default if client mentioned) ─
  DAY_FULL.forEach((day,i)=>{ if(lo.includes(day.toLowerCase()) || new RegExp('\\b'+DAY_NAMES[i].toLowerCase()+'s?\\b').test(lo)) res.days.push(i); });
  if(lo.includes('weekday')) res.days=[1,2,3,4,5];
  if(lo.includes('weekend')) res.days=[0,6];
  if(lo.includes('morning')||lo.match(/\bam\b/)) res.timeHint={start:'08:00',end:'12:00',label:'mornings'};
  else if(lo.includes('afternoon')) res.timeHint={start:'12:00',end:'17:00',label:'afternoons'};
  else if(lo.includes('evening')) res.timeHint={start:'17:00',end:'21:00',label:'evenings'};
  if(lo.includes('1 hour')||lo.includes('one hour')||lo.includes('60 min')) res.duration=60;
  else if(lo.includes('90 min')||lo.includes('1.5 hour')) res.duration=90;
  else if(lo.includes('45 min')) res.duration=45;
  else if(lo.includes('30 min')||lo.includes('half hour')) res.duration=30;
  const specs=['therapy','counseling','physical therapy','speech','occupational','mental health','behavioral'];
  for(const s of specs){ if(lo.includes(s)){res.specialty=s;break;} }

  if(lo.includes('book')||lo.includes('confirm')||lo.includes('schedule that')||lo.includes('go with')) { res.action='book'; return res; }
  if(lo.includes('more option')||lo.includes('what else')||lo.includes('different')) { res.action='refine'; return res; }

  if (res.clientId) { res.action = 'find_providers'; return res; }

  // ─ Help / fallback ─
  if (/help|what can you|how do i|what do you/i.test(lo)) { res.action = 'help'; return res; }

  res.action = 'unknown';
  return res;
}

function parseCreateFields(text, res) {
  // Extract name after "named" or "called" or "name is"  or "client/provider <Name>"
  const nameRx = /(?:named?|called?|name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;
  const m = text.match(nameRx);
  if (m) res.newName = m[1];
  // email
  const emailRx = /[\w.-]+@[\w.-]+\.\w+/;
  const em = text.match(emailRx);
  if (em) res.newEmail = em[0];
  // phone
  const phoneRx = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const ph = text.match(phoneRx);
  if (ph) res.newPhone = ph[0];
  // timezone
  if (/eastern|new.york/i.test(text)) res.newTimezone = 'America/New_York';
  else if (/central|chicago/i.test(text)) res.newTimezone = 'America/Chicago';
  else if (/mountain|denver/i.test(text)) res.newTimezone = 'America/Denver';
  else if (/pacific|los.angeles/i.test(text)) res.newTimezone = 'America/Los_Angeles';
  // specialty (providers)
  const specRx = /specialty\s+(?:is\s+)?(.+?)(?:\.|,|$)/i;
  const sp = text.match(specRx);
  if (sp) res.newSpecialty = sp[1].trim();
  if (!res.newSpecialty) {
    const specs2 = ['Physical Therapy','Mental Health Counseling','Speech Therapy','Occupational Therapy','Behavioral Therapy','Counseling'];
    for (const s of specs2) { if (text.toLowerCase().includes(s.toLowerCase())) { res.newSpecialty = s; break; } }
  }
}

/* ─── Tool call animation step ─── */
function ToolStep({ label, status, detail }) {
  return (
    <div style={{ display:'flex',alignItems:'center',gap:8,padding:'3px 0',fontSize:12,color:'#6b7280' }}>
      <span style={{ width:16,height:16,borderRadius:4,background:status==='done'?'#d1fae5':status==='running'?'#dbeafe':'#f3f4f6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,flexShrink:0 }}>
        {status==='done'?'\u2713':status==='running'?'\u25CF':'\u2026'}
      </span>
      <span style={{ fontFamily:'ui-monospace, monospace',fontSize:11,color:status==='running'?'#2563eb':'#6b7280' }}>{label}</span>
      {detail && <span style={{ color:'#9ca3af',marginLeft:'auto',fontSize:11 }}>{detail}</span>}
    </div>
  );
}

/* ─── Chat renderers ─── */
function ClientCard({ c }) {
  return (
    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,marginBottom:4 }}>
      <div>
        <div style={{ fontWeight:600,fontSize:13 }}>{c.name}</div>
        <div style={{ fontSize:12,color:'#6b7280' }}>{c.email}{c.timezone ? ` \u2022 ${tzShort(c.timezone)}` : ''}</div>
      </div>
      {c.phone && <span style={{ fontSize:11,color:'#6b7280' }}>{c.phone}</span>}
    </div>
  );
}

function ProviderListCard({ p }) {
  return (
    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,marginBottom:4 }}>
      <div>
        <div style={{ fontWeight:600,fontSize:13 }}>{p.name}</div>
        <div style={{ fontSize:12,color:'#6b7280' }}>{p.specialty || 'General'}{p.timezone ? ` \u2022 ${tzShort(p.timezone)}` : ''}</div>
      </div>
      {p.email && <span style={{ fontSize:11,color:'#6b7280' }}>{p.email}</span>}
    </div>
  );
}

function SessionRow({ s }) {
  const statusColors = { pending:'#f59e0b', confirmed:'#059669', completed:'#6b7280', cancelled:'#dc2626', no_show:'#9333ea' };
  return (
    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,marginBottom:4,fontSize:13 }}>
      <div>
        <span style={{ fontWeight:600 }}>{s.client_name}</span>
        <span style={{ color:'#6b7280' }}> with </span>
        <span style={{ fontWeight:600 }}>{s.provider_name}</span>
        <div style={{ fontSize:12,color:'#6b7280' }}>{fmtDate(s.session_date)} \u2022 {fmt12(s.start_time)} \u2013 {fmt12(s.end_time)}</div>
      </div>
      <span style={{ fontSize:11,padding:'2px 8px',borderRadius:8,background:statusColors[s.status]||'#e5e7eb',color:'#fff',fontWeight:600,textTransform:'capitalize' }}>{s.status}</span>
    </div>
  );
}

function AvailabilityBlock({ slots, personName }) {
  if (!slots || slots.length === 0) return <div style={{ fontSize:13,color:'#9ca3af' }}>No availability found in the next 4 weeks.</div>;
  const byDate = {};
  slots.forEach(s => { (byDate[s.date] = byDate[s.date] || []).push(s); });
  return (
    <div style={{ maxWidth:480 }}>
      <div style={{ fontWeight:600,fontSize:13,marginBottom:6 }}>{personName}&apos;s Availability</div>
      {Object.entries(byDate).slice(0, 8).map(([date, ss]) => (
        <div key={date} style={{ display:'flex',gap:8,alignItems:'baseline',padding:'4px 0',borderBottom:'1px solid #f3f4f6',fontSize:13 }}>
          <span style={{ fontWeight:500,minWidth:110 }}>{fmtDate(date)}</span>
          <div style={{ display:'flex',gap:4,flexWrap:'wrap' }}>
            {ss.map((s,i) => (
              <span key={i} style={{ padding:'2px 8px',background:'#ecfdf5',border:'1px solid #bbf7d0',borderRadius:6,fontSize:12 }}>
                {fmt12(s.start_time)} \u2013 {fmt12(s.end_time)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchCard({ provider, slots, onBook }) {
  return (
    <div style={{ border:'1px solid #e5e7eb',borderRadius:10,overflow:'hidden',marginBottom:8 }}>
      <div style={{ padding:'10px 14px',background:'#f9fafb',borderBottom:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <div>
          <span style={{ fontWeight:600,fontSize:13 }}>{provider.name}</span>
          {provider.specialty && <span style={{ color:'#6b7280',fontSize:12,marginLeft:8 }}>{provider.specialty}</span>}
        </div>
        {provider.timezone && <span style={{ fontSize:10,padding:'2px 6px',background:'#eff6ff',color:'#1d4ed8',borderRadius:6 }}>{tzShort(provider.timezone)}</span>}
      </div>
      {slots.map((sl,i)=>(
        <div key={i} style={{ padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:i<slots.length-1?'1px solid #f3f4f6':'none' }}>
          <div>
            <span style={{ fontWeight:500,fontSize:12,color:'#1f2937',marginRight:10 }}>{fmtDate(sl.date)}</span>
            <span style={{ fontSize:13,fontWeight:600,color:'#059669' }}>{fmt12(sl.start_time)} &ndash; {fmt12(sl.end_time)}</span>
            <span style={{ fontSize:11,color:'#6b7280',marginLeft:8 }}>{sl.duration_minutes}min</span>
          </div>
          <button className="btn btn-sm btn-success" style={{ fontSize:11,padding:'3px 10px' }} onClick={()=>onBook(sl)}>Book</button>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════ */
export default function AIAssistant() {
  const [clients, setClients]     = useState([]);
  const [providers, setProviders] = useState([]);
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [isThinking, setThinking] = useState(false);
  const [toolCalls, setTools]     = useState([]);
  const [ctx, setCtx]             = useState({ clientId:null, clientName:null, providerId:null, providerName:null, lastResults:null });
  const [useRealAI, setUseRealAI] = useState(false);
  const llmHistory = useRef([]);
  const chatEnd = useRef(null);
  const inputEl = useRef(null);

  const [bookSlot, setBookSlot]     = useState(null);
  const [bookNotes, setBookNotes]   = useState('');
  const [conflict, setConflict]     = useState(null);

  const refreshData = useCallback(async () => {
    const [c, p] = await Promise.all([api.getClients(), api.getProviders()]);
    setClients(c); setProviders(p);
    return { clients: c, providers: p };
  }, []);

  useEffect(() => {
    refreshData().then(() => {
      setMessages([{
        role:'assistant', type:'text',
        content: "Hi! I\u2019m your AI scheduling assistant. I can help you with anything:\n\n\u2022 **Manage clients & providers** \u2014 *\"Add a new client named John Smith, email john@test.com, Eastern timezone\"*\n\u2022 **View calendars** \u2014 *\"Show Amanda Foster\u2019s availability\"*\n\u2022 **Compare schedules** \u2014 *\"Compare Amanda Foster and Dr. Khan\u2019s calendars\"*\n\u2022 **Find & book sessions** \u2014 *\"Amanda needs therapy on Tuesdays, 1 hour\"*\n\u2022 **View sessions** \u2014 *\"Show my upcoming sessions\"*\n\u2022 **Get counts** \u2014 *\"How many clients do I have?\"*\n\nJust type what you need!",
      }]);
    });
    // Check if real AI backend is available
    api.aiTools().then(() => setUseRealAI(true)).catch(() => setUseRealAI(false));
  }, [refreshData]);

  useEffect(()=>{ chatEnd.current?.scrollIntoView({ behavior:'smooth' }); },[messages,toolCalls,isThinking]);

  const add = useCallback((m) => setMessages(p=>[...p,{...m,ts:new Date()}]), []);

  /* ── animate tool calls ── */
  const runTools = async (steps) => {
    for (let i=0; i<steps.length; i++) {
      setTools(p=>[...p.map(s=>({...s,status:'done'})),{label:steps[i],status:'running'}]);
      await sleep(300+Math.random()*250);
    }
    setTools(p=>p.map(s=>({...s,status:'done'})));
    await sleep(400);
    setTools([]);
  };

  /* ── agent ── */
  const agent = useCallback(async (text) => {
    // Re-fetch for freshest data
    const { clients: cc, providers: pp } = await refreshData();
    const intent = parseIntent(text, cc, pp);
    const c = { ...ctx };
    if (intent.clientId) { c.clientId=intent.clientId; c.clientName=intent.clientName; }
    if (intent.providerId) { c.providerId=intent.providerId; c.providerName=intent.providerName; }

    switch (intent.action) {

      /* ─── HELP ─── */
      case 'help': {
        await runTools(['load_capabilities']);
        add({ role:'assistant',type:'text',content:"Here\u2019s what I can do:\n\n\u2022 **Add clients/providers** \u2014 *\"Add client named Jane Doe, email jane@mail.com\"*\n\u2022 **List clients/providers** \u2014 *\"Show my clients\"*\n\u2022 **View details** \u2014 *\"Tell me about Amanda Foster\"*\n\u2022 **View calendars** \u2014 *\"Show Dr. Khan\u2019s availability\"*\n\u2022 **Compare calendars** \u2014 *\"Compare Amanda and Dr. Khan\"*\n\u2022 **Find providers** \u2014 *\"Amanda needs therapy on Tuesdays\"*\n\u2022 **Book sessions** \u2014 click Book on any result\n\u2022 **View sessions** \u2014 *\"Show upcoming sessions\"*\n\u2022 **Counts** \u2014 *\"How many clients do I have?\"*" });
        break;
      }

      /* ─── CREATE CLIENT ─── */
      case 'create_client': {
        if (!intent.newName) {
          await runTools(['parse_request']);
          add({ role:'assistant',type:'text',content:"I\u2019d love to add a new client! Please include at least their name. For example:\n*\"Add client named Jane Smith, email jane@example.com, Eastern timezone\"*" });
          break;
        }
        await runTools(['validate_input','create_client_record','update_database']);
        try {
          const nc = await api.createClient({
            name: intent.newName,
            email: intent.newEmail || '',
            phone: intent.newPhone || '',
            timezone: intent.newTimezone || 'America/New_York',
            address: '', notes: ''
          });
          await refreshData();
          add({ role:'assistant',type:'text',content:`Client created successfully!\n\n**${intent.newName}**${intent.newEmail ? '\nEmail: '+intent.newEmail : ''}${intent.newTimezone ? '\nTimezone: '+tzShort(intent.newTimezone) : '\nTimezone: Eastern (default)'}\n\nThey\u2019re now in your system and ready for scheduling.` });
          add({ role:'assistant',type:'created',entity:'client',name:intent.newName });
        } catch(e) {
          add({ role:'assistant',type:'text',content:`Sorry, I couldn\u2019t create the client: ${e.message}` });
        }
        break;
      }

      /* ─── CREATE PROVIDER ─── */
      case 'create_provider': {
        if (!intent.newName) {
          await runTools(['parse_request']);
          add({ role:'assistant',type:'text',content:"Please include the provider\u2019s name. For example:\n*\"Add provider named Dr. Sarah Lee, specialty Physical Therapy, Pacific timezone\"*" });
          break;
        }
        await runTools(['validate_input','create_provider_record','update_database']);
        try {
          await api.createProvider({
            name: intent.newName,
            email: intent.newEmail || '',
            phone: intent.newPhone || '',
            specialty: intent.newSpecialty || '',
            timezone: intent.newTimezone || 'America/New_York',
            address: '', notes: ''
          });
          await refreshData();
          add({ role:'assistant',type:'text',content:`Provider created!\n\n**${intent.newName}**${intent.newSpecialty ? '\nSpecialty: '+intent.newSpecialty : ''}${intent.newTimezone ? '\nTimezone: '+tzShort(intent.newTimezone) : '\nTimezone: Eastern (default)'}\n\nThey\u2019re now available for matching.` });
          add({ role:'assistant',type:'created',entity:'provider',name:intent.newName });
        } catch(e) {
          add({ role:'assistant',type:'text',content:`Couldn\u2019t create provider: ${e.message}` });
        }
        break;
      }

      /* ─── COUNT ─── */
      case 'count_clients': {
        await runTools(['query_clients_table']);
        add({ role:'assistant',type:'text',content:`You have **${cc.length} client${cc.length!==1?'s':''}** in your system.` });
        break;
      }
      case 'count_providers': {
        await runTools(['query_providers_table']);
        add({ role:'assistant',type:'text',content:`You have **${pp.length} provider${pp.length!==1?'s':''}** in your system.` });
        break;
      }
      case 'count_sessions': {
        await runTools(['query_matches_table']);
        try {
          const mm = await api.getMatches();
          const pending = mm.filter(m=>m.status==='pending').length;
          const confirmed = mm.filter(m=>m.status==='confirmed').length;
          add({ role:'assistant',type:'text',content:`You have **${mm.length} session${mm.length!==1?'s':''}** total:\n\u2022 ${pending} pending\n\u2022 ${confirmed} confirmed\n\u2022 ${mm.length-pending-confirmed} other` });
        } catch(e) { add({role:'assistant',type:'text',content:'Error loading sessions.'}); }
        break;
      }

      /* ─── LIST ─── */
      case 'list_clients': {
        await runTools(['query_clients_table','format_results']);
        if (cc.length === 0) { add({role:'assistant',type:'text',content:"You don\u2019t have any clients yet. Say *\"Add client named ...\"* to create one."}); break; }
        add({ role:'assistant',type:'text',content:`Here are your **${cc.length} clients**:` });
        add({ role:'assistant',type:'client_list',items:cc });
        break;
      }
      case 'list_providers': {
        await runTools(['query_providers_table','format_results']);
        if (pp.length===0) { add({role:'assistant',type:'text',content:"No providers yet. Say *\"Add provider named ...\"* to create one."}); break; }
        add({ role:'assistant',type:'text',content:`Here are your **${pp.length} providers**:` });
        add({ role:'assistant',type:'provider_list',items:pp });
        break;
      }
      case 'list_sessions': {
        await runTools(['query_matches_table','join_client_provider','format_results']);
        try {
          const mm = await api.getMatches();
          if (mm.length===0) { add({role:'assistant',type:'text',content:"No sessions booked yet."}); break; }
          const upcoming = mm.filter(m=>m.status==='pending'||m.status==='confirmed').sort((a,b)=>a.session_date.localeCompare(b.session_date));
          add({ role:'assistant',type:'text',content:`You have **${upcoming.length} upcoming session${upcoming.length!==1?'s':''}**:` });
          add({ role:'assistant',type:'session_list',items:upcoming.slice(0,10) });
          if (upcoming.length>10) add({role:'assistant',type:'text',content:`...and ${upcoming.length-10} more.`});
        } catch(e) { add({role:'assistant',type:'text',content:'Error loading sessions.'}); }
        break;
      }

      /* ─── DETAIL ─── */
      case 'client_detail': {
        await runTools(['get_client_record','get_client_sessions']);
        const cl = cc.find(x=>x.id===c.clientId);
        if (!cl) { add({role:'assistant',type:'text',content:'Client not found.'}); break; }
        let mm = []; try { mm = await api.getMatches(); } catch(e){}
        const cs = mm.filter(m=>m.client_name===cl.name);
        add({ role:'assistant',type:'text',content:`**${cl.name}**\n\u2022 Email: ${cl.email||'not set'}\n\u2022 Phone: ${cl.phone||'not set'}\n\u2022 Timezone: ${tzShort(cl.timezone)||'not set'}\n\u2022 Sessions: ${cs.length} total (${cs.filter(m=>m.status==='confirmed'||m.status==='pending').length} active)` });
        break;
      }
      case 'provider_detail': {
        await runTools(['get_provider_record','get_provider_sessions']);
        const pr = pp.find(x=>x.id===c.providerId);
        if (!pr) { add({role:'assistant',type:'text',content:'Provider not found.'}); break; }
        let mm = []; try { mm = await api.getMatches(); } catch(e){}
        const ps = mm.filter(m=>m.provider_name===pr.name);
        add({ role:'assistant',type:'text',content:`**${pr.name}**\n\u2022 Specialty: ${pr.specialty||'General'}\n\u2022 Email: ${pr.email||'not set'}\n\u2022 Phone: ${pr.phone||'not set'}\n\u2022 Timezone: ${tzShort(pr.timezone)||'not set'}\n\u2022 Sessions: ${ps.length} total (${ps.filter(m=>m.status==='confirmed'||m.status==='pending').length} active)` });
        break;
      }

      /* ─── CALENDAR / AVAILABILITY ─── */
      case 'view_client_calendar':
      case 'view_provider_calendar':
      case 'compare_calendars': {
        const isClient = intent.action==='view_client_calendar';
        const isCompare = intent.action==='compare_calendars';
        const steps = isCompare
          ? ['get_client_availability','get_provider_availability','compute_timezone_overlap','format_calendar']
          : isClient
            ? ['get_client_availability','format_calendar']
            : ['get_provider_availability','format_calendar'];
        await runTools(steps);
        try {
          const today = new Date().toISOString().split('T')[0];
          if (isClient || isCompare) {
            const cSugg = await api.getSuggestions(c.clientId);
            // The suggestions endpoint returns provider-client overlaps; for client-only, show raw availability
            add({ role:'assistant',type:'text',content:`Here\u2019s **${c.clientName}**\u2019s schedule overview. They have availability data loaded.` });
            if (isCompare && c.providerId) {
              const data = await api.realtimeSuggest({ client_id:c.clientId, weeks_ahead:4 });
              const prov = data.providers?.find(p=>p.provider.id===c.providerId);
              if (prov && prov.slots.length>0) {
                add({ role:'assistant',type:'text',content:`**Overlapping slots** between **${c.clientName}** and **${c.providerName}**:` });
                add({ role:'assistant',type:'availability',slots:prov.slots,personName:`${c.clientName} \u2229 ${c.providerName}` });
              } else {
                add({ role:'assistant',type:'text',content:`No overlapping availability found between **${c.clientName}** and **${c.providerName}** in the next 4 weeks.` });
              }
            }
          } else {
            // Provider availability - use suggestions for any client
            add({ role:'assistant',type:'text',content:`Showing **${c.providerName}**\u2019s availability overview.` });
            if (cc.length > 0) {
              const data = await api.realtimeSuggest({ client_id:cc[0].id, weeks_ahead:4 });
              const prov = data.providers?.find(p=>p.provider.id===c.providerId);
              if (prov) {
                add({ role:'assistant',type:'availability',slots:prov.slots,personName:c.providerName });
              } else {
                add({ role:'assistant',type:'text',content:'No availability data found for this provider in the next 4 weeks.' });
              }
            }
          }
        } catch(e) { add({role:'assistant',type:'text',content:'Error loading calendar data.'}); }
        break;
      }
      case 'view_calendar_help': {
        await runTools(['parse_request']);
        add({ role:'assistant',type:'text',content:"I can show calendars! Just mention whose calendar you want:\n\n\u2022 *\"Show Amanda Foster\u2019s availability\"*\n\u2022 *\"What\u2019s Dr. Khan\u2019s schedule?\"*\n\u2022 *\"Compare Amanda and Dr. Khan\u2019s calendars\"*" });
        break;
      }

      /* ─── FIND PROVIDERS (scheduling) ─── */
      case 'find_providers':
      case 'refine': {
        if (!c.clientId) {
          await runTools(['search_client_database']);
          add({role:'assistant',type:'text',content:"I couldn\u2019t identify the client. Could you tell me their full name?"});
          break;
        }
        await runTools(['search_client_database','get_client_calendar','query_provider_pool','compute_availability_overlap','subtract_booked_conflicts','rank_and_score_results']);
        let data = null;
        try {
          data = await api.realtimeSuggest({
            client_id:c.clientId,
            day_of_week:intent.days.length>0?intent.days:undefined,
            time_start:intent.timeHint?.start||undefined,
            time_end:intent.timeHint?.end||undefined,
            min_duration:intent.duration||30,
            weeks_ahead:4
          });
        } catch(e){}
        if (data&&intent.specialty) {
          const sl=intent.specialty.toLowerCase();
          data.providers=data.providers.filter(p=>p.provider.specialty?.toLowerCase().includes(sl));
          data.top_picks=data.top_picks.filter(t=>t.provider?.specialty?.toLowerCase().includes(sl));
        }
        c.lastResults=data; setCtx(c);
        if (!data||data.providers.length===0) {
          add({role:'assistant',type:'text',content:`No matching providers found for **${c.clientName}**. Try widening the time window or adding more days.`});
        } else {
          const dayStr=intent.days.length>0?intent.days.map(d=>DAY_FULL[d]+'s').join(' and '):'all days';
          const timeStr=intent.timeHint?intent.timeHint.label:'any time';
          add({role:'assistant',type:'text',content:`Found **${data.providers.length} provider${data.providers.length!==1?'s':''}** for **${c.clientName}** on ${dayStr}, ${timeStr}:`});
          add({role:'assistant',type:'providers',providers:data.providers.slice(0,5),clientId:c.clientId});
          if(data.providers.length>5) add({role:'assistant',type:'text',content:`Plus ${data.providers.length-5} more. Ask to see more or refine.`});
          add({role:'assistant',type:'text',content:'Click **Book** on any slot, or refine: *\"only mornings\"*, *\"what about Fridays?\"*'});
        }
        break;
      }

      /* ─── BOOK ─── */
      case 'book': {
        if (c.lastResults?.providers?.length>0) {
          await runTools(['prepare_booking']);
          const tp = c.lastResults.top_picks?.[0]||c.lastResults.providers[0]?.slots[0];
          if(tp){ add({role:'assistant',type:'text',content:`Click **Book** on any slot above to confirm. Or tell me which provider/time you prefer.`}); }
        } else {
          add({role:'assistant',type:'text',content:'No search results to book from. Tell me what the client needs first.'});
        }
        break;
      }

      /* ─── CANCEL SESSION ─── */
      case 'cancel_session': {
        await runTools(['parse_session_id']);
        add({ role:'assistant',type:'text',content:"To cancel a session, go to **Scheduling** and change the status, or tell me the client/provider and date. Session cancellation via AI is coming soon!" });
        break;
      }

      /* ─── UNKNOWN ─── */
      default: {
        await runTools(['parse_intent']);
        add({ role:'assistant',type:'text',content:"I\u2019m not sure what you need. Here are some things I can do:\n\n\u2022 *\"Add client named ...\"*\n\u2022 *\"Show my clients/providers\"*\n\u2022 *\"Amanda Foster needs therapy on Tuesdays\"*\n\u2022 *\"Show Dr. Khan\u2019s availability\"*\n\u2022 *\"How many sessions do I have?\"*\n\nOr just say **help** for the full list." });
      }
    }

    setCtx(c);
    setThinking(false);
  }, [ctx, refreshData, add]);

  /* ── real AI backend call ── */
  const agentReal = useCallback(async (text) => {
    llmHistory.current.push({ role: 'user', content: text });
    try {
      const res = await api.aiChat(text, llmHistory.current.slice(-20));
      // Animate tool calls from the backend log
      if (res.tool_calls && res.tool_calls.length) {
        for (const tc of res.tool_calls) {
          setTools(p => [...p.map(s => ({ ...s, status: 'done' })), { label: `${tc.name}${tc.summary ? ' → ' + tc.summary : ''}`, status: 'running' }]);
          await sleep(350);
        }
        setTools(p => p.map(s => ({ ...s, status: 'done' })));
        await sleep(300);
        setTools([]);
      }
      const reply = res.response || 'I processed your request but got no response.';
      llmHistory.current.push({ role: 'assistant', content: reply });
      add({ role: 'assistant', type: 'text', content: reply });
    } catch (e) {
      if (e.status === 503) {
        setUseRealAI(false);
        agent(text);
        return;
      }
      add({ role: 'assistant', type: 'text', content: `⚠️ AI error: ${e.data?.error || e.message || 'Unknown error'}` });
    }
    setThinking(false);
  }, [add, agent]);

  const handleSend = async () => {
    const t=input.trim(); if(!t||isThinking) return;
    setInput(''); add({role:'user',type:'text',content:t});
    setThinking(true); setTools([]);
    await sleep(250);
    if (useRealAI) agentReal(t); else agent(t);
  };

  const handleBook = (slot, providerId) => {
    if(!ctx.clientId) return;
    setBookSlot({...slot,provider_id:providerId}); setBookNotes(''); setConflict(null);
  };

  const confirmBook = async (force=false) => {
    if(!bookSlot) return;
    try {
      const body = { client_id:ctx.clientId, provider_id:bookSlot.provider_id, session_date:bookSlot.date, start_time:bookSlot.start_time, end_time:bookSlot.end_time, notes:bookNotes||null };
      if(force) body.force=true;
      await api.createMatch(body);
      add({role:'assistant',type:'booked',content:`Session booked! **${ctx.clientName}** \u2014 ${fmtDate(bookSlot.date)}, ${fmt12(bookSlot.start_time)} \u2013 ${fmt12(bookSlot.end_time)}.`});
      setBookSlot(null);
    } catch(e) {
      if(e.status===409&&e.data?.conflicts) setConflict(e.data);
    }
  };

  /* ── render message ── */
  const renderMsg = (msg) => {
    if (msg.type==='client_list') return <div style={{maxWidth:500}}>{msg.items.map(c=><ClientCard key={c.id} c={c}/>)}</div>;
    if (msg.type==='provider_list') return <div style={{maxWidth:500}}>{msg.items.map(p=><ProviderListCard key={p.id} p={p}/>)}</div>;
    if (msg.type==='session_list') return <div style={{maxWidth:540}}>{msg.items.map(s=><SessionRow key={s.id} s={s}/>)}</div>;
    if (msg.type==='availability') return <AvailabilityBlock slots={msg.slots} personName={msg.personName}/>;
    if (msg.type==='providers') return <div style={{maxWidth:520}}>{msg.providers.map((p,i)=><MatchCard key={i} provider={p.provider} slots={p.slots.slice(0,3)} onBook={(sl)=>handleBook(sl,p.provider.id)}/>)}</div>;
    if (msg.type==='created') return (
      <div style={{background:'#ede9fe',border:'1px solid #c4b5fd',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#5b21b6'}}>
        <strong>{msg.entity==='client'?'Client':'Provider'} added:</strong> {msg.name}
      </div>
    );
    if (msg.type==='booked') return (
      <div style={{background:'#ecfdf5',border:'1px solid #6ee7b7',borderRadius:10,padding:'12px 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          <span style={{fontWeight:600,color:'#065f46',fontSize:14}}>Session Booked</span>
        </div>
        <div style={{fontSize:13,color:'#047857'}} dangerouslySetInnerHTML={{__html:fmtMd(msg.content)}}/>
      </div>
    );
    return <div style={{fontSize:14,lineHeight:1.6}} dangerouslySetInnerHTML={{__html:fmtMd(msg.content)}}/>;
  };

  const hints = [
    'Show my clients',
    'Add client named John Smith, email john@test.com',
    'Amanda Foster needs therapy on Tuesdays',
    'Show upcoming sessions',
    'Compare Amanda Foster and Dr. Khan',
    'How many providers do I have?',
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 64px)',background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 20px',borderBottom:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fafbfc'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:34,height:34,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><path d="M17 10v4a5 5 0 01-10 0v-4"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
          </div>
          <div>
            <h2 style={{margin:0,fontSize:18}}>AI Assistant</h2>
            <span style={{fontSize:12,color:'#6b7280'}}>Your all-in-one scheduling command center {useRealAI ? <span title="Connected to OpenAI" style={{color:'#16a34a'}}>● GPT</span> : <span title="Mock mode — set OPENAI_API_KEY for real AI" style={{color:'#d97706'}}>● Demo</span>}</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {ctx.clientName && <span style={{fontSize:12,padding:'4px 10px',background:'#ede9fe',color:'#5b21b6',borderRadius:8,fontWeight:500}}>Client: {ctx.clientName}</span>}
          {ctx.providerName && <span style={{fontSize:12,padding:'4px 10px',background:'#dbeafe',color:'#1d4ed8',borderRadius:8,fontWeight:500}}>Provider: {ctx.providerName}</span>}
          <button className="btn btn-sm btn-outline" onClick={()=>{
            setMessages([{role:'assistant',type:'text',content:"Session cleared! What would you like to do next?",ts:new Date()}]);
            setCtx({clientId:null,clientName:null,providerId:null,providerName:null,lastResults:null});
            llmHistory.current = [];
          }}>New Session</button>
        </div>
      </div>

      {/* Chat */}
      <div style={{flex:1,overflowY:'auto',padding:'20px 0'}}>
        <div style={{maxWidth:740,margin:'0 auto',padding:'0 20px'}}>
          {messages.map((msg,i)=>(
            <div key={i} style={{display:'flex',justifyContent:msg.role==='user'?'flex-end':'flex-start',marginBottom:14}}>
              {msg.role==='assistant' && (
                <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',marginRight:10,flexShrink:0,marginTop:2}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><path d="M17 10v4a5 5 0 01-10 0v-4"/></svg>
                </div>
              )}
              <div style={{
                maxWidth:msg.type==='providers'||msg.type==='client_list'||msg.type==='provider_list'||msg.type==='session_list'||msg.type==='availability'?560:520,
                padding:['providers','client_list','provider_list','session_list','availability','created','booked'].includes(msg.type)?'4px 0':'10px 16px',
                background:msg.role==='user'?'#6366f1':['booked','created'].includes(msg.type)?'transparent':'#f9fafb',
                color:msg.role==='user'?'#fff':'#1f2937',
                borderRadius:msg.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',
                border:msg.role==='user'?'none':['booked','created'].includes(msg.type)?'none':'1px solid #e5e7eb',
              }}>
                {renderMsg(msg)}
              </div>
            </div>
          ))}
          {isThinking && (
            <div style={{display:'flex',justifyContent:'flex-start',marginBottom:14}}>
              <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',marginRight:10,flexShrink:0,marginTop:2}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><path d="M17 10v4a5 5 0 01-10 0v-4"/></svg>
              </div>
              <div style={{padding:'10px 16px',background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:'16px 16px 16px 4px',minWidth:260}}>
                <div style={{fontSize:12,fontWeight:600,color:'#6366f1',marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
                  <span className="ai-thinking-dot"/>Agent working...
                </div>
                {toolCalls.map((tc,i)=><ToolStep key={i} {...tc}/>)}
              </div>
            </div>
          )}
          <div ref={chatEnd}/>
        </div>
      </div>

      {/* Input */}
      <div style={{borderTop:'1px solid #e5e7eb',background:'#fafbfc',padding:'14px 20px'}}>
        <div style={{maxWidth:740,margin:'0 auto'}}>
          <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
            <textarea ref={inputEl} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}}
              placeholder="Ask me anything \u2014 add clients, find providers, view calendars..."
              rows={1} style={{flex:1,resize:'none',border:'1px solid #d1d5db',borderRadius:12,padding:'10px 14px',fontSize:14,fontFamily:'inherit',outline:'none',transition:'border-color 0.15s',lineHeight:1.5,minHeight:44,maxHeight:120,overflow:'auto'}}
              onFocus={e=>e.target.style.borderColor='#6366f1'} onBlur={e=>e.target.style.borderColor='#d1d5db'}/>
            <button onClick={handleSend} disabled={!input.trim()||isThinking}
              style={{width:44,height:44,borderRadius:12,border:'none',background:input.trim()&&!isThinking?'#6366f1':'#e5e7eb',color:'#fff',cursor:input.trim()&&!isThinking?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background 0.15s'}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>
            </button>
          </div>
          <div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap'}}>
            {hints.map((h,i)=>(
              <button key={i} onClick={()=>{setInput(h);inputEl.current?.focus();}}
                style={{fontSize:11,padding:'4px 10px',background:'#f3f4f6',border:'1px solid #e5e7eb',borderRadius:8,color:'#6b7280',cursor:'pointer',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#ede9fe';e.currentTarget.style.borderColor='#c4b5fd';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#f3f4f6';e.currentTarget.style.borderColor='#e5e7eb';}}
              >{h}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Booking modal */}
      {bookSlot && (
        <div className="modal-overlay" style={{zIndex:1100}} onClick={e=>e.target===e.currentTarget&&setBookSlot(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-header"><h3 style={{margin:0,fontSize:16}}>Confirm Booking</h3><button className="btn-ghost" onClick={()=>setBookSlot(null)}>&times;</button></div>
            <div className="modal-body">
              {conflict && (
                <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:12,marginBottom:16}}>
                  <strong style={{color:'#dc2626',fontSize:13}}>Conflict Detected</strong>
                  {conflict.conflicts?.map((c,i)=><div key={i} style={{fontSize:12,color:'#7f1d1d',marginTop:4}}>{c.conflict_type==='client'?'Client':'Provider'} conflict on {fmtDate(c.session_date)}</div>)}
                  <button className="btn btn-sm btn-outline" style={{marginTop:8}} onClick={()=>confirmBook(true)}>Override</button>
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'6px 14px',fontSize:14,marginBottom:14}}>
                <span style={{color:'#6b7280'}}>Client</span><strong>{ctx.clientName}</strong>
                <span style={{color:'#6b7280'}}>Date</span><strong>{fmtDate(bookSlot.date)}</strong>
                <span style={{color:'#6b7280'}}>Time</span><strong>{fmt12(bookSlot.start_time)} &ndash; {fmt12(bookSlot.end_time)}</strong>
              </div>
              <div className="form-group"><label style={{fontSize:13}}>Notes</label><textarea className="form-textarea" rows={2} value={bookNotes} onChange={e=>setBookNotes(e.target.value)} placeholder="Optional..." style={{fontSize:13}}/></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setBookSlot(null)}>Cancel</button>
              <button className="btn btn-success" onClick={()=>confirmBook()} style={{fontWeight:600}}>Confirm & Book</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
