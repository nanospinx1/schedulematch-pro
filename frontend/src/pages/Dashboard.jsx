import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState({ clients: 0, providers: 0, matches: 0, pending: 0 });
  const [recentMatches, setRecentMatches] = useState([]);

  useEffect(() => {
    Promise.all([api.getClients(), api.getProviders(), api.getMatches()]).then(([clients, providers, matches]) => {
      setStats({
        clients: clients.length,
        providers: providers.length,
        matches: matches.length,
        pending: matches.filter(m => m.status === 'pending').length
      });
      setRecentMatches(matches.slice(0, 5));
    }).catch(() => {});
  }, []);

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{stats.clients}</div>
          <div className="stat-label">Clients</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏥</div>
          <div className="stat-value">{stats.providers}</div>
          <div className="stat-label">Service Providers</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-value">{stats.matches}</div>
          <div className="stat-label">Scheduled Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Pending Confirmations</div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-header">
            <h2>Recent Sessions</h2>
            <Link to="/matching" className="btn btn-sm btn-outline">View All</Link>
          </div>
          <div className="card-body">
            {recentMatches.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <p>No sessions scheduled yet</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Client</th><th>Provider</th><th>Date</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {recentMatches.map(m => (
                      <tr key={m.id}>
                        <td>{m.client_name}</td>
                        <td>{m.provider_name}</td>
                        <td>{m.session_date} {m.start_time}</td>
                        <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link to="/clients" className="btn btn-outline" style={{ justifyContent: 'flex-start' }}>👥 Add a New Client</Link>
            <Link to="/providers" className="btn btn-outline" style={{ justifyContent: 'flex-start' }}>🏥 Add a Service Provider</Link>
            <Link to="/matching" className="btn btn-primary" style={{ justifyContent: 'flex-start' }}>📅 Schedule a Session</Link>
            <Link to="/preferences" className="btn btn-outline" style={{ justifyContent: 'flex-start' }}>⚙️ Set Scheduling Preferences</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
