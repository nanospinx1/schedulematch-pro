import { useState, useEffect } from 'react';
import { api } from '../api';
import CalendarAvailability from '../components/CalendarAvailability';

export default function Providers() {
  const [providers, setProviders] = useState([]);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showCalModal, setShowCalModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', specialty: '', notes: '', availability: [] });

  const load = () => api.getProviders().then(setProviders).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', address: '', specialty: '', notes: '', availability: [] });
    setShowInfoModal(true);
  };

  const openEditInfo = async (provider) => {
    const full = await api.getProvider(provider.id);
    setEditing(provider.id);
    setForm({ name: full.name, email: full.email || '', phone: full.phone || '', address: full.address || '', specialty: full.specialty || '', notes: full.notes || '', availability: full.availability || [] });
    setShowInfoModal(true);
  };

  const openAvailability = async (provider) => {
    const full = await api.getProvider(provider.id);
    setEditing(provider.id);
    setForm({ name: full.name, email: full.email || '', phone: full.phone || '', address: full.address || '', specialty: full.specialty || '', notes: full.notes || '', availability: full.availability || [] });
    setShowCalModal(true);
  };

  const handleSaveInfo = async () => {
    if (editing) {
      await api.updateProvider(editing, form);
    } else {
      await api.createProvider(form);
    }
    setShowInfoModal(false);
    load();
  };

  const handleSaveCal = async () => {
    if (editing) {
      await api.updateProvider(editing, form);
    }
    setShowCalModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this provider?')) {
      await api.deleteProvider(id);
      load();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Service Providers</h1>
        <button className="btn btn-primary" onClick={openNew}>+ Add Provider</button>
      </div>

      <div className="card">
        <div className="card-body">
          {providers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏥</div>
              <p>No providers yet. Add your first service provider.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Specialty</th><th>Email</th><th>Phone</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {providers.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.specialty || '—'}</td>
                      <td>{p.email || '—'}</td>
                      <td>{p.phone || '—'}</td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => openAvailability(p)} style={{marginRight: 4}}>📅 Availability</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openEditInfo(p)} style={{marginRight: 4}}>✏️ Edit Info</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Delete</button>
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
              <h2>{editing ? 'Edit Provider Info' : 'Add Provider'}</h2>
              <button className="btn-ghost" onClick={() => setShowInfoModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div className="form-group">
                  <label>Name *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Specialty</label>
                  <input className="form-input" value={form.specialty} onChange={e => setForm({...form, specialty: e.target.value})} placeholder="e.g. Physical Therapy" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
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
              <button className="btn btn-primary" onClick={handleSaveInfo}>{editing ? 'Save Changes' : 'Add Provider'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Availability Calendar Modal (large) */}
      {showCalModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCalModal(false)}>
          <div className="modal modal-fullscreen">
            <div className="modal-header">
              <h2>📅 Availability — {form.name}{form.specialty ? ` (${form.specialty})` : ''}</h2>
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
