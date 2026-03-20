import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../api/auth';

function TripCard({ trip }) {
  const date = new Date(trip.start_time).toLocaleDateString('he-IL');
  const dist = trip.distance_km != null ? `${trip.distance_km} km` : '—';

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-800 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{trip.plate}</span>
          <span className="text-slate-500 text-sm">{trip.make} {trip.model}</span>
          {trip.discrepancy_flag && (
            <span className="text-amber-400 text-xs">⚠️</span>
          )}
        </div>
        <div className="text-slate-400 text-sm truncate">{trip.reason}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-white font-medium">{dist}</div>
        <div className="text-slate-500 text-xs">{date}</div>
      </div>
    </div>
  );
}

export default function DriverDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [trips, setTrips]       = useState([]);
  const [activeTrip, setActive] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get('/trips').then(res => {
      const all = res.data;
      setActive(all.find(t => t.status === 'active') || null);
      setTrips(all.filter(t => t.status === 'completed').slice(0, 10));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-slate-500">Loading…</div>
    </div>
  );

  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Fleet KM Logger</h1>
          <p className="text-slate-400 text-sm">Hello, {user?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="text-blue-400 text-sm font-medium"
            >
              Admin
            </button>
          )}
          <button onClick={logout} className="text-slate-500 text-sm">
            Sign out
          </button>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 space-y-5">

        {/* Active trip banner */}
        {activeTrip && (
          <div className="bg-blue-950 border border-blue-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-400 uppercase tracking-widest mb-1">Active trip</div>
                <div className="text-white font-bold text-lg">
                  {activeTrip.plate} · {activeTrip.make} {activeTrip.model}
                </div>
                <div className="text-blue-300 text-sm mt-0.5">
                  Started at {activeTrip.start_km_confirmed?.toLocaleString()} km
                </div>
                <div className="text-slate-400 text-xs mt-0.5 truncate max-w-[220px]">
                  {activeTrip.reason}
                </div>
              </div>
              <button
                onClick={() => navigate(`/trip/end/${activeTrip.id}`)}
                className="bg-green-600 hover:bg-green-500 text-white font-semibold
                           rounded-xl px-4 py-3 text-sm flex-shrink-0 ml-3"
              >
                End trip
              </button>
            </div>
          </div>
        )}

        {/* Start new trip */}
        {!activeTrip && (
          <button
            onClick={() => navigate('/trip/start')}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold
                       rounded-2xl py-5 text-lg transition-colors"
          >
            + Start New Trip
          </button>
        )}

        {/* Recent trips */}
        {trips.length > 0 && (
          <div>
            <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">Recent trips</h2>
            <div className="bg-slate-800 rounded-2xl px-4">
              {trips.map(t => <TripCard key={t.id} trip={t} />)}
            </div>
          </div>
        )}

        {trips.length === 0 && !activeTrip && (
          <div className="text-center text-slate-600 py-10 text-sm">
            No trips yet — start your first trip above.
          </div>
        )}

      </div>
    </div>
  );
}
