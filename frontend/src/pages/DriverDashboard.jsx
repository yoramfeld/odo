import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../api/auth';

function fmtDuration(start, end) {
  if (!start || !end) return null;
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins} דקות`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function fmtDateTime(start) {
  const d = new Date(start);
  const date = d.toLocaleDateString('he-IL');
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function TripCard({ trip }) {
  const p2 = n => String(n).padStart(2, '0');
  const hhmm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

  const start = new Date(trip.start_time);
  const end   = trip.end_time ? new Date(trip.end_time) : null;
  const date  = start.toLocaleDateString('he-IL');
  const dur   = fmtDuration(trip.start_time, trip.end_time);

  const timeStr = end
    ? `${hhmm(start)}→${hhmm(end)}${dur ? ` (${dur})` : ''}`
    : hhmm(start);

  const kmStr = trip.start_km_confirmed != null
    ? `${trip.start_km_confirmed.toLocaleString()}→${trip.end_km_confirmed != null ? trip.end_km_confirmed.toLocaleString() : '?'}${trip.distance_km != null ? ` (${trip.distance_km} ק״מ)` : ''}`
    : null;

  const locStr = (trip.start_location || trip.end_location)
    ? [trip.start_location, trip.end_location].filter(Boolean).join('→')
    : null;

  return (
    <div className="py-2.5 border-b border-slate-800 last:border-0 space-y-1">
      {/* Row 1: plate · date · times · reason */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-semibold text-white text-sm flex-shrink-0">{trip.plate}</span>
        {trip.discrepancy_flag && <span className="text-amber-400 text-xs flex-shrink-0">⚠️</span>}
        <span className="text-slate-500 text-xs flex-shrink-0">{date}</span>
        <span className="text-slate-400 text-xs flex-shrink-0">{timeStr}</span>
        <span className="text-slate-300 text-xs truncate min-w-0">{trip.reason}</span>
      </div>

      {/* Row 2: KM range · locations */}
      <div className="flex items-baseline gap-3 text-xs min-w-0">
        {kmStr && <span className="text-slate-400 flex-shrink-0">{kmStr}</span>}
        {locStr && <span className="text-slate-500 truncate min-w-0">{locStr}</span>}
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
    <div dir="rtl" className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">יומן נסיעות</h1>
          <p className="text-slate-400 text-sm">שלום, {user?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="text-blue-400 text-sm font-medium"
            >
              ניהול
            </button>
          )}
          <button onClick={logout} className="text-slate-500 text-sm">
            יציאה
          </button>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 space-y-5">

        {/* Active trip banner */}
        {activeTrip && (
          <div className="bg-blue-950 border border-blue-800 rounded-2xl p-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-blue-400 uppercase tracking-widest">נסיעה פעילה</div>
                <button
                  onClick={() => navigate('/trip')}
                  className="bg-green-600 hover:bg-green-500 text-white font-semibold
                             rounded-xl px-4 py-2 text-sm flex-shrink-0"
                >
                  סיים נסיעה
                </button>
              </div>
              <div className="text-white font-bold text-lg">
                {activeTrip.plate} {activeTrip.make} {activeTrip.model}
              </div>
              <div className="text-blue-300 text-sm mt-0.5">
                {(() => {
                  const d = new Date(activeTrip.start_time);
                  const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                  return `התחיל ב ${hhmm} עם ${activeTrip.start_km_confirmed?.toLocaleString()} ק״מ במונה`;
                })()}
              </div>
              <div className="text-slate-400 text-xs mt-0.5">
                {activeTrip.reason}
              </div>
            </div>
          </div>
        )}

        {/* Start new trip */}
        {!activeTrip && (
          <button
            onClick={() => navigate('/trip')}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold
                       rounded-2xl py-5 text-lg transition-colors"
          >
            + התחל נסיעה חדשה
          </button>
        )}

        {/* Recent trips */}
        {trips.length > 0 && (
          <div>
            <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">נסיעות אחרונות</h2>
            <div className="bg-slate-800 rounded-2xl px-4">
              {trips.map(t => <TripCard key={t.id} trip={t} />)}
            </div>
          </div>
        )}

        {trips.length === 0 && !activeTrip && (
          <div className="text-center text-slate-600 py-10 text-sm">
            אין נסיעות עדיין — התחל את נסיעתך הראשונה למעלה.
          </div>
        )}

      </div>
    </div>
  );
}
