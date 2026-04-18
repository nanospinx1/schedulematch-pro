import { useState } from 'react';
import CalendarAvailability from '../components/CalendarAvailability';
import useCalendarComparison from '../hooks/useCalendarComparison';

export default function Calendar() {
  const cal = useCalendarComparison();
  const {
    clients, providers,
    selectedClientId, setSelectedClientId,
    selectedProviderId, setSelectedProviderId,
    clientData, providerData,
    sideBySide, setSideBySide,
    sharedNav, handleClientChange, handleProviderChange,
    hasBoth,
  } = cal;

  const [modalOpen, setModalOpen] = useState(false);
  const [initSide, setInitSide] = useState(null);

  const openClient = (id) => {
    setSelectedClientId(id);
    setSelectedProviderId('');
    setInitSide('client');
    setModalOpen(true);
  };

  const openProvider = (id) => {
    setSelectedProviderId(id);
    setSelectedClientId('');
    setInitSide('provider');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    cal.reset();
  };

  const [clientSearch, setClientSearch] = useState('');
  const [providerSearch, setProviderSearch] = useState('');

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredProviders = providers.filter(p =>
    p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
    (p.specialty && p.specialty.toLowerCase().includes(providerSearch.toLowerCase()))
  );

  return (
    <div>
      <div className="page-header">
        <h2>📅 Calendar</h2>
        <p className="page-subtitle">Click a client or provider to open their calendar</p>
      </div>

      <div className="cal-tab-lists">
        <div className="cal-tab-list">
          <h3>👤 Clients</h3>
          <input
            className="cal-tab-search"
            type="text"
            placeholder="Search clients..."
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
          <div className="cal-tab-items">
            {filteredClients.map(c => (
              <button key={c.id} className="cal-tab-item" onClick={() => openClient(c.id)}>
                <span className="cal-tab-item-name">{c.name}</span>
                <span className="cal-tab-item-arrow">→</span>
              </button>
            ))}
            {filteredClients.length === 0 && <p className="cal-tab-empty">No clients found</p>}
          </div>
        </div>
        <div className="cal-tab-list">
          <h3>🏥 Providers</h3>
          <input
            className="cal-tab-search"
            type="text"
            placeholder="Search providers..."
            value={providerSearch}
            onChange={e => setProviderSearch(e.target.value)}
          />
          <div className="cal-tab-items">
            {filteredProviders.map(p => (
              <button key={p.id} className="cal-tab-item" onClick={() => openProvider(p.id)}>
                <span className="cal-tab-item-name">{p.name}{p.specialty ? ` — ${p.specialty}` : ''}</span>
                <span className="cal-tab-item-arrow">→</span>
              </button>
            ))}
            {filteredProviders.length === 0 && <p className="cal-tab-empty">No providers found</p>}
          </div>
        </div>
      </div>

      {/* Fullscreen Calendar Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal modal-fullscreen">
            <div className="modal-header">
              <h3>📅 Calendar Comparison</h3>
              <button className="btn-ghost" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {/* Selectors row inside modal */}
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

              {/* Name legend */}
              <div className="cal-merged-legend">
                {clientData && <span className="cal-merged-legend-item cal-merged-legend-client">■ 👤 {clientData.name}</span>}
                {providerData && <span className="cal-merged-legend-item cal-merged-legend-provider">■ 🏥 {providerData.name}</span>}
              </div>

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
                <CalendarAvailability
                  {...sharedNav}
                  availability={(clientData || providerData)?.availability || []}
                  onChange={clientData ? handleClientChange : handleProviderChange}
                  slotClassName={providerData && !clientData ? 'cal-slot-provider' : undefined}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
