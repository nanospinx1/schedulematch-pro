import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Communications() {
  const [logs, setLogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ client_id: '', comm_type: 'phone', content: '' });

  const load = () => {
    api.getCommunications().then(setLogs);
    api.getClients().then(setClients);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.content.trim()) return;
    await api.logCommunication(form);
    setShowModal(false);
    setForm({ client_id: '', comm_type: 'phone', content: '' });
    load();
  };

  const typeIcons = { phone: '📞', email: '📧', message: '💬', other: '📝' };

  return (
    <div>
      <div className="page-header">
        <h1>Communications</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Log Communication</button>
      </div>

      <div className="card">
        <div className="card-body">
          {logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📞</div>
              <p>No communication logs yet.</p>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="comm-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="comm-type">{typeIcons[log.comm_type] || '📝'} {log.comm_type}</span>
                  <span className="comm-date">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                {log.client_name && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Client: {log.client_name}</div>}
                <div style={{ fontSize: 14 }}>{log.content}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>Log Communication</h2>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Client (optional)</label>
                <select className="form-select" value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})}>
                  <option value="">General / No specific client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="form-select" value={form.comm_type} onChange={e => setForm({...form, comm_type: e.target.value})}>
                  <option value="phone">📞 Phone Call</option>
                  <option value="email">📧 Email</option>
                  <option value="message">💬 Message / SMS</option>
                  <option value="other">📝 Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Details</label>
                <textarea className="form-textarea" value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Describe the communication..." rows={4} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save Log</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
