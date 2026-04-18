const API = '/api';

function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, { headers: getHeaders(), ...options });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email, password, name) => request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  me: () => request('/auth/me'),

  // Clients
  getClients: () => request('/clients'),
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),

  // Providers
  getProviders: () => request('/providers'),
  getProvider: (id) => request(`/providers/${id}`),
  createProvider: (data) => request('/providers', { method: 'POST', body: JSON.stringify(data) }),
  updateProvider: (id, data) => request(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProvider: (id) => request(`/providers/${id}`, { method: 'DELETE' }),

  // Matching
  getSuggestions: (clientId) => request(`/matching/suggestions/${clientId}`),
  realtimeSuggest: (data) => request('/matching/realtime-suggest', { method: 'POST', body: JSON.stringify(data) }),
  getMatches: () => request('/matching'),
  createMatch: (data) => request('/matching', { method: 'POST', body: JSON.stringify(data) }),
  previewRecurring: (data) => request('/matching/recurring/preview', { method: 'POST', body: JSON.stringify(data) }),
  smartSuggestRecurring: (data) => request('/matching/recurring/smart-suggest', { method: 'POST', body: JSON.stringify(data) }),
  createRecurring: (data) => request('/matching/recurring', { method: 'POST', body: JSON.stringify(data) }),
  deleteRecurrenceGroup: (groupId) => request(`/matching/recurring/${groupId}`, { method: 'DELETE' }),
  updateMatch: (id, data) => request(`/matching/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMatch: (id) => request(`/matching/${id}`, { method: 'DELETE' }),

  // Communications
  getCommunications: () => request('/communications'),
  logCommunication: (data) => request('/communications', { method: 'POST', body: JSON.stringify(data) }),

  // Preferences
  getPreferences: () => request('/preferences'),
  addPreference: (text) => request('/preferences', { method: 'POST', body: JSON.stringify({ preference_text: text }) }),
  deletePreference: (id) => request(`/preferences/${id}`, { method: 'DELETE' }),
};
