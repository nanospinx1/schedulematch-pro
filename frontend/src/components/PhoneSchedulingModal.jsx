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

export default function PhoneSchedulingModal({ onClose, onBooked }) {
  const [clients, setClients] = useState([]);
  const [rtClient, setRtClient] = useState('');
  const [rtDates, setRtDates] = useState([]);
  const [rtDateInput, setRtDateInput] = useState('');
  const [rtStart, setRtStart] = useState('');
  const [rtEnd, setRtEnd] = useState('');
  const [rtResults, setRtResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // Booking
  const [bookingSlot, setBookingSlot] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [conflictError, setConflictError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  useEffect(() => { api.getClients().then(setClients); }, []);

  const handleRtSuggest = async () => {
    if (!rtClient) return;
    setLoading(true);
    try {
      const data = await api.realtimeSuggest({
        client_id: parseInt(rtClient),
        preferred_dates: rtDates.length > 0 ? rtDates : undefined,
        preferred_time_start: rtStart || undefined,
        preferred_time_end: rtEnd || undefined,
      });
      setRtResults(data.suggestions);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const addRtDate = () => {
    if (rtDateInput && !rtDates.includes(rtDateInput)) {
      setRtDates(prev => [...prev, rtDateInput].sort());
      setRtDateInput('');
    }
  };

  const handleBook = async (force = false) => {
    if (!bookingSlot) return;
    try {
      const body = {
        client_id: parseInt(rtClient),
        provider_id: bookingSlot.provider.id,
        session_date: bookingSlot.date,
        start_time: bookingSlot.start_time,
        end_time: bookingSlot.end_time,
        notes: bookingNotes || null,
      };
      if (force) body.force = true;
      await api.createMatch(body);
      setBookingSlot(null);
      setBookingNotes('');
      setConflictError(null);
      setBookingSuccess(true);
      if (onBooked) onBooked();
    } catch (err) {
      if (err.status === 409 && err.data?.conflicts) {
        setConflictError(err.data);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-fullscreen">
        <div className="modal-header">
          <h3>📞 Phone Scheduling</h3>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 24 }}>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>
            Use this while on a call with a client. Enter their preferences and find available providers in real time.
          </p>

          {bookingSuccess && (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#065f46' }}>✅ Session booked! You can confirm with the client.</span>
              <button className="btn btn-sm btn-outline" onClick={() => setBookingSuccess(false)}>Dismiss</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
              <label>Client</label>
              <select className="form-select" value={rtClient} onChange={e => { setRtClient(e.target.value); setRtResults(null); }}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>Preferred Start</label>
              <input className="form-input" type="time" value={rtStart} onChange={e => setRtStart(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>Preferred End</label>
              <input className="form-input" type="time" value={rtEnd} onChange={e => setRtEnd(e.target.value)} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Preferred Dates</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input className="form-input" type="date" value={rtDateInput} onChange={e => setRtDateInput(e.target.value)} style={{ flex: 1, maxWidth: 200 }} />
              <button type="button" className="btn btn-sm btn-outline" onClick={addRtDate}>+ Add</button>
            </div>
            {rtDates.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {rtDates.map(d => (
                  <span key={d} className="day-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} onClick={() => setRtDates(prev => prev.filter(x => x !== d))}>
                    {formatDate(d)} ✕
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No date filter — will search all upcoming dates</p>
            )}
          </div>

          <button className="btn btn-success" onClick={handleRtSuggest} disabled={!rtClient || loading} style={{ marginBottom: 20 }}>
            {loading ? '⏳ Searching...' : '🔍 Find Available Providers'}
          </button>

          {rtResults && (
            <div>
              {rtResults.length === 0 ? (
                <p style={{ color: '#6b7280' }}>No matching providers found for these preferences.</p>
              ) : (
                <>
                  <h3 style={{ marginBottom: 8 }}>{rtResults.length} available slot{rtResults.length !== 1 ? 's' : ''} found</h3>
                  {rtResults.map((r, i) => (
                    <div key={i} className="suggestion-item" onClick={() => { setBookingSlot(r); setConflictError(null); setBookingNotes(''); }}
                      style={{ padding: '8px 12px', margin: '4px 0', borderRadius: 6 }}>
                      <div>
                        <strong>{r.provider.name}</strong>
                        {r.provider.specialty && <span style={{ color: '#6b7280', marginLeft: 6 }}>({r.provider.specialty})</span>}
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{formatDate(r.date)} • {formatTime12(r.start_time)} – {formatTime12(r.end_time)}</div>
                      </div>
                      <button className="btn btn-sm btn-success">📅 Book</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Booking confirmation */}
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
                      {c.conflict_type === 'client' ? '👤' : '🩺'}: {c.client_name} ↔ {c.provider_name} on {formatDate(c.session_date)}
                    </div>
                  ))}
                  <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => handleBook(true)}>Override & Book</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14, marginBottom: 16 }}>
                <span style={{ color: '#6b7280' }}>Client:</span>
                <strong>{clients.find(c => c.id == rtClient)?.name}</strong>
                <span style={{ color: '#6b7280' }}>Provider:</span>
                <strong>{bookingSlot.provider.name}</strong>
                <span style={{ color: '#6b7280' }}>Date:</span>
                <strong>{formatDate(bookingSlot.date)}</strong>
                <span style={{ color: '#6b7280' }}>Time:</span>
                <strong>{formatTime12(bookingSlot.start_time)} – {formatTime12(bookingSlot.end_time)}</strong>
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
