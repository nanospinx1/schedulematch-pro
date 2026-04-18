import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${DAY_NAMES[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

// Simulated AI agent with tool calls
function createMockAgent(clients, doSearch) {
  // Parse intent from natural language
  function parseIntent(text) {
    const lower = text.toLowerCase();
    const result = { clientName: null, days: [], timeHint: null, duration: null, specialty: null, action: 'search' };

    // Detect client name
    for (const c of clients) {
      if (lower.includes(c.name.toLowerCase()) || lower.includes(c.name.split(' ')[0].toLowerCase())) {
        result.clientName = c.name;
        result.clientId = c.id;
        result.clientTz = c.timezone;
        break;
      }
    }

    // Detect days
    DAY_FULL.forEach((day, i) => {
      if (lower.includes(day.toLowerCase()) || lower.includes(DAY_NAMES[i].toLowerCase() + ' ') || lower.includes(DAY_NAMES[i].toLowerCase() + 's')) {
        result.days.push(i);
      }
    });
    if (lower.includes('weekday')) result.days = [1,2,3,4,5];
    if (lower.includes('weekend')) result.days = [0,6];

    // Detect time preferences
    if (lower.includes('morning') || lower.includes('am')) result.timeHint = { start: '08:00', end: '12:00', label: 'mornings' };
    else if (lower.includes('afternoon')) result.timeHint = { start: '12:00', end: '17:00', label: 'afternoons' };
    else if (lower.includes('evening')) result.timeHint = { start: '17:00', end: '21:00', label: 'evenings' };

    // Detect duration
    if (lower.includes('1 hour') || lower.includes('one hour') || lower.includes('60 min')) result.duration = 60;
    else if (lower.includes('90 min') || lower.includes('1.5 hour')) result.duration = 90;
    else if (lower.includes('45 min')) result.duration = 45;
    else if (lower.includes('30 min') || lower.includes('half hour')) result.duration = 30;

    // Detect specialty
    const specialties = ['therapy', 'counseling', 'physical therapy', 'speech', 'occupational', 'mental health', 'behavioral'];
    for (const s of specialties) {
      if (lower.includes(s)) { result.specialty = s; break; }
    }

    // Detect booking intent
    if (lower.includes('book') || lower.includes('confirm') || lower.includes('schedule that') || lower.includes('go with')) {
      result.action = 'book';
    }
    if (lower.includes('more option') || lower.includes('other') || lower.includes('what else') || lower.includes('different')) {
      result.action = 'refine';
    }

    return result;
  }

  return { parseIntent, doSearch };
}

// Tool call display component
function ToolCallStep({ icon, label, status, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: '#6b7280' }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, background: status === 'done' ? '#d1fae5' : status === 'running' ? '#dbeafe' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
        {status === 'done' ? '\u2713' : status === 'running' ? '\u25CF' : '\u2026'}
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: status === 'running' ? '#2563eb' : '#6b7280' }}>{icon} {label}</span>
      {detail && <span style={{ color: '#9ca3af', marginLeft: 'auto' }}>{detail}</span>}
    </div>
  );
}

// Provider suggestion card within chat
function ProviderSuggestionCard({ provider, slots, onBook }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{provider.name}</span>
          {provider.specialty && <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 8 }}>{provider.specialty}</span>}
        </div>
        {provider.timezone && (
          <span style={{ fontSize: 10, padding: '2px 6px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6 }}>
            {provider.timezone.split('/').pop().replace(/_/g, ' ')}
          </span>
        )}
      </div>
      {slots.map((slot, i) => (
        <div key={i} style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < slots.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
          <div>
            <span style={{ fontWeight: 500, fontSize: 12, color: '#1f2937', marginRight: 10 }}>{formatShortDate(slot.date)}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{formatTime12(slot.start_time)} \u2013 {formatTime12(slot.end_time)}</span>
            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>{slot.duration_minutes}min</span>
          </div>
          <button className="btn btn-sm btn-success" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => onBook(slot)}>Book</button>
        </div>
      ))}
    </div>
  );
}

