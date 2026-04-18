import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import CalendarAvailability from '../components/CalendarAvailability';

export default function Calendar() {
  const [clients, setClients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [clientData, setClientData] = useState(null);
  const [providerData, setProviderData] = useState(null);

  useEffect(() => {
    api.getClients().then(setClients).catch(() => {});
    api.getProviders().then(setProviders).catch(() => {});
  }, []);

  // Load full client data when selected
  useEffect(() => {
    if (!selectedClientId) { setClientData(null); return; }
    api.getClient(selectedClientId).then(setClientData).catch(() => setClientData(null));
  }, [selectedClientId]);

  // Load full provider data when selected
  useEffect(() => {
    if (!selectedProviderId) { setProviderData(null); return; }
    api.getProvider(selectedProviderId).then(setProviderData).catch(() => setProviderData(null));
  }, [selectedProviderId]);

  // Find overlapping time slots between client and provider
  const overlaps = useMemo(() => {
    if (!clientData?.availability?.length || !providerData?.availability?.length) return [];
    const results = [];
    for (const cs of clientData.availability) {
      for (const ps of providerData.availability) {
        if (cs.date !== ps.date) continue;
        const overlapStart = cs.start_time > ps.start_time ? cs.start_time : ps.start_time;
        const overlapEnd = cs.end_time < ps.end_time ? cs.end_time : ps.end_time;
        if (overlapStart < overlapEnd) {
          results.push({ date: cs.date, start_time: overlapStart, end_time: overlapEnd });
        }
      }
    }
    return results;
  }, [clientData, providerData]);

  return (
    <div>
      <div className="page-header">
        <h2>📅 Calendar</h2>
        <p className="page-subtitle">Compare client and provider availability side by side</p>
      </div>

      <div className="cal-page-selectors">
        <div className="cal-page-selector">
          <label>Client</label>
          <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
            <option value="">— Select a client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="cal-page-selector">
          <label>Provider</label>
          <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)}>
            <option value="">— Select a provider —</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` (${p.specialty})` : ''}</option>)}
          </select>
        </div>
        {overlaps.length > 0 && (
          <div className="cal-page-overlap-badge">
            ✅ {overlaps.length} overlapping slot{overlaps.length !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {!selectedClientId && !selectedProviderId ? (
        <div className="cal-page-empty">
          <span className="cal-page-empty-icon">📅</span>
          <p>Select a client and provider above to compare their availability</p>
        </div>
      ) : (
        <div className="cal-page-grid">
          <div className="cal-page-panel">
            <div className="cal-page-panel-header cal-page-panel-client">
              <span>👤 {clientData?.name || 'Select a Client'}</span>
              {clientData && <span className="cal-page-panel-count">{clientData.availability?.length || 0} slots</span>}
            </div>
            {clientData ? (
              <CalendarAvailability
                availability={clientData.availability || []}
                onChange={(newAvail) => {
                  api.updateClient(selectedClientId, { ...clientData, availability: newAvail })
                    .then(() => api.getClient(selectedClientId).then(setClientData));
                }}
              />
            ) : (
              <div className="cal-page-panel-empty">Select a client to view their calendar</div>
            )}
          </div>
          <div className="cal-page-panel">
            <div className="cal-page-panel-header cal-page-panel-provider">
              <span>🏥 {providerData?.name || 'Select a Provider'}</span>
              {providerData && <span className="cal-page-panel-count">{providerData.availability?.length || 0} slots</span>}
            </div>
            {providerData ? (
              <CalendarAvailability
                availability={providerData.availability || []}
                onChange={(newAvail) => {
                  api.updateProvider(selectedProviderId, { ...providerData, availability: newAvail })
                    .then(() => api.getProvider(selectedProviderId).then(setProviderData));
                }}
              />
            ) : (
              <div className="cal-page-panel-empty">Select a provider to view their calendar</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
