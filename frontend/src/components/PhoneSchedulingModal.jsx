import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${DAY_NAMES[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

export default function PhoneSchedulingModal({ onClose, onBooked }) {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState([]);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [minDuration, setMinDuration] = useState(30);
  const [weeksAhead, setWeeksAhead] = useState(4);
  const [specificDates, setSpecificDates] = useState([]);
  const [dateInput, setDateInput] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchCount, setSearchCount] = useState(0);

  // Booking state
  const [bookingSlot, setBookingSlot] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [conflictError, setConflictError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => { api.getClients().then(setClients); }, []);

  const doSearch = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const data = await api.realtimeSuggest({
        client_id: parseInt(selectedClient),
        day_of_week: dayOfWeek.length > 0 ? dayOfWeek : undefined,
        preferred_dates: specificDates.length > 0 ? specificDates : undefined,
        time_start: timeStart || undefined,
        time_end: timeEnd || undefined,
        min_duration: minDuration,
        weeks_ahead: weeksAhead
      });
      setResults(data);
      setSearchCount(c => c + 1);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [selectedClient, dayOfWeek, specificDates, timeStart, timeEnd, minDuration, weeksAhead]);

  // Debounced auto-search when filters change
  useEffect(() => {
    if (!selectedClient) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doSearch, 600);
    return () => clearTimeout(debounceRef.current);
  }, [doSearch]);

  const toggleDay = (dayNum) => {
    setDayOfWeek(prev => prev.includes(dayNum) ? prev.filter(d => d !== dayNum) : [...prev, dayNum]);
  };
  const addDate = () => {
    if (dateInput && !specificDates.includes(dateInput)) {
      setSpecificDates(prev => [...prev, dateInput].sort());
      setDateInput('');
    }
  };

  const handleBook = async (force = false) => {
    if (!bookingSlot) return;
    try {
      const body = {
        client_id: parseInt(selectedClient),
        provider_id: bookingSlot.provider.id,
        session_date: bookingSlot.date,
        start_time: bookingSlot.start_time,
        end_time: bookingSlot.end_time,
        notes: bookingNotes || null,
      };
      if (force) body.force = true;
      await api.createMatch(body);
      const clientName = clients.find(c => c.id == selectedClient)?.name || 'Client';
      setBookingSuccess({
        client: clientName,
        provider: bookingSlot.provider.name,
        date: formatShortDate(bookingSlot.date),
        time: `${formatTime12(bookingSlot.start_time)} - ${formatTime12(bookingSlot.end_time)}`
      });
      setBookingSlot(null);
      setBookingNotes('');
      setConflictError(null);
      if (onBooked) onBooked();
      // Refresh results
      doSearch();
    } catch (err) {
      if (err.status === 409 && err.data?.conflicts) {
        setConflictError(err.data);
      }
    }
  };

  const clientObj = clients.find(c => c.id == selectedClient);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-fullscreen">
        <div className="modal-header" style={{ borderBottom: '2px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0 }}>Phone Intake</h3>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Live scheduling during client calls</span>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 20 }}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: 0, display: 'flex', height: 'calc(100vh - 60px)' }}>
          {/* LEFT PANEL — Filters */}
          <div style={{ width: 340, minWidth: 300, borderRight: '1px solid #e5e7eb', padding: 20, overflowY: 'auto', background: '#fafbfc' }}>
            {/* Client */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>Client</label>
              <select className="form-select" value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setResults(null); setBookingSuccess(null); }}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {clientObj && clientObj.timezone && (
                <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>Timezone: {clientObj.timezone}</span>
              )}
            </div>

            {/* Day of week chips */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>Days Available</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {DAY_LABELS.map((label, i) => (
                  <button key={i} type="button" onClick={() => toggleDay(i)}
                    style={{
                      width: 38, height: 34, borderRadius: 6, border: '1px solid',
                      borderColor: dayOfWeek.includes(i) ? '#059669' : '#d1d5db',
                      background: dayOfWeek.includes(i) ? '#059669' : '#fff',
                      color: dayOfWeek.includes(i) ? '#fff' : '#374151',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    title={DAY_FULL[i]}>{label}</button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>
                {dayOfWeek.length === 0 ? 'No filter — all days' : dayOfWeek.map(d => DAY_NAMES[d]).join(', ')}
              </span>
            </div>

            {/* Time window */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>From</label>
                <input className="form-input" type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} style={{ fontSize: 13 }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>To</label>
                <input className="form-input" type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} style={{ fontSize: 13 }} />
              </div>
            </div>

            {/* Min duration */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>Min. Duration</label>
              <select className="form-select" value={minDuration} onChange={e => setMinDuration(Number(e.target.value))} style={{ fontSize: 13 }}>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            {/* Weeks ahead */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>Search Horizon</label>
              <select className="form-select" value={weeksAhead} onChange={e => setWeeksAhead(Number(e.target.value))} style={{ fontSize: 13 }}>
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={4}>4 weeks</option>
                <option value={6}>6 weeks</option>
              </select>
            </div>

            {/* Specific dates */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>Specific Dates</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="form-input" type="date" value={dateInput} onChange={e => setDateInput(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
                <button type="button" className="btn btn-sm btn-outline" onClick={addDate} style={{ padding: '4px 10px' }}>+</button>
              </div>
              {specificDates.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {specificDates.map(d => (
                    <span key={d} onClick={() => setSpecificDates(prev => prev.filter(x => x !== d))}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, fontSize: 12, color: '#166534', cursor: 'pointer' }}>
                      {formatShortDate(d)} &times;
                    </span>
                  ))}
                </div>
              )}
              <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>Optional — for "can you do next Wednesday?"</span>
            </div>

            <button className="btn btn-success" onClick={doSearch} disabled={!selectedClient || loading}
              style={{ width: '100%', fontWeight: 600, padding: '10px 0' }}>
              {loading ? 'Searching...' : 'Search Providers'}
            </button>
            {searchCount > 0 && <span style={{ fontSize: 11, color: '#9ca3af', display: 'block', textAlign: 'center', marginTop: 6 }}>Auto-updates as you refine</span>}
          </div>

          {/* RIGHT PANEL — Results */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {/* Success banner */}
            {bookingSuccess && (
              <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '14px 18px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#065f46', marginBottom: 4 }}>Session Booked</div>
                  <div style={{ fontSize: 14, color: '#047857', lineHeight: 1.5 }}>
                    <strong>{bookingSuccess.client}</strong> with <strong>{bookingSuccess.provider}</strong><br/>
                    {bookingSuccess.date} &middot; {bookingSuccess.time}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>You can confirm this with the client now.</div>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => setBookingSuccess(null)}>&times;</button>
              </div>
            )}

            {!selectedClient && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Select a client to begin</div>
                <div style={{ fontSize: 13 }}>Choose a client from the left panel and enter their preferences</div>
              </div>
            )}

            {selectedClient && !results && !loading && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Ready to search</div>
                <div style={{ fontSize: 13 }}>Set preferences and click "Search Providers" or adjust filters for auto-update</div>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>Searching providers...</div>
              </div>
            )}

            {results && !loading && (
              <>
                {/* Top Picks strip */}
                {results.top_picks && results.top_picks.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      Top Picks
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {results.top_picks.map((tp, i) => (
                        <div key={i} onClick={() => { setBookingSlot(tp); setConflictError(null); setBookingNotes(''); }}
                          style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, cursor: 'pointer', minWidth: 200, transition: 'all 0.15s', flex: '0 1 auto' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#f59e0b'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = '#fde68a'}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{tp.provider.name}</div>
                          <div style={{ fontSize: 12, color: '#92400e' }}>{formatShortDate(tp.date)}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#b45309' }}>{formatTime12(tp.start_time)} &ndash; {formatTime12(tp.end_time)}</div>
                          <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, padding: '1px 8px', background: '#fef3c7', borderRadius: 8, color: '#92400e' }}>{tp.duration_minutes} min</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Provider groups */}
                {results.providers && results.providers.length > 0 ? (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', marginBottom: 10 }}>
                      {results.providers.length} provider{results.providers.length !== 1 ? 's' : ''} available
                    </div>
                    {results.providers.map((p, pi) => (
                      <div key={pi} style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
                        {/* Provider header */}
                        <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{p.provider.name}</span>
                            {p.provider.specialty && <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>{p.provider.specialty}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {p.provider.timezone && (
                              <span style={{ fontSize: 11, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8 }}>
                                {p.provider.timezone.split('/').pop().replace(/_/g, ' ')}
                              </span>
                            )}
                            <span style={{ fontSize: 11, padding: '2px 8px', background: '#f0fdf4', color: '#166534', borderRadius: 8 }}>
                              {p.slots.length} slot{p.slots.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        {/* Slot rows */}
                        <div>
                          {p.slots.map((slot, si) => (
                            <div key={si}
                              onClick={() => { setBookingSlot({ ...slot, provider: p.provider }); setConflictError(null); setBookingNotes(''); }}
                              style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: si < p.slots.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <div>
                                <span style={{ fontWeight: 500, fontSize: 13, color: '#1f2937', marginRight: 12 }}>
                                  {formatShortDate(slot.date)}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#059669' }}>
                                  {formatTime12(slot.start_time)} &ndash; {formatTime12(slot.end_time)}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, padding: '2px 8px', background: '#f3f4f6', borderRadius: 8, color: '#6b7280' }}>
                                  {slot.duration_minutes} min
                                </span>
                                <button className="btn btn-sm btn-success" style={{ fontSize: 12, padding: '4px 12px' }}>Book</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>No matching availability found</div>
                    <div style={{ fontSize: 13, lineHeight: 1.8, color: '#9ca3af' }}>
                      Try adjusting:<br/>
                      &bull; Widen the time window<br/>
                      &bull; Reduce minimum duration<br/>
                      &bull; Add more days of the week<br/>
                      &bull; Extend the search horizon
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Booking confirmation modal */}
      {bookingSlot && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => e.target === e.currentTarget && setBookingSlot(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
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
                      {c.conflict_type === 'client' ? 'Client' : 'Provider'}: {c.client_name} / {c.provider_name} on {formatDate(c.session_date)}
                    </div>
                  ))}
                  <button className="btn btn-sm btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => handleBook(true)}>Override & Book Anyway</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14, marginBottom: 14 }}>
                <span style={{ color: '#6b7280' }}>Client</span>
                <strong>{clients.find(c => c.id == selectedClient)?.name}</strong>
                <span style={{ color: '#6b7280' }}>Provider</span>
                <strong>{bookingSlot.provider.name}</strong>
                <span style={{ color: '#6b7280' }}>Date</span>
                <strong>{formatShortDate(bookingSlot.date)}</strong>
                <span style={{ color: '#6b7280' }}>Time</span>
                <strong>{formatTime12(bookingSlot.start_time)} &ndash; {formatTime12(bookingSlot.end_time)}</strong>
                <span style={{ color: '#6b7280' }}>Duration</span>
                <strong>{bookingSlot.duration_minutes} min</strong>
              </div>
              <div className="form-group">
                <label style={{ fontSize: 13 }}>Notes (optional)</label>
                <textarea className="form-textarea" rows={2} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Session notes..." style={{ fontSize: 13 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setBookingSlot(null)}>Cancel</button>
              <button className="btn btn-success" onClick={() => handleBook()} style={{ fontWeight: 600 }}>Confirm & Book</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