export default function AIPhoneIntakeModal({ onClose, onBooked }) {
  const [clients, setClients] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [toolCalls, setToolCalls] = useState([]);
  const [sessionContext, setSessionContext] = useState({ clientId: null, clientName: null, lastResults: null });
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Booking state
  const [bookingSlot, setBookingSlot] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [conflictError, setConflictError] = useState(null);

  useEffect(() => {
    api.getClients().then(c => {
      setClients(c);
      // Welcome message
      setMessages([{
        role: 'assistant',
        type: 'text',
        content: "Hi! I\u2019m your AI scheduling assistant. Tell me about the client on the phone \u2014 their name, when they\u2019re available, and what type of session they need. I\u2019ll find the best matching providers.\n\nFor example: *\"Amanda Foster is calling, she needs therapy on Tuesday or Thursday afternoons, 1 hour sessions.\"*",
        timestamp: new Date()
      }]);
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, toolCalls, isThinking]);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { ...msg, timestamp: new Date() }]);
  }, []);

  const simulateAgent = useCallback(async (userText) => {
    const agent = createMockAgent(clients);
    const intent = agent.parseIntent(userText);

    // Update session context
    const ctx = { ...sessionContext };
    if (intent.clientId) { ctx.clientId = intent.clientId; ctx.clientName = intent.clientName; }

    // --- BOOKING FLOW ---
    if (intent.action === 'book' && ctx.lastResults?.providers?.length > 0) {
      setToolCalls([{ icon: '\uD83D\uDCCB', label: 'Preparing booking...', status: 'running' }]);
      await sleep(600);
      setToolCalls(prev => [{ ...prev[0], status: 'done' }]);
      await sleep(400);
      setToolCalls([]);

      const topSlot = ctx.lastResults.top_picks?.[0] || ctx.lastResults.providers[0]?.slots[0];
      if (topSlot) {
        const provName = topSlot.provider?.name || ctx.lastResults.providers[0]?.provider?.name;
        addMessage({
          role: 'assistant', type: 'text',
          content: `Great choice! I\u2019ve prepared a booking:\n\n**${ctx.clientName}** with **${provName}**\n${formatShortDate(topSlot.date)} \u2022 ${formatTime12(topSlot.start_time)} \u2013 ${formatTime12(topSlot.end_time)}\n\nClick the **Book** button on any slot above to confirm, or tell me to pick a different option.`
        });
      }
      setIsThinking(false);
      return;
    }

    // --- SEARCH FLOW ---
    if (!ctx.clientId) {
      setToolCalls([{ icon: '\uD83D\uDD0D', label: 'search_client_database', status: 'running' }]);
      await sleep(800);
      setToolCalls([{ icon: '\uD83D\uDD0D', label: 'search_client_database', status: 'done', detail: 'no match' }]);
      await sleep(400);
      setToolCalls([]);
      addMessage({
        role: 'assistant', type: 'text',
        content: "I couldn\u2019t identify the client. Could you tell me their full name? I\u2019ll look them up in the system."
      });
      setIsThinking(false);
      return;
    }

    // Simulate tool calls sequence
    const steps = [
      { icon: '\uD83D\uDD0D', label: 'search_client_database', detail: null },
      { icon: '\uD83D\uDCC5', label: 'get_client_calendar', detail: null },
      { icon: '\uD83D\uDC65', label: 'search_providers', detail: null },
      { icon: '\u2699\uFE0F', label: 'check_availability_overlap', detail: null },
      { icon: '\uD83D\uDEAB', label: 'filter_conflicts', detail: null },
      { icon: '\u2B50', label: 'rank_and_score', detail: null },
    ];

    for (let i = 0; i < steps.length; i++) {
      setToolCalls(prev => [...prev.map(s => ({ ...s, status: 'done' })), { ...steps[i], status: 'running' }]);
      await sleep(400 + Math.random() * 300);
    }

    // Actually call the backend
    let data = null;
    try {
      data = await api.realtimeSuggest({
        client_id: ctx.clientId,
        day_of_week: intent.days.length > 0 ? intent.days : undefined,
        time_start: intent.timeHint?.start || undefined,
        time_end: intent.timeHint?.end || undefined,
        min_duration: intent.duration || 30,
        weeks_ahead: 4
      });
    } catch (e) { console.error(e); }

    // Filter by specialty if requested
    if (data && intent.specialty) {
      const specLower = intent.specialty.toLowerCase();
      data.providers = data.providers.filter(p =>
        p.provider.specialty?.toLowerCase().includes(specLower)
      );
      data.top_picks = data.top_picks.filter(tp =>
        tp.provider?.specialty?.toLowerCase().includes(specLower)
      );
    }

    setToolCalls(prev => prev.map(s => ({ ...s, status: 'done' })));
    await sleep(500);
    setToolCalls([]);

    ctx.lastResults = data;
    setSessionContext(ctx);

    // Build response
    if (!data || data.providers.length === 0) {
      addMessage({
        role: 'assistant', type: 'text',
        content: `I searched for providers matching ${ctx.clientName}\u2019s preferences but couldn\u2019t find any available slots. You could try:\n\n\u2022 Widening the time window\n\u2022 Adding more days\n\u2022 Asking if a different week works\n\nJust tell me the updated preferences.`
      });
    } else {
      const dayStr = intent.days.length > 0 ? intent.days.map(d => DAY_FULL[d] + 's').join(' and ') : 'all days';
      const timeStr = intent.timeHint ? intent.timeHint.label : 'any time';
      const specStr = intent.specialty ? ` for ${intent.specialty}` : '';
      const summary = `I found **${data.providers.length} provider${data.providers.length !== 1 ? 's' : ''}** with availability for **${ctx.clientName}** on ${dayStr}, ${timeStr}${specStr}. Here are the best options:`;

      addMessage({ role: 'assistant', type: 'text', content: summary });

      // Add provider cards as a separate message
      addMessage({
        role: 'assistant', type: 'providers',
        providers: data.providers.slice(0, 5),
        clientId: ctx.clientId
      });

      if (data.providers.length > 5) {
        addMessage({
          role: 'assistant', type: 'text',
          content: `Plus ${data.providers.length - 5} more provider${data.providers.length - 5 !== 1 ? 's' : ''}. Ask me to show more or refine the search.`
        });
      }

      addMessage({
        role: 'assistant', type: 'text',
        content: 'Click **Book** on any slot to confirm, or tell me to adjust the search \u2014 e.g. *"only show morning slots"* or *"what about Fridays?"*'
      });
    }

    setIsThinking(false);
  }, [clients, sessionContext, addMessage]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');
    addMessage({ role: 'user', type: 'text', content: text });
    setIsThinking(true);
    setToolCalls([]);
    await sleep(300);
    simulateAgent(text);
  };

  const handleBook = async (slot, providerId) => {
    if (!sessionContext.clientId) return;
    setBookingSlot({ ...slot, provider_id: providerId });
    setBookingNotes('');
    setConflictError(null);
  };

  const confirmBooking = async (force = false) => {
    if (!bookingSlot) return;
    try {
      const body = {
        client_id: sessionContext.clientId,
        provider_id: bookingSlot.provider_id,
        session_date: bookingSlot.date,
        start_time: bookingSlot.start_time,
        end_time: bookingSlot.end_time,
        notes: bookingNotes || null,
      };
      if (force) body.force = true;
      await api.createMatch(body);
      addMessage({
        role: 'assistant', type: 'booked',
        content: `Session booked! **${sessionContext.clientName}** \u2014 ${formatShortDate(bookingSlot.date)}, ${formatTime12(bookingSlot.start_time)} \u2013 ${formatTime12(bookingSlot.end_time)}. You can confirm this with the client now.`
      });
      setBookingSlot(null);
      if (onBooked) onBooked();
    } catch (err) {
      if (err.status === 409 && err.data?.conflicts) setConflictError(err.data);
    }
  };

  const renderMessageContent = (msg) => {
    if (msg.type === 'providers') {
      return (
        <div style={{ maxWidth: 520 }}>
          {msg.providers.map((p, i) => (
            <ProviderSuggestionCard key={i} provider={p.provider} slots={p.slots.slice(0, 3)}
              onBook={(slot) => handleBook(slot, p.provider.id)} />
          ))}
        </div>
      );
    }
    if (msg.type === 'booked') {
      return (
        <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            <span style={{ fontWeight: 600, color: '#065f46', fontSize: 14 }}>Session Booked</span>
          </div>
          <div style={{ fontSize: 13, color: '#047857' }} dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
        </div>
      );
    }
    return <div style={{ fontSize: 14, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />;
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-fullscreen">
        <div className="modal-header" style={{ borderBottom: '2px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><path d="M17 10v4a5 5 0 01-10 0v-4"/><path d="M8 21h8"/><path d="M12 17v4"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0 }}>AI Phone Intake</h3>
              <span style={{ fontSize: 12, color: '#6b7280' }}>AI-assisted scheduling from phone conversations</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {sessionContext.clientName && (
              <span style={{ fontSize: 12, padding: '4px 10px', background: '#ede9fe', color: '#5b21b6', borderRadius: 8, fontWeight: 500 }}>
                Client: {sessionContext.clientName}
              </span>
            )}
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: 20 }}>&times;</button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
          {/* Chat area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0, marginTop: 2 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><path d="M17 10v4a5 5 0 01-10 0v-4"/></svg>
                    </div>
                  )}
                  <div style={{
                    maxWidth: msg.type === 'providers' ? 560 : 520,
                    padding: msg.type === 'providers' ? '4px 0' : '10px 16px',
                    background: msg.role === 'user' ? '#6366f1' : msg.type === 'booked' ? 'transparent' : '#f9fafb',
                    color: msg.role === 'user' ? '#fff' : '#1f2937',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    border: msg.role === 'user' ? 'none' : msg.type === 'booked' ? 'none' : '1px solid #e5e7eb',
                  }}>
                    {renderMessageContent(msg)}
                  </div>
                </div>
              ))}

              {/* Thinking indicator */}
              {isThinking && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0, marginTop: 2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><path d="M17 10v4a5 5 0 01-10 0v-4"/></svg>
                  </div>
                  <div style={{ padding: '10px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '16px 16px 16px 4px', minWidth: 260 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="ai-thinking-dot" />
                      Agent working...
                    </div>
                    {toolCalls.map((tc, i) => (
                      <ToolCallStep key={i} {...tc} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div style={{ borderTop: '1px solid #e5e7eb', background: '#fff', padding: '14px 20px' }}>
            <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                  placeholder="Type what the client is telling you..."
                  rows={1}
                  style={{
                    width: '100%', resize: 'none', border: '1px solid #d1d5db', borderRadius: 12,
                    padding: '10px 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                    transition: 'border-color 0.15s', lineHeight: 1.5,
                    minHeight: 44, maxHeight: 120, overflow: 'auto'
                  }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </div>
              <button onClick={handleSend} disabled={!input.trim() || isThinking}
                style={{
                  width: 44, height: 44, borderRadius: 12, border: 'none',
                  background: input.trim() && !isThinking ? '#6366f1' : '#e5e7eb',
                  color: '#fff', cursor: input.trim() && !isThinking ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  transition: 'background 0.15s'
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>
              </button>
            </div>
            <div style={{ maxWidth: 720, margin: '6px auto 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                'Amanda Foster needs therapy on Tuesdays',
                'Carlos Mendez is available weekday mornings',
                'Show me more options',
                'What about Thursday afternoons?',
              ].map((hint, i) => (
                <button key={i} onClick={() => { setInput(hint); inputRef.current?.focus(); }}
                  style={{ fontSize: 11, padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.borderColor = '#c4b5fd'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                >{hint}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Booking confirmation */}
      {bookingSlot && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => e.target === e.currentTarget && setBookingSlot(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 16 }}>Confirm Booking</h3>
              <button className="btn-ghost" onClick={() => setBookingSlot(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {conflictError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <strong style={{ color: '#dc2626', fontSize: 13 }}>Conflict Detected</strong>
                  {conflictError.conflicts?.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#7f1d1d', marginTop: 4 }}>
                      {c.conflict_type === 'client' ? 'Client' : 'Provider'} conflict on {formatShortDate(c.session_date)}
                    </div>
                  ))}
                  <button className="btn btn-sm btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => confirmBooking(true)}>Override</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14, marginBottom: 14 }}>
                <span style={{ color: '#6b7280' }}>Client</span>
                <strong>{sessionContext.clientName}</strong>
                <span style={{ color: '#6b7280' }}>Date</span>
                <strong>{formatShortDate(bookingSlot.date)}</strong>
                <span style={{ color: '#6b7280' }}>Time</span>
                <strong>{formatTime12(bookingSlot.start_time)} \u2013 {formatTime12(bookingSlot.end_time)}</strong>
              </div>
              <div className="form-group">
                <label style={{ fontSize: 13 }}>Notes</label>
                <textarea className="form-textarea" rows={2} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Optional..." style={{ fontSize: 13 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setBookingSlot(null)}>Cancel</button>
              <button className="btn btn-success" onClick={() => confirmBooking()} style={{ fontWeight: 600 }}>Confirm & Book</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}
