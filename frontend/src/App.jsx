import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Providers from './pages/Providers';
import Matching from './pages/Matching';
import Communications from './pages/Communications';
import Preferences from './pages/Preferences';
import Calendar from './pages/Calendar';

function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/clients', label: 'Clients', icon: '👥' },
    { path: '/providers', label: 'Providers', icon: '🏥' },
    { path: '/calendar', label: 'Calendar', icon: '🗓️' },
    { path: '/matching', label: 'Scheduling', icon: '📅' },
    { path: '/communications', label: 'Communications', icon: '📞' },
    { path: '/preferences', label: 'Preferences', icon: '⚙️' },
  ];

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <span className="brand-icon">📅</span>
        <span className="brand-text">ScheduleMatch Pro</span>
      </div>
      <div className="nav-links">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
      <div className="nav-user">
        <span className="user-name">{user?.name}</span>
        <button onClick={logout} className="btn btn-sm btn-outline">Logout</button>
      </div>
    </nav>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="app">
      {user && <NavBar />}
      <main className={user ? 'main-content' : ''}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
          <Route path="/providers" element={<ProtectedRoute><Providers /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
          <Route path="/matching" element={<ProtectedRoute><Matching /></ProtectedRoute>} />
          <Route path="/communications" element={<ProtectedRoute><Communications /></ProtectedRoute>} />
          <Route path="/preferences" element={<ProtectedRoute><Preferences /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}
