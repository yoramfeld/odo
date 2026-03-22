import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login           from './pages/Login';
import DriverDashboard from './pages/DriverDashboard';
import Trip            from './pages/Trip';
import AdminPanel      from './pages/AdminPanel';
import { useAuth }     from './api/auth';

function RequireAuth({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <RequireAuth><DriverDashboard /></RequireAuth>
        } />
        <Route path="/trip" element={
          <RequireAuth><Trip /></RequireAuth>
        } />
        <Route path="/admin" element={
          <RequireAuth role="admin"><AdminPanel /></RequireAuth>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
