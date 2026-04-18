import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { getWeekStart } from '../components/CalendarAvailability';

/**
 * Shared hook for calendar comparison state — used by Calendar page and Manual Scheduling.
 * Handles client/provider loading, timezone defaults, shared navigation, and overlap computation.
 */
export default function useCalendarComparison() {
  const [clients, setClients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [clientData, setClientData] = useState(null);
  const [providerData, setProviderData] = useState(null);
  const [sideBySide, setSideBySide] = useState(true);

  // Shared calendar navigation
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('week');
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  const sharedNav = {
    weekStart, onWeekStartChange: setWeekStart,
    selectedDate, onSelectedDateChange: setSelectedDate,
    monthDate, onMonthDateChange: setMonthDate,
    viewMode, onViewModeChange: setViewMode,
    timezone, onTimezoneChange: setTimezone,
  };

  useEffect(() => {
    api.getClients().then(setClients).catch(() => {});
    api.getProviders().then(setProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedClientId) { setClientData(null); return; }
    api.getClient(selectedClientId).then(data => {
      setClientData(data);
      if (data.timezone && !selectedProviderId) setTimezone(data.timezone);
    }).catch(() => setClientData(null));
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedProviderId) {
      setProviderData(null);
      if (clientData?.timezone) setTimezone(clientData.timezone);
      return;
    }
    api.getProvider(selectedProviderId).then(data => {
      setProviderData(data);
      if (data.timezone) setTimezone(data.timezone);
    }).catch(() => setProviderData(null));
  }, [selectedProviderId]);

  const handleClientChange = (newAvail) => {
    api.updateClient(selectedClientId, { ...clientData, availability: newAvail })
      .then(() => api.getClient(selectedClientId).then(setClientData));
  };

  const handleProviderChange = (newAvail) => {
    api.updateProvider(selectedProviderId, { ...providerData, availability: newAvail })
      .then(() => api.getProvider(selectedProviderId).then(setProviderData));
  };

  const overlaps = useMemo(() => {
    if (!clientData?.availability?.length || !providerData?.availability?.length) return [];
    const results = [];
    for (const cs of clientData.availability) {
      for (const ps of providerData.availability) {
        if (cs.date !== ps.date) continue;
        const overlapStart = cs.start_time > ps.start_time ? cs.start_time : ps.start_time;
        const overlapEnd = cs.end_time < ps.end_time ? cs.end_time : ps.end_time;
        if (overlapStart < overlapEnd)
          results.push({ date: cs.date, start_time: overlapStart, end_time: overlapEnd });
      }
    }
    return results;
  }, [clientData, providerData]);

  const hasBoth = !!clientData && !!providerData;

  const reset = () => {
    setSelectedClientId('');
    setSelectedProviderId('');
    setClientData(null);
    setProviderData(null);
  };

  return {
    clients, providers,
    selectedClientId, setSelectedClientId,
    selectedProviderId, setSelectedProviderId,
    clientData, providerData,
    sideBySide, setSideBySide,
    sharedNav,
    handleClientChange, handleProviderChange,
    overlaps, hasBoth, reset,
  };
}
