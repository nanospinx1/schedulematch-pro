import { useState, useEffect } from 'react';
import { api } from '../api';
import StandardSchedulingModal from '../components/StandardSchedulingModal';
import PhoneSchedulingModal from '../components/PhoneSchedulingModal';
import ManualSchedulingModal from '../components/ManualSchedulingModal';

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

const STATUS_LABELS = {
  pending: '⏳ Pending',
  confirmed: '✅ Confirmed',
  completed: '✔ Completed',
  cancelled: '❌ Cancelled',
  no_show: '🚫 No Show',
};

export default function Matching() {
  const [matches, setMatches] = useState([]);
  const [activeMode, setActiveMode] = useState(null); // 'standard' | 'phone' | 'manual'

  const loadMatches = () => { api.getMatches().then(setMatches); };
  useEffect(() => { loadMatches(); }, []);

  const handleStatusChange = async (id, status) => {
    await api.updateMatch(id, { status });
    loadMatches();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this session?')) {
      await api.deleteMatch(id);
      loadMatches();
    }
  };

  const closeMode = () => {
    setActiveMode(null);
    loadMatches();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Scheduling</h1>
      </div>

      {/* Mode cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 28 }}>
        <button className="scheduling-mode-card" onClick={() => setActiveMode('standard')}>
          <svg className="scheduling-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 14l2 2 4-4" />
          </svg>
          <div className="scheduling-mode-title">Auto-Match</div>
          <div className="scheduling-mode-desc">Client's schedule is already in the system. Find the best matching providers automatically.</div>
        </button>
        <button className="scheduling-mode-card" onClick={() => setActiveMode('phone')}>
          <svg className="scheduling-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
          </svg>
          <div className="scheduling-mode-title">Phone Intake</div>
          <div className="scheduling-mode-desc">Client is on the phone. Enter their preferences in real-time and find available providers.</div>
        </button>
        <button className="scheduling-mode-card" onClick={() => setActiveMode('manual')}>
          <svg className="scheduling-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
          </svg>
          <div className="scheduling-mode-title">Calendar View</div>
          <div className="scheduling-mode-desc">Compare client and provider calendars visually. Click overlapping slots to schedule.</div>
        </button>
      </div>

      {/* Scheduled sessions */}
      <div className="card">
        <div className="card-header">
          <h2>Scheduled Sessions</h2>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{matches.length} session{matches.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="card-body">
          {matches.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <p>No sessions scheduled yet. Use one of the modes above to get started.</p>
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
                          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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

      {/* Mode modals */}
      {activeMode === 'standard' && <StandardSchedulingModal onClose={closeMode} onBooked={loadMatches} />}
      {activeMode === 'phone' && <PhoneSchedulingModal onClose={closeMode} onBooked={loadMatches} />}
      {activeMode === 'manual' && <ManualSchedulingModal onClose={closeMode} onBooked={loadMatches} />}
    </div>
  );
}
