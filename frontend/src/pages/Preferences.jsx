import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Preferences() {
  const [prefs, setPrefs] = useState([]);
  const [text, setText] = useState('');

  const load = () => api.getPreferences().then(setPrefs).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!text.trim()) return;
    await api.addPreference(text.trim());
    setText('');
    load();
  };

  const handleDelete = async (id) => {
    await api.deletePreference(id);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Scheduling Preferences & Constraints</h1>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h2>Add a Preference or Constraint</h2>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>
            Describe your scheduling preferences or constraints in plain language. These will be used to guide the matching algorithm.
          </p>
          <div className="form-group">
            <textarea
              className="form-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder='Examples:&#10;• "Prefer morning appointments for elderly clients"&#10;• "Client John should only see Dr. Smith"&#10;• "No sessions on Fridays"&#10;• "Keep travel distance under 30 minutes between client and provider"&#10;• "Provider Jane needs 30-min buffer between sessions"'
              rows={5}
            />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={!text.trim()}>
            💾 Save Preference
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Your Preferences</h2>
        </div>
        <div className="card-body">
          {prefs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⚙️</div>
              <p>No preferences set yet. Add your first scheduling preference above.</p>
            </div>
          ) : (
            prefs.map(p => (
              <div key={p.id} className="pref-card">
                <div className="pref-text">{p.preference_text}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
