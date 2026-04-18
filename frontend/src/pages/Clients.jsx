import { useState, useEffect } from 'react';
import { api } from '../api';
import CalendarAvailability from '../components/CalendarAvailability';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showCalModal, setShowCalModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '', availability: [] });

  const load = () => api.getClients().then(setClients).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', address: '', notes: '', availability: [] });
    setShowInfoModal(true);
  };

  const openEditInfo = async (client) => {
    const full = await api.getClient(client.id);
    setEditing(client.id);
    setForm({ name: full.name, email: full.email || '', phone: full.phone || '', address: full.address || '', notes: full.notes || '', availability: full.availability || [] });
    setShowInfoModal(true);
  };

  const openAvailability = async (client) => {
    const full = await api.getClient(client.id);
    setEditing(client.id);
    setForm({ name: full.name, email: full.email || '', phone: full.phone || '', address: full.address || '', notes: full.notes || '', availability: full.availability || [] });
    setShowCalModal(true);
  };

  const handleSaveInfo = async () => {
    if (editing) {
      await api.updateClient(editing, form);
    } else {
      await api.createClient(form);
    }
    setShowInfoModal(false);
    load();
  };

  const handleSaveCal = async () => {
    if (editing) {
      await api.updateClient(editing, form);
    }
    setShowCalModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this client?')) {
      await api.deleteClient(id);
      load();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Clients</h1>
        <button className="btn btn-primary" onClick={openNew}>+ Add Client</button>
      </div>

      <div className="card">
        <div className="card-body">
          {clients.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <p>No clients yet. Add your first client to get started.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Phone</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.email || '—'}</td>
                      <td>{c.phone || '—'}</td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => openAvailability(c)} style={{marginRight: 4}}>📅 Availability</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openEditInfo(c)} style={{marginRight: 4}}>✏️ Edit Info</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Info Modal (compact) */}
      {showInfoModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowInfoModal(false)}>
          <div className="modal modal-compact">
            <div className="modal-header">
              <h2>{editing ? 'Edit Client Info' : 'Add Client'}</h2>
              <button className="btn-ghost" onClick={() => setShowInfoModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div className="form-group">
                  <label>Name *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input className="form-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full address" />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowInfoModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveInfo}>{editing ? 'Save Changes' : 'Add Client'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Availability Calendar Modal (large) */}
      {showCalModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCalModal(false)}>
          <div className="modal modal-fullscreen">
            <div className="modal-header">
              <h2>📅 Availability — {form.name}</h2>
              <button className="btn-ghost" onClick={() => setShowCalModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <CalendarAvailability availability={form.availability} onChange={a => setForm({...form, availability: a})} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCalModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveCal}>Save Availability</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
