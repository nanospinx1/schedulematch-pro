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
      {best && '\u2605 '}{score} pts
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
  return <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 8, fontSize: 11 }}>{short}</span>;
}

const SERIES_STATUS = {
  confirmed: { color: '#059669', bg: '#ecfdf5', label: 'Confirmed', icon: '\u2713' },
  adjusted_time: { color: '#2563eb', bg: '#eff6ff', label: 'Adjusted', icon: '\u21BB' },
  unavailable: { color: '#dc2626', bg: '#fef2f2', label: 'Unavailable', icon: '\u2014' },
};

export default function StandardSchedulingModal({ onClose, onBooked }) {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);

  const [sortBy, setSortBy] = useState('score');
  const [filterDate, setFilterDate] = useState('');
  const [minDuration, setMinDuration] = useState(0);

  // Single booking
  const [bookingSlot, setBookingSlot] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [conflictError, setConflictError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Series builder
  const [seriesProvider, setSeriesProvider] = useState(null);
  const [seriesCadence, setSeriesCadence] = useState('weekly');
  const [seriesDuration, setSeriesDuration] = useState(60);
  const [seriesWeeks, setSeriesWeeks] = useState(8);
  const [seriesStartDate, setSeriesStartDate] = useState('');
  const [seriesPlan, setSeriesPlan] = useState(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesIncluded, setSeriesIncluded] = useState({});
  const [seriesBooking, setSeriesBooking] = useState(false);
  const [seriesNotes, setSeriesNotes] = useState('');

  useEffect(() => { api.getClients().then(setClients); }, []);

  const handleGetSuggestions = async () => {
    if (!selectedClient) return;
    setLoading(true);
    try { setSuggestions(await api.getSuggestions(selectedClient)); }
    catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleBook = async (force = false) => {
    if (!bookingSlot) return;
    try {
      const body = { client_id: suggestions.client.id, provider_id: bookingSlot.provider.id,
        session_date: bookingSlot.slot.date, start_time: bookingSlot.slot.start_time,
        end_time: bookingSlot.slot.end_time, notes: bookingNotes || null };
      if (force) body.force = true;
      await api.createMatch(body);
      setBookingSlot(null); setBookingNotes(''); setConflictError(null);
      setSuccessMsg('Session booked successfully!'); setBookingSuccess(true);
      if (onBooked) onBooked(); handleGetSuggestions();
    } catch (err) {
      if (err.status === 409 && err.data?.conflicts) setConflictError(err.data);
    }
  };

  const openSeriesBuilder = (provider) => {
    setSeriesProvider(provider); setSeriesPlan(null); setSeriesNotes('');
    const today = new Date();
    const dayOffset = (8 - today.getDay()) % 7 || 7;
    const nextMon = new Date(today); nextMon.setDate(today.getDate() + dayOffset);
    setSeriesStartDate(nextMon.toISOString().split('T')[0]);
  };

  const handleGeneratePlan = async () => {
    if (!seriesProvider || !selectedClient || !seriesStartDate) return;
    setSeriesLoading(true);
    try {
      const data = await api.smartSuggestRecurring({
        client_id: Number(selectedClient), provider_id: seriesProvider.id,
        cadence: seriesCadence, desired_duration: seriesDuration,
        num_weeks: seriesWeeks, start_date: seriesStartDate,
      });
      setSeriesPlan(data);
      const inc = {};
      data.occurrences.forEach((occ, i) => { inc[i] = occ.status !== 'unavailable'; });
      setSeriesIncluded(inc);
    } catch (err) { console.error(err); }
    setSeriesLoading(false);
  };

  const handleBookSeries = async () => {
    if (!seriesPlan) return;
    setSeriesBooking(true);
    const included = seriesPlan.occurrences.filter((_, i) => seriesIncluded[i]);
    let booked = 0, failed = 0;
    for (const occ of included) {
      try {
        await api.createMatch({ client_id: seriesPlan.client.id, provider_id: seriesPlan.provider.id,
          session_date: occ.date, start_time: occ.start_time, end_time: occ.end_time,
          notes: seriesNotes || null, force: true });
        booked++;
      } catch { failed++; }
    }
    setSeriesProvider(null); setSeriesPlan(null);
    setSuccessMsg(`Series booked: ${booked} session${booked !== 1 ? 's' : ''} created${failed > 0 ? `, ${failed} failed` : ''}`);
    setBookingSuccess(true);
    if (onBooked) onBooked(); handleGetSuggestions();
    setSeriesBooking(false);
  };

  const toggleIncluded = (idx) => setSeriesIncluded(prev => ({ ...prev, [idx]: !prev[idx] }));
  const includedCount = seriesPlan ? seriesPlan.occurrences.filter((_, i) => seriesIncluded[i]).length : 0;

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
          <h3>Auto-Match Scheduling</h3>
          <button className="btn-ghost" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body" style={{ padding: 24, flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>
            Select a client whose availability is already in the system. The engine will find the best matching providers.
          </p>

          {bookingSuccess && (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#065f46' }}>{'\u2713'} {successMsg}</span>
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
              {loading ? 'Matching...' : 'Find Best Matches'}
            </button>
          </div>

          {suggestions && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Matches for <strong>{suggestions.client.name}</strong> <TzBadge tz={suggestions.client.timezone} /></h3>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{suggestions.suggestions.length} provider{suggestions.suggestions.length !== 1 ? 's' : ''}</span>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: '#6b7280', fontWeight: 500 }}>Sort:</span>
                {['score', 'date', 'duration'].map(s => (
                  <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSortBy(s)} style={{ padding: '2px 10px', fontSize: 12 }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                <span style={{ color: '#d1d5db' }}>|</span>
                <label style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Min: <select className="form-select" value={minDuration} onChange={e => setMinDuration(Number(e.target.value))} style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}>
                    <option value={0}>Any</option><option value={30}>30m+</option><option value={60}>1h+</option><option value={90}>1.5h+</option><option value={120}>2h+</option>
                  </select>
                </label>
                <label style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Date: <input className="form-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ padding: '2px 6px', fontSize: 12, width: 140 }} />
                  {filterDate && <button className="btn-ghost" onClick={() => setFilterDate('')} style={{ fontSize: 12, padding: '0 4px' }}>{'\u2715'}</button>}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: isBest ? '#ecfdf5' : '#f9fafb', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isBest && <span style={{ background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>BEST MATCH</span>}
                          <strong style={{ fontSize: 15 }}>{s.provider.name}</strong>
                          {s.provider.specialty && <span style={{ color: '#6b7280', fontSize: 13 }}>{'\u2022'} {s.provider.specialty}</span>}
                          <TzBadge tz={s.provider.timezone} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                          <span style={{ color: '#6b7280' }}>Score: <strong style={{ color: '#111' }}>{s.total_score}</strong></span>
                          <span style={{ color: '#6b7280' }}>{s.match_count} slots</span>
                          {s.tz_proximity === 0 && <span style={{ color: '#059669' }}>{'\u2713'} Same TZ</span>}
                          <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); openSeriesBuilder(s.provider); }}
                            style={{ marginLeft: 4, fontSize: 12, padding: '3px 10px' }}>
                            Schedule Series
                          </button>
                        </div>
                      </div>
                      <div style={{ padding: '4px 8px' }}>
                        {filteredSlots.slice(0, 8).map((slot, j) => (
                          <div key={j} className="suggestion-item"
                            onClick={() => { setBookingSlot({ provider: s.provider, slot }); setConflictError(null); setBookingNotes(''); }}
                            style={{ padding: '6px 8px', margin: '4px 0', borderRadius: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="day-tag" style={{ fontSize: 12 }}>{formatDate(slot.date)}</span>
                              <span style={{ fontWeight: 500 }}>{formatTime12(slot.start_time)} {'\u2013'} {formatTime12(slot.end_time)}</span>
                              <DurationBadge minutes={slot.duration_minutes} />
                              <ScoreBadge score={slot.score} best={slot.score >= 24} />
                            </div>
                            <button className="btn btn-sm btn-success" style={{ fontSize: 12 }}>Book</button>
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

      {/* Single session booking */}
      {bookingSlot && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => e.target === e.currentTarget && setBookingSlot(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Book Session</h3>
              <button className="btn-ghost" onClick={() => setBookingSlot(null)}>{'\u2715'}</button>
            </div>
            <div className="modal-body">
              {conflictError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <strong style={{ color: '#dc2626' }}>Conflict Detected</strong>
                  {conflictError.conflicts?.map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#7f1d1d', marginTop: 4 }}>
                      {c.conflict_type === 'client' ? 'Client' : 'Provider'}: {c.client_name} {'\u2194'} {c.provider_name} on {formatDate(c.session_date)} ({c.status})
                    </div>
                  ))}
                  <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => handleBook(true)}>Override & Book</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14, marginBottom: 16 }}>
                <span style={{ color: '#6b7280' }}>Client:</span><strong>{suggestions.client.name}</strong>
                <span style={{ color: '#6b7280' }}>Provider:</span><strong>{bookingSlot.provider.name}</strong>
                <span style={{ color: '#6b7280' }}>Date:</span><strong>{formatDate(bookingSlot.slot.date)}</strong>
                <span style={{ color: '#6b7280' }}>Time:</span><strong>{formatTime12(bookingSlot.slot.start_time)} {'\u2013'} {formatTime12(bookingSlot.slot.end_time)}</strong>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Notes (optional)</label>
                <textarea className="form-textarea" rows={2} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Session notes..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setBookingSlot(null)}>Cancel</button>
              <button className="btn btn-success" onClick={() => handleBook()}>Confirm & Book</button>
            </div>
          </div>
        </div>
      )}

      {/* Series builder */}
      {seriesProvider && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => e.target === e.currentTarget && setSeriesProvider(null)}>
          <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Schedule Recurring Series</h3>
                <span style={{ fontSize: 13, color: '#6b7280' }}>
                  {suggestions?.client?.name} {'\u2192'} {seriesProvider.name}
                  {seriesProvider.specialty ? ` \u2022 ${seriesProvider.specialty}` : ''}
                </span>
              </div>
              <button className="btn-ghost" onClick={() => setSeriesProvider(null)}>{'\u2715'}</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', minHeight: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 13 }}>Start Date</label>
                  <input type="date" className="form-input" value={seriesStartDate} onChange={e => { setSeriesStartDate(e.target.value); setSeriesPlan(null); }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 13 }}>Cadence</label>
                  <select className="form-select" value={seriesCadence} onChange={e => { setSeriesCadence(e.target.value); setSeriesPlan(null); }}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 Weeks</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 13 }}>Session Duration</label>
                  <select className="form-select" value={seriesDuration} onChange={e => { setSeriesDuration(Number(e.target.value)); setSeriesPlan(null); }}>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 13 }}>Number of Sessions</label>
                  <select className="form-select" value={seriesWeeks} onChange={e => { setSeriesWeeks(Number(e.target.value)); setSeriesPlan(null); }}>
                    {[4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} sessions</option>)}
                  </select>
                </div>
              </div>

              <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={seriesLoading || !seriesStartDate}
                style={{ width: '100%', marginBottom: 20 }}>
                {seriesLoading ? 'Analyzing availability...' : 'Generate Smart Schedule'}
              </button>

              {seriesPlan && (
                <>
                  {seriesPlan.anchor && (
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontSize: 13, color: '#0369a1', fontWeight: 600 }}>Best Pattern Found</span>
                          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                            {seriesPlan.anchor.day_of_week}s at {formatTime12(seriesPlan.anchor.start_time)} {'\u2013'} {formatTime12(seriesPlan.anchor.end_time)}
                          </div>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>
                            {seriesPlan.anchor.timezone?.split('/').pop().replace(/_/g, ' ')} time
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>
                            {Math.round(seriesPlan.anchor.confidence * 100)}%
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>consistency</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
                    <span style={{ color: '#059669', fontWeight: 600 }}>{seriesPlan.summary.confirmed} confirmed</span>
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{seriesPlan.summary.adjusted_time} adjusted</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>{seriesPlan.summary.unavailable} unavailable</span>
                    <span style={{ marginLeft: 'auto', color: '#374151', fontWeight: 600 }}>{includedCount} selected</span>
                  </div>

                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 100px 80px', gap: 0, padding: '8px 12px',
                      background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <span></span><span>Date</span><span>Time</span><span>Status</span><span style={{ textAlign: 'right' }}>Include</span>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {seriesPlan.occurrences.map((occ, i) => {
                        const st = SERIES_STATUS[occ.status] || SERIES_STATUS.unavailable;
                        const included = seriesIncluded[i];
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 100px 80px', gap: 0, padding: '10px 12px',
                            borderBottom: i < seriesPlan.occurrences.length - 1 ? '1px solid #f3f4f6' : 'none',
                            background: included ? '#fff' : '#fafafa', opacity: included ? 1 : 0.6, transition: 'all 0.1s' }}>
                            <span style={{ fontSize: 14 }}>{st.icon}</span>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(occ.date)}</div>
                            <div>
                              {occ.start_time ? (
                                <>
                                  <div style={{ fontSize: 14, fontWeight: 500 }}>{formatTime12(occ.start_time)} {'\u2013'} {formatTime12(occ.end_time)}</div>
                                  {occ.status === 'adjusted_time' && occ.original_time && (
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>was {formatTime12(occ.original_time)}</div>
                                  )}
                                </>
                              ) : <span style={{ fontSize: 13, color: '#9ca3af' }}>{'\u2014'}</span>}
                            </div>
                            <div>
                              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                                {st.label}
                              </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              {occ.status !== 'unavailable' ? (
                                <input type="checkbox" checked={included} onChange={() => toggleIncluded(i)}
                                  style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                              ) : <span style={{ fontSize: 11, color: '#d1d5db' }}>N/A</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {seriesPlan.summary.adjusted_time > 0 && (
                    <p style={{ fontSize: 12, color: '#1e40af', background: '#eff6ff', padding: '8px 12px', borderRadius: 6, marginBottom: 12, lineHeight: 1.4 }}>
                      Adjusted sessions are at a different time than the anchor pattern because the usual slot was not available.
                    </p>
                  )}

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 13 }}>Series Notes (optional)</label>
                    <textarea className="form-textarea" rows={2} value={seriesNotes} onChange={e => setSeriesNotes(e.target.value)}
                      placeholder="e.g. Weekly therapy sessions, initial assessment phase..." />
                  </div>
                </>
              )}
            </div>

            {seriesPlan && (
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setSeriesProvider(null)}>Cancel</button>
                <button className="btn btn-success" onClick={handleBookSeries} disabled={seriesBooking || includedCount === 0}>
                  {seriesBooking ? 'Booking...' : `Book ${includedCount} Session${includedCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
