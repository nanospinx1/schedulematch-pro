import { useState } from 'react';
import { api } from '../api';
import CalendarAvailability from './CalendarAvailability';
import useCalendarComparison from '../hooks/useCalendarComparison';

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

export default function ManualSchedulingModal({ onClose, onBooked }) {
  const cal = useCalendarComparison();
  const {
    clients, providers,
    selectedClientId, setSelectedClientId,
    selectedProviderId, setSelectedProviderId,
    clientData, providerData,
    sideBySide, setSideBySide,
    sharedNav, handleClientChange, handleProviderChange,
    overlaps, hasBoth,
  } = cal;

  // Booking state
  const [selectedOverlap, setSelectedOverlap] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [conflictError, setConflictError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const handleOverlapClick = (overlap) => {
    setSelectedOverlap(overlap);
    setConflictError(null);
    setBookingNotes('');
  };

  const handleBook = async (force = false) => {
    if (!selectedOverlap || !clientData || !providerData) return;
    try {
      const body = {
        client_id: clientData.id,
        provider_id: providerData.id,
        session_date: selectedOverlap.date,
        start_time: selectedOverlap.start_time,
        end_time: selectedOverlap.end_time,
        notes: bookingNotes || null,
      };
      if (force) body.force = true;
      await api.createMatch(body);
      setSelectedOverlap(null);
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
          <h3>🗓 Manual Scheduling</h3>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {bookingSuccess && (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '8px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#065f46' }}>✅ Session booked successfully!</span>
              <button className="btn btn-sm btn-outline" onClick={() => setBookingSuccess(false)}>Dismiss</button>
            </div>
          )}

          {/* Selectors */}
          <div className="cal-modal-selectors">
            <div className="cal-modal-sel">
              <label>👤 Client</label>
              <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                <option value="">— Select —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="cal-modal-sel">
              <label>🏥 Provider</label>
              <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)}>
                <option value="">— Select —</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` (${p.specialty})` : ''}</option>)}
              </select>
            </div>
            {hasBoth && (
              <button
                type="button"
                className={`cal-layout-toggle ${sideBySide ? 'cal-layout-toggle-active' : ''}`}
                onClick={() => setSideBySide(!sideBySide)}
                title={sideBySide ? 'Switch to merged view' : 'Switch to side-by-side view'}
              >
                {sideBySide ? '⊞ Side by Side' : '⊟ Merged'}
              </button>
            )}
          </div>

          {/* Legend */}
          <div className="cal-merged-legend">
            {clientData && <span className="cal-merged-legend-item cal-merged-legend-client">■ 👤 {clientData.name}</span>}
            {providerData && <span className="cal-merged-legend-item cal-merged-legend-provider">■ 🏥 {providerData.name}</span>}
            {overlaps.length > 0 && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>• {overlaps.length} overlap{overlaps.length !== 1 ? 's' : ''} found — click below to book</span>}
          </div>

          {/* Overlap booking panel */}
          {overlaps.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 12, maxHeight: 160, overflowY: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>📅 Available Overlapping Slots — Click to Book</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {overlaps.map((o, i) => (
                  <button key={i} className="btn btn-sm"
                    onClick={() => handleOverlapClick(o)}
                    style={{
                      background: selectedOverlap === o ? '#059669' : '#dcfce7',
                      color: selectedOverlap === o ? '#fff' : '#065f46',
                      border: '1px solid #86efac', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer'
                    }}>
                    {formatDate(o.date)} {formatTime12(o.start_time)}–{formatTime12(o.end_time)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Calendar */}
          {hasBoth ? (
            sideBySide ? (
              <div className="cal-modal-dual">
                <CalendarAvailability {...sharedNav} hideGrid availability={[]} onChange={() => {}} />
                <div className="cal-modal-grids">
                  <div className="cal-modal-grid-panel">
                    <CalendarAvailability {...sharedNav} hideToolbar availability={clientData.availability || []} onChange={handleClientChange} />
                  </div>
                  <div className="cal-modal-grid-panel">
                    <CalendarAvailability {...sharedNav} hideToolbar slotClassName="cal-slot-provider" availability={providerData.availability || []} onChange={handleProviderChange} />
                  </div>
                </div>
              </div>
            ) : (
              <CalendarAvailability
                {...sharedNav}
                availability={clientData.availability || []}
                onChange={handleClientChange}
                overlaySlots={providerData.availability || []}
                onOverlayChange={handleProviderChange}
              />
            )
          ) : (
            clientData || providerData ? (
              <CalendarAvailability
                {...sharedNav}
                availability={(clientData || providerData)?.availability || []}
                onChange={clientData ? handleClientChange : handleProviderChange}
                slotClassName={providerData && !clientData ? 'cal-slot-provider' : undefined}
              />
            ) : (
              <div className="empty-state" style={{ marginTop: 40 }}>
                <div className="empty-icon">📅</div>
                <p>Select a client and provider to compare their calendars and schedule a session.</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Booking confirmation */}
      {selectedOverlap && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => e.target === e.currentTarget && setSelectedOverlap(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>📅 Schedule Session</h3>
              <button className="btn-ghost" onClick={() => setSelectedOverlap(null)}>✕</button>
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
                <strong>{clientData?.name}</strong>
                <span style={{ color: '#6b7280' }}>Provider:</span>
                <strong>{providerData?.name}</strong>
                <span style={{ color: '#6b7280' }}>Date:</span>
                <strong>{formatDate(selectedOverlap.date)}</strong>
                <span style={{ color: '#6b7280' }}>Time:</span>
                <strong>{formatTime12(selectedOverlap.start_time)} – {formatTime12(selectedOverlap.end_time)}</strong>
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea className="form-textarea" rows={2} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Session notes..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedOverlap(null)}>Cancel</button>
              <button className="btn btn-success" onClick={() => handleBook()}>✅ Confirm & Book</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
