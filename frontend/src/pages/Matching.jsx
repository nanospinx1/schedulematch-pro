import { useState, useEffect } from 'react';
import { api } from '../api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const day = DAY_NAMES[d.getDay()];
  return `${day} ${dateStr}`;
}

export default function Matching() {
  const [clients, setClients] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ client_id: '', provider_id: '', session_date: '', start_time: '', end_time: '', notes: '' });

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
    const data = await api.getSuggestions(selectedClient);
    setSuggestions(data);
  };

  const fillFromSuggestion = (provider, slot) => {
    setScheduleForm({
      client_id: selectedClient,
      provider_id: provider.id,
      session_date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      notes: ''
    });
    setShowSchedule(true);
  };

  const handleSchedule = async () => {
    await api.createMatch(scheduleForm);
    setShowSchedule(false);
    setSuggestions(null);
    load();
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

  return (
    <div>
      <div className="page-header">
        <h1>Scheduling</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setRtMode(!rtMode)}>
            {rtMode ? '📋 Standard Mode' : '📞 Phone Mode'}
          </button>
          <button className="btn btn-primary" onClick={() => { setShowSchedule(true); setScheduleForm({ client_id: '', provider_id: '', session_date: '', start_time: '', end_time: '', notes: '' }); }}>
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

      {/* Standard suggestion mode */}
      {!rtMode && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h2>Find Matches for a Client</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Select Client</label>
                <select className="form-select" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                  <option value="">Choose a client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={handleGetSuggestions} disabled={!selectedClient}>
                🔍 Find Providers
              </button>
            </div>

            {suggestions && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 8 }}>Matching providers for {suggestions.client.name}:</h3>
                {suggestions.suggestions.length === 0 ? (
                  <p style={{ color: '#6b7280' }}>No overlapping availability found. Try updating schedules.</p>
                ) : (
                  suggestions.suggestions.map((s, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <strong>{s.provider.name}</strong> {s.provider.specialty && <span style={{ color: '#6b7280' }}>– {s.provider.specialty}</span>}
                      {s.provider.address && <span style={{ fontSize: 13, color: '#9ca3af' }}> 📍 {s.provider.address}</span>}
                      <div style={{ marginTop: 4 }}>
                        {s.available_slots.map((slot, j) => (
                          <div key={j} className="suggestion-item" onClick={() => fillFromSuggestion(s.provider, slot)}>
                            <span><span className="day-tag">{formatDate(slot.date)}</span> {slot.start_time} – {slot.end_time}</span>
                            <button className="btn btn-sm btn-success">Schedule</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
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
                      <td>{m.session_date}</td>
                      <td>{m.start_time} – {m.end_time}</td>
                      <td>
                        <select className="form-select" value={m.status} onChange={e => handleStatusChange(m.id, e.target.value)} style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}>
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="cancelled">Cancelled</option>
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

      {/* Schedule modal */}
      {showSchedule && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSchedule(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>Schedule a Session</h2>
              <button className="btn-ghost" onClick={() => setShowSchedule(false)}>✕</button>
            </div>
            <div className="modal-body">
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
              <button className="btn btn-primary" onClick={handleSchedule}>Schedule Session</button>
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
