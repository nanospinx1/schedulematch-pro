import { useState, useEffect } from 'react';
import { api } from '../api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const day = DAY_NAMES[d.getDay()];
  return `${day} ${dateStr}`;
}

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function ScoreBadge({ score, best }) {
  const color = best ? '#059669' : score >= 20 ? '#2563eb' : score >= 10 ? '#7c3aed' : '#6b7280';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: best ? '#ecfdf5' : `${color}10`, color,
      padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600
    }}>
      {best && '⭐ '}{score} pts
    </span>
  );
}

function DurationBadge({ minutes }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const label = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
  return (
    <span style={{
      background: '#f0f9ff', color: '#0369a1', padding: '2px 6px',
      borderRadius: 8, fontSize: 11, fontWeight: 500
    }}>
      {label}
    </span>
  );
}

function TzBadge({ tz }) {
  if (!tz) return null;
  const short = tz.split('/').pop().replace(/_/g, ' ');
  return (
    <span style={{
      background: '#fef3c7', color: '#92400e', padding: '1px 6px',
      borderRadius: 8, fontSize: 11
    }}>
      🕐 {short}
    </span>
  );
}

export default function Matching() {
  const [clients, setClients] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ client_id: '', provider_id: '', session_date: '', start_time: '', end_time: '', notes: '' });
  const [conflictError, setConflictError] = useState(null);

  // Filters
  const [sortBy, setSortBy] = useState('score'); // score, date, duration
  const [filterDate, setFilterDate] = useState('');
  const [minDuration, setMinDuration] = useState(0);

  // Real-time suggestion state
  const [rtMode, setRtMode] = useState(false);
  const [rtClient, setRtClient] = useState('');
  const [rtDates, setRtDates] = useState([]);
  const [rtDateInput, setRtDateInput] = useState('');
  const [rtStart, setRtStart] = useState('');
  const [rtEnd, setRtEnd] = useState('');
  const [rtResults, setRtResults] = useState(null);

  const load = () => {
    api.getClients().then(setClients);
    api.getMatches().then(setMatches);
  };
  useEffect(() => { load(); }, []);

  const handleGetSuggestions = async () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const data = await api.getSuggestions(selectedClient);
      setSuggestions(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const fillFromSuggestion = (provider, slot) => {
    setScheduleForm({
      client_id: suggestions?.client?.id || selectedClient,
      provider_id: provider.id,
      session_date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      notes: ''
    });
    setConflictError(null);
    setShowSchedule(true);
  };

  const handleSchedule = async (force = false) => {
    try {
      const body = { ...scheduleForm };
      if (force) body.force = true;
      await api.createMatch(body);
      setShowSchedule(false);
      setConflictError(null);
      setSuggestions(null);
      load();
    } catch (err) {
      if (err.status === 409 && err.data?.conflicts) {
        setConflictError(err.data);
      }
    }
  };

  const handleStatusChange = async (id, status) => {
    await api.updateMatch(id, { status });
    load();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this session?')) {
      await api.deleteMatch(id);
      load();
    }
  };

  // Filter and sort suggestion slots
  const getFilteredSlots = (slots) => {
    let filtered = slots.filter(s => s.duration_minutes >= minDuration);
    if (filterDate) filtered = filtered.filter(s => s.date === filterDate);
    if (sortBy === 'date') filtered.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
    else if (sortBy === 'duration') filtered.sort((a, b) => b.duration_minutes - a.duration_minutes);
    // Default is score (already sorted by backend)
    return filtered;
  };

  // Real-time suggestions (for phone calls)
  const handleRtSuggest = async () => {
    if (!rtClient) return;
    const data = await api.realtimeSuggest({
      client_id: parseInt(rtClient),
      preferred_dates: rtDates.length > 0 ? rtDates : undefined,
      preferred_time_start: rtStart || undefined,
      preferred_time_end: rtEnd || undefined
    });
    setRtResults(data.suggestions);
  };

  const addRtDate = () => {
    if (rtDateInput && !rtDates.includes(rtDateInput)) {
      setRtDates(prev => [...prev, rtDateInput].sort());
      setRtDateInput('');
    }
  };

  const removeRtDate = (date) => {
    setRtDates(prev => prev.filter(d => d !== date));
  };

  const bestProviderId = suggestions?.suggestions?.[0]?.provider?.id;

  return (
    <div>
      <div className="page-header">
        <h1>Scheduling</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setRtMode(!rtMode)}>
            {rtMode ? '📋 Standard Mode' : '📞 Phone Mode'}
          </button>
          <button className="btn btn-primary" onClick={() => { setShowSchedule(true); setConflictError(null); setScheduleForm({ client_id: '', provider_id: '', session_date: '', start_time: '', end_time: '', notes: '' }); }}>
            + Manual Schedule
          </button>
        </div>
      </div>

      {/* Real-time phone mode */}
      {rtMode && (
        <div className="suggestions-panel" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12 }}>📞 Real-Time Phone Suggestions</h3>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>
            Use this while on a call with a client. Enter their preferences and get instant provider matches.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
              <label>Client</label>
              <select className="form-select" value={rtClient} onChange={e => setRtClient(e.target.value)}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
              <label>Preferred Start</label>
              <input className="form-input" type="time" value={rtStart} onChange={e => setRtStart(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
              <label>Preferred End</label>
              <input className="form-input" type="time" value={rtEnd} onChange={e => setRtEnd(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Preferred Dates</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input className="form-input" type="date" value={rtDateInput} onChange={e => setRtDateInput(e.target.value)} style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm btn-outline" onClick={addRtDate}>+ Add</button>
            </div>
            {rtDates.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {rtDates.map(d => (
                  <span key={d} className="day-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} onClick={() => removeRtDate(d)}>
                    {formatDate(d)} ✕
                  </span>
                ))}
              </div>
            )}
            {rtDates.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No date filter — will search all upcoming dates</p>}
          </div>
          <button className="btn btn-success" onClick={handleRtSuggest}>🔍 Find Available Providers</button>

          {rtResults && (
            <div style={{ marginTop: 16 }}>
              {rtResults.length === 0 ? (
                <p style={{ color: '#6b7280' }}>No matching providers found for these preferences.</p>
              ) : (
                rtResults.map((r, i) => (
                  <div key={i} className="suggestion-item" onClick={() => {
                    setRtMode(false);
                    setScheduleForm({ client_id: rtClient, provider_id: r.provider.id, session_date: r.date, start_time: r.start_time, end_time: r.end_time, notes: '' });
                    setConflictError(null);
                    setShowSchedule(true);
                  }}>
                    <div>
                      <strong>{r.provider.name}</strong> {r.provider.specialty && <span style={{ color: '#6b7280' }}>({r.provider.specialty})</span>}
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        {formatDate(r.date)} {r.start_time} – {r.end_time}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-success">Book</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Standard auto-match mode */}
      {!rtMode && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h2>🔍 Auto-Match Engine</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Select Client</label>
                <select className="form-select" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                  <option value="">Choose a client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.timezone ? ` (${c.timezone.split('/').pop().replace(/_/g, ' ')})` : ''}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={handleGetSuggestions} disabled={!selectedClient || loading}>
                {loading ? '⏳ Matching...' : '🔍 Find Best Matches'}
              </button>
            </div>

            {suggestions && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>
                    Matches for <strong>{suggestions.client.name}</strong>
                    {suggestions.client.timezone && <TzBadge tz={suggestions.client.timezone} />}
                  </h3>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>
                    {suggestions.suggestions.length} provider{suggestions.suggestions.length !== 1 ? 's' : ''} found
                  </span>
                </div>

                {/* Filters bar */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>Sort:</span>
                  {['score', 'date', 'duration'].map(s => (
                    <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setSortBy(s)} style={{ padding: '2px 10px', fontSize: 12 }}>
                      {s === 'score' ? '⭐ Score' : s === 'date' ? '📅 Date' : '⏱ Duration'}
                    </button>
                  ))}
                  <span style={{ color: '#d1d5db' }}>|</span>
                  <label style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Min duration:
                    <select className="form-select" value={minDuration} onChange={e => setMinDuration(Number(e.target.value))}
                      style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}>
                      <option value={0}>Any</option>
                      <option value={30}>30m+</option>
                      <option value={60}>1h+</option>
                      <option value={90}>1.5h+</option>
                      <option value={120}>2h+</option>
                    </select>
                  </label>
                  <label style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Date:
                    <input className="form-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                      style={{ padding: '2px 6px', fontSize: 12, width: 140 }} />
                    {filterDate && <button className="btn-ghost" onClick={() => setFilterDate('')} style={{ fontSize: 12, padding: '0 4px' }}>✕</button>}
                  </label>
                </div>

                {suggestions.suggestions.length === 0 ? (
                  <p style={{ color: '#6b7280' }}>No overlapping availability found. Try updating schedules.</p>
                ) : (
                  suggestions.suggestions.map((s) => {
                    const isBest = s.provider.id === bestProviderId;
                    const filteredSlots = getFilteredSlots(s.available_slots);
                    if (filteredSlots.length === 0) return null;
                    return (
                      <div key={s.provider.id} style={{
                        marginBottom: 16, border: isBest ? '2px solid #059669' : '1px solid #e5e7eb',
                        borderRadius: 10, overflow: 'hidden',
                        background: isBest ? '#f0fdf4' : '#fff'
                      }}>
                        {/* Provider header */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 16px', background: isBest ? '#ecfdf5' : '#f9fafb',
                          borderBottom: '1px solid #e5e7eb'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isBest && <span style={{ background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>⭐ BEST MATCH</span>}
                            <strong style={{ fontSize: 15 }}>{s.provider.name}</strong>
                            {s.provider.specialty && <span style={{ color: '#6b7280', fontSize: 13 }}>• {s.provider.specialty}</span>}
                            <TzBadge tz={s.provider.timezone} />
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#6b7280' }}>
                            <span title="Total match score">Score: <strong style={{ color: '#111' }}>{s.total_score}</strong></span>
                            <span title="Number of overlapping slots">{s.match_count} slots</span>
                            <span title="Current bookings for this provider">Load: {s.provider_load}</span>
                            {s.tz_proximity === 0 && <span style={{ color: '#059669' }}>✓ Same TZ</span>}
                          </div>
                        </div>

                        {/* Slot list */}
                        <div style={{ padding: '4px 8px' }}>
                          {filteredSlots.slice(0, 8).map((slot, j) => (
                            <div key={j} className="suggestion-item" onClick={() => fillFromSuggestion(s.provider, slot)}
                              style={{ padding: '6px 8px', margin: '4px 0', borderRadius: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="day-tag" style={{ fontSize: 12 }}>{formatDate(slot.date)}</span>
                                <span style={{ fontWeight: 500 }}>{formatTime12(slot.start_time)} – {formatTime12(slot.end_time)}</span>
                                <DurationBadge minutes={slot.duration_minutes} />
                                <ScoreBadge score={slot.score} best={slot.score >= 24} />
                              </div>
                              <button className="btn btn-sm btn-success">📅 Book</button>
                            </div>
                          ))}
                          {filteredSlots.length > 8 && (
                            <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: '4px 0' }}>
                              +{filteredSlots.length - 8} more slots available
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scheduled sessions */}
      <div className="card">
        <div className="card-header">
          <h2>Scheduled Sessions</h2>
        </div>
        <div className="card-body">
          {matches.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <p>No sessions scheduled yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Client</th><th>Provider</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {matches.map(m => (
                    <tr key={m.id}>
                      <td>{m.client_name}</td>
                      <td>{m.provider_name}</td>
                      <td>{formatDate(m.session_date)}</td>
                      <td>{formatTime12(m.start_time)} – {formatTime12(m.end_time)}</td>
                      <td>
                        <select className="form-select" value={m.status} onChange={e => handleStatusChange(m.id, e.target.value)} style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}>
                          <option value="pending">⏳ Pending</option>
                          <option value="confirmed">✅ Confirmed</option>
                          <option value="completed">✔ Completed</option>
                          <option value="cancelled">❌ Cancelled</option>
                          <option value="no_show">🚫 No Show</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Schedule modal with conflict detection */}
      {showSchedule && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSchedule(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>Schedule a Session</h2>
              <button className="btn-ghost" onClick={() => setShowSchedule(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Conflict warning */}
              {conflictError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
                  padding: 12, marginBottom: 16
                }}>
                  <strong style={{ color: '#dc2626' }}>⚠ Scheduling Conflict Detected</strong>
                  {conflictError.conflicts?.map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#7f1d1d', marginTop: 4 }}>
                      {c.conflict_type === 'client' ? '👤 Client' : '🩺 Provider'} conflict:
                      {' '}{c.client_name} ↔ {c.provider_name} on {formatDate(c.session_date)} {formatTime12(c.start_time)} – {formatTime12(c.end_time)} ({c.status})
                    </div>
                  ))}
                  <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => handleSchedule(true)}>
                    Override & Schedule Anyway
                  </button>
                </div>
              )}

              <div className="form-group">
                <label>Client</label>
                <select className="form-select" value={scheduleForm.client_id} onChange={e => setScheduleForm({...scheduleForm, client_id: e.target.value})}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Provider</label>
                <select className="form-select" value={scheduleForm.provider_id} onChange={e => setScheduleForm({...scheduleForm, provider_id: e.target.value})}>
                  <option value="">Select provider...</option>
                  <ProviderOptions />
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input className="form-input" type="date" value={scheduleForm.session_date} onChange={e => setScheduleForm({...scheduleForm, session_date: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Start Time</label>
                  <input className="form-input" type="time" value={scheduleForm.start_time} onChange={e => setScheduleForm({...scheduleForm, start_time: e.target.value})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>End Time</label>
                  <input className="form-input" type="time" value={scheduleForm.end_time} onChange={e => setScheduleForm({...scheduleForm, end_time: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-textarea" value={scheduleForm.notes} onChange={e => setScheduleForm({...scheduleForm, notes: e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowSchedule(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleSchedule()}>Schedule Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderOptions() {
  const [providers, setProviders] = useState([]);
  useEffect(() => { api.getProviders().then(setProviders); }, []);
  return providers.map(p => <option key={p.id} value={p.id}>{p.name} {p.specialty ? `(${p.specialty})` : ''}</option>);
}
