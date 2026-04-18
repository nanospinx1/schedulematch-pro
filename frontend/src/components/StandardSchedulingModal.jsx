import { useState, useEffect } from 'react';
import { api } from '../api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]} ${dateStr}`;
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: best ? '#ecfdf5' : `${color}10`, color, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      {best && '⭐ '}{score} pts
    </span>
  );
}

function DurationBadge({ minutes }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const label = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
  return <span style={{ background: '#f0f9ff', color: '#0369a1', padding: '2px 6px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>{label}</span>;
}

function TzBadge({ tz }) {
  if (!tz) return null;
  const short = tz.split('/').pop().replace(/_/g, ' ');
  return <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 8, fontSize: 11 }}>🕐 {short}</span>;
}

export default function StandardSchedulingModal({ onClose, onBooked }) {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [sortBy, setSortBy] = useState('score');
  const [filterDate, setFilterDate] = useState('');
  const [minDuration, setMinDuration] = useState(0);

  // Booking
  const [bookingSlot, setBookingSlot] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [conflictError, setConflictError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  useEffect(() => { api.getClients().then(setClients); }, []);

  const handleGetSuggestions = async () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const data = await api.getSuggestions(selectedClient);
      setSuggestions(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleBook = async (force = false) => {
    if (!bookingSlot) return;
    try {
      const body = {
        client_id: suggestions.client.id,
        provider_id: bookingSlot.provider.id,
        session_date: bookingSlot.slot.date,
        start_time: bookingSlot.slot.start_time,
        end_time: bookingSlot.slot.end_time,
        notes: bookingNotes || null,
      };
      if (force) body.force = true;
      await api.createMatch(body);
      setBookingSlot(null);
      setBookingNotes('');
      setConflictError(null);
      setBookingSuccess(true);
      if (onBooked) onBooked();
      // Re-fetch suggestions to reflect the booking
      handleGetSuggestions();
    } catch (err) {
      if (err.status === 409 && err.data?.conflicts) {
        setConflictError(err.data);
      }
    }
  };

  const getFilteredSlots = (slots) => {
    let filtered = slots.filter(s => s.duration_minutes >= minDuration);
    if (filterDate) filtered = filtered.filter(s => s.date === filterDate);
    if (sortBy === 'date') filtered.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
    else if (sortBy === 'duration') filtered.sort((a, b) => b.duration_minutes - a.duration_minutes);
    return filtered;
  };

  const bestProviderId = suggestions?.suggestions?.[0]?.provider?.id;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-fullscreen">
        <div className="modal-header">
          <h3>📋 Standard Scheduling</h3>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 24 }}>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>
            Select a client whose availability is already in the system. The engine will find the best matching providers.
          </p>

          {bookingSuccess && (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#065f46' }}>✅ Session booked successfully!</span>
              <button className="btn btn-sm btn-outline" onClick={() => setBookingSuccess(false)}>Dismiss</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Select Client</label>
              <select className="form-select" value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSuggestions(null); }}>
                <option value="">Choose a client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.timezone ? ` (${c.timezone.split('/').pop().replace(/_/g, ' ')})` : ''}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleGetSuggestions} disabled={!selectedClient || loading}>
              {loading ? '⏳ Matching...' : '🔍 Find Best Matches'}
            </button>
          </div>

          {suggestions && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>
                  Matches for <strong>{suggestions.client.name}</strong> <TzBadge tz={suggestions.client.timezone} />
                </h3>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{suggestions.suggestions.length} provider{suggestions.suggestions.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: '#6b7280', fontWeight: 500 }}>Sort:</span>
                {['score', 'date', 'duration'].map(s => (
                  <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSortBy(s)} style={{ padding: '2px 10px', fontSize: 12 }}>
                    {s === 'score' ? '⭐ Score' : s === 'date' ? '📅 Date' : '⏱ Duration'}
                  </button>
                ))}
                <span style={{ color: '#d1d5db' }}>|</span>
                <label style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Min:
                  <select className="form-select" value={minDuration} onChange={e => setMinDuration(Number(e.target.value))} style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}>
                    <option value={0}>Any</option>
                    <option value={30}>30m+</option>
                    <option value={60}>1h+</option>
                    <option value={90}>1.5h+</option>
                    <option value={120}>2h+</option>
                  </select>
                </label>
                <label style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Date:
                  <input className="form-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ padding: '2px 6px', fontSize: 12, width: 140 }} />
                  {filterDate && <button className="btn-ghost" onClick={() => setFilterDate('')} style={{ fontSize: 12, padding: '0 4px' }}>✕</button>}
                </label>
              </div>

              {suggestions.suggestions.length === 0 ? (
                <p style={{ color: '#6b7280' }}>No overlapping availability found.</p>
              ) : (
                suggestions.suggestions.map((s) => {
                  const isBest = s.provider.id === bestProviderId;
                  const filteredSlots = getFilteredSlots(s.available_slots);
                  if (filteredSlots.length === 0) return null;
                  return (
                    <div key={s.provider.id} style={{ marginBottom: 16, border: isBest ? '2px solid #059669' : '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: isBest ? '#f0fdf4' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: isBest ? '#ecfdf5' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isBest && <span style={{ background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>⭐ BEST MATCH</span>}
                          <strong style={{ fontSize: 15 }}>{s.provider.name}</strong>
                          {s.provider.specialty && <span style={{ color: '#6b7280', fontSize: 13 }}>• {s.provider.specialty}</span>}
                          <TzBadge tz={s.provider.timezone} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#6b7280' }}>
                          <span>Score: <strong style={{ color: '#111' }}>{s.total_score}</strong></span>
                          <span>{s.match_count} slots</span>
                          <span>Load: {s.provider_load}</span>
                          {s.tz_proximity === 0 && <span style={{ color: '#059669' }}>✓ Same TZ</span>}
                        </div>
                      </div>
                      <div style={{ padding: '4px 8px' }}>
                        {filteredSlots.slice(0, 8).map((slot, j) => (
                          <div key={j} className="suggestion-item" onClick={() => { setBookingSlot({ provider: s.provider, slot }); setConflictError(null); setBookingNotes(''); }}
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
                        {filteredSlots.length > 8 && <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: '4px 0' }}>+{filteredSlots.length - 8} more</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      {/* Booking confirmation overlay */}
      {bookingSlot && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => e.target === e.currentTarget && setBookingSlot(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>📅 Confirm Booking</h3>
              <button className="btn-ghost" onClick={() => setBookingSlot(null)}>✕</button>
            </div>
            <div className="modal-body">
              {conflictError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <strong style={{ color: '#dc2626' }}>⚠ Conflict Detected</strong>
                  {conflictError.conflicts?.map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#7f1d1d', marginTop: 4 }}>
                      {c.conflict_type === 'client' ? '👤 Client' : '🩺 Provider'}: {c.client_name} ↔ {c.provider_name} on {formatDate(c.session_date)} ({c.status})
                    </div>
                  ))}
                  <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => handleBook(true)}>Override & Book</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14, marginBottom: 16 }}>
                <span style={{ color: '#6b7280' }}>Client:</span>
                <strong>{suggestions.client.name}</strong>
                <span style={{ color: '#6b7280' }}>Provider:</span>
                <strong>{bookingSlot.provider.name}</strong>
                <span style={{ color: '#6b7280' }}>Date:</span>
                <strong>{formatDate(bookingSlot.slot.date)}</strong>
                <span style={{ color: '#6b7280' }}>Time:</span>
                <strong>{formatTime12(bookingSlot.slot.start_time)} – {formatTime12(bookingSlot.slot.end_time)}</strong>
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea className="form-textarea" rows={2} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Session notes..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setBookingSlot(null)}>Cancel</button>
              <button className="btn btn-success" onClick={() => handleBook()}>✅ Confirm & Book</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
