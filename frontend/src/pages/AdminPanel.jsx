import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../api/auth';

// ── Shared ─────────────────────────────────────────────────────────────────

function SectionCard({ children }) {
  return <div className="bg-slate-800 rounded-2xl overflow-hidden">{children}</div>;
}

function Badge({ children, color = 'slate' }) {
  const colors = {
    green:  'bg-green-950 text-green-400 border-green-800',
    amber:  'bg-amber-950 text-amber-400 border-amber-800',
    red:    'bg-red-950   text-red-400   border-red-800',
    blue:   'bg-blue-950  text-blue-400  border-blue-800',
    slate:  'bg-slate-700 text-slate-300 border-slate-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${colors[color]}`}>
      {children}
    </span>
  );
}

function FieldRow({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5
                 text-white text-sm focus:outline-none focus:border-blue-500"
    />
  );
}

// ── Trips tab ──────────────────────────────────────────────────────────────

function TripsTab({ cars, drivers }) {
  const [trips, setTrips]   = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', carId: '', driverId: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTrips(); }, []);

  async function loadTrips() {
    setLoading(true);
    const { data } = await api.get('/trips');
    setTrips(data);
    setLoading(false);
  }

  const filtered = trips.filter(t => {
    if (filters.carId    && String(t.car_id)    !== filters.carId)    return false;
    if (filters.driverId && String(t.driver_id) !== filters.driverId) return false;
    if (filters.from     && new Date(t.start_time) < new Date(filters.from)) return false;
    if (filters.to       && new Date(t.start_time) > new Date(filters.to + 'T23:59:59')) return false;
    return true;
  });

  async function exportXlsx() {
    const params = new URLSearchParams();
    if (filters.from)     params.set('from', filters.from);
    if (filters.to)       params.set('to', filters.to);
    if (filters.carId)    params.set('carId', filters.carId);
    if (filters.driverId) params.set('driverId', filters.driverId);
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/export/trips?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fleet-trips-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function set(key, val) { setFilters(f => ({ ...f, [key]: val })); }

  return (
    <div className="space-y-4">

      {/* Filters */}
      <SectionCard>
        <div className="p-4 grid grid-cols-2 gap-3">
          <FieldRow label="From">
            <Input type="date" value={filters.from} onChange={e => set('from', e.target.value)} />
          </FieldRow>
          <FieldRow label="To">
            <Input type="date" value={filters.to} onChange={e => set('to', e.target.value)} />
          </FieldRow>
          <FieldRow label="Car">
            <select value={filters.carId} onChange={e => set('carId', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5
                         text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="">All cars</option>
              {cars.map(c => <option key={c.id} value={c.id}>{c.plate}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Driver">
            <select value={filters.driverId} onChange={e => set('driverId', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5
                         text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="">All drivers</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </FieldRow>
        </div>
        <div className="px-4 pb-4">
          <button onClick={exportXlsx}
            className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold
                       rounded-xl py-2.5 text-sm transition-colors">
            ⬇ Export to Excel
          </button>
        </div>
      </SectionCard>

      {/* Table */}
      {loading ? <div className="text-slate-500 text-sm text-center py-6">Loading…</div> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-8">No trips found</div>
          ) : filtered.map(t => (
            <div key={t.id} className="px-4 py-3 border-b border-slate-700 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{t.plate}</span>
                    <span className="text-slate-400 text-xs">{t.driver_name}</span>
                    {t.discrepancy_flag && <Badge color="amber">⚠ {t.discrepancy_delta} km gap</Badge>}
                    {t.speed_flag       && <Badge color="red">🏎 {t.avg_speed_kmh} km/h</Badge>}
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5 truncate">{t.reason}</div>
                  <div className="text-slate-600 text-xs mt-0.5">
                    {new Date(t.start_time).toLocaleDateString('he-IL')}
                    {t.notes && <span className="ml-2 italic">{t.notes}</span>}
                  </div>
                  {(t.start_location || t.end_location) && (
                    <div className="text-slate-600 text-xs mt-0.5 truncate">
                      📍 {t.start_location || '—'}{t.start_location_manual ? ' (ידני)' : ''}
                      {t.end_location ? ` → ${t.end_location}${t.end_location_manual ? ' (ידני)' : ''}` : ''}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {t.distance_km != null
                    ? <div className="text-white font-bold text-sm">{t.distance_km} km</div>
                    : <Badge color="blue">active</Badge>}
                  <div className="text-slate-500 text-xs mt-0.5">
                    {t.start_km_confirmed?.toLocaleString()} → {t.end_km_confirmed?.toLocaleString() ?? '…'}
                  </div>
                  {t.start_time && t.end_time && (() => {
                    const mins = Math.round((new Date(t.end_time) - new Date(t.start_time)) / 60000);
                    const h = Math.floor(mins / 60), m = mins % 60;
                    return <div className="text-slate-500 text-xs">{h}:{String(m).padStart(2,'0')}</div>;
                  })()}
                </div>
              </div>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

// ── Cars tab ───────────────────────────────────────────────────────────────

function CarsTab() {
  const [cars, setCars]       = useState([]);
  const [editing, setEditing] = useState(null); // car id or 'new'
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { loadCars(); }, []);
  async function loadCars() {
    const { data } = await api.get('/cars');
    setCars(data);
  }

  function openNew() {
    setForm({ plate: '', make: '', model: '', current_km: '' });
    setEditing('new');
    setError('');
  }
  function openEdit(car) {
    setForm({ ...car });
    setEditing(car.id);
    setError('');
  }
  function cancel() { setEditing(null); setError(''); }

  async function save() {
    setSaving(true); setError('');
    try {
      if (editing === 'new') {
        await api.post('/cars', form);
      } else {
        await api.patch(`/cars/${editing}`, form);
      }
      await loadCars();
      setEditing(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <div className="space-y-4">
      <button onClick={openNew}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold
                   rounded-xl py-3 text-sm transition-colors">
        + Add Vehicle
      </button>

      {/* Form */}
      {editing && (
        <SectionCard>
          <div className="p-4 space-y-3">
            <h3 className="text-white font-semibold text-sm">
              {editing === 'new' ? 'New Vehicle' : 'Edit Vehicle'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Plate">
                <Input
                  value={form.plate || ''}
                  onChange={e => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 8);
                    const p = d.length > 5 ? `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`
                            : d.length > 3 ? `${d.slice(0,3)}-${d.slice(3)}`
                            : d;
                    setF('plate', p);
                  }}
                  placeholder="123-45-678"
                  inputMode="numeric"
                />
              </FieldRow>
              <FieldRow label="Make">
                <Input value={form.make || ''} onChange={e => setF('make', e.target.value)} placeholder="Toyota" />
              </FieldRow>
              <FieldRow label="Model">
                <Input value={form.model || ''} onChange={e => setF('model', e.target.value)} placeholder="Corolla" />
              </FieldRow>
              <FieldRow label="Current KM">
                <Input type="number" value={form.current_km || ''} onChange={e => setF('current_km', e.target.value)} />
              </FieldRow>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={cancel} className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-2.5 text-sm">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-sm">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard>
        {cars.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">No vehicles yet</div>
        ) : cars.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 last:border-0">
            <div className="flex-1">
              <div className="text-white font-semibold text-sm">{c.plate}</div>
              <div className="text-slate-400 text-xs">{c.make} {c.model}</div>
              <div className="text-slate-500 text-xs">{c.current_km?.toLocaleString()} km</div>
            </div>
            <button onClick={() => openEdit(c)}
              className="text-blue-400 text-sm px-3 py-1.5 rounded-lg bg-blue-950">
              Edit
            </button>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Drivers tab ────────────────────────────────────────────────────────────

function DriversTab() {
  const [drivers, setDrivers] = useState([]);
  const [editing, setEditing] = useState(null); // driver id or 'new'
  const [form, setForm]       = useState({ name: '', phone: '', idNumber: '', role: 'driver' });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { loadDrivers(); }, []);
  async function loadDrivers() {
    const { data } = await api.get('/drivers');
    setDrivers(data);
  }

  function openNew() {
    setForm({ name: '', phone: '', idNumber: '', role: 'driver' });
    setEditing('new');
    setError('');
  }
  function openEdit(d) {
    setForm({ name: d.name, phone: d.phone, idNumber: '', role: d.role });
    setEditing(d.id);
    setError('');
  }
  function cancel() { setEditing(null); setError(''); }

  async function save() {
    setSaving(true); setError('');
    try {
      if (editing === 'new') {
        if (!form.idNumber) { setError('National ID is required'); setSaving(false); return; }
        await api.post('/drivers', form);
      } else {
        await api.patch(`/drivers/${editing}`, form);
      }
      await loadDrivers();
      setEditing(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id, active) {
    await api.patch(`/drivers/${id}/active`, { active });
    loadDrivers();
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <div className="space-y-4">
      <button onClick={openNew}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold
                   rounded-xl py-3 text-sm transition-colors">
        + Add Driver
      </button>

      {editing && (
        <SectionCard>
          <div className="p-4 space-y-3">
            <h3 className="text-white font-semibold text-sm">
              {editing === 'new' ? 'New Driver' : 'Edit Driver'}
            </h3>
            <FieldRow label="Full name">
              <Input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Avi Cohen" />
            </FieldRow>
            <FieldRow label="Phone">
              <Input type="tel" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="05X-XXXXXXX" />
            </FieldRow>
            <FieldRow label={editing === 'new' ? 'National ID' : 'New National ID (leave blank to keep)'}>
              <Input type="password" inputMode="numeric" value={form.idNumber}
                onChange={e => setF('idNumber', e.target.value)} placeholder="••••••••" />
            </FieldRow>
            <FieldRow label="Role">
              <select value={form.role} onChange={e => setF('role', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5
                           text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="driver">Driver</option>
                <option value="admin">Admin</option>
              </select>
            </FieldRow>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <p className="text-slate-600 text-xs">ID number is hashed immediately — never stored in plain text.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={cancel}
                className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-2.5 text-sm">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-sm">
                {saving ? 'Saving…' : editing === 'new' ? 'Add Driver' : 'Save'}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard>
        {drivers.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">No drivers yet</div>
        ) : drivers.map(d => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">{d.name}</span>
                <Badge color={d.role === 'admin' ? 'blue' : 'slate'}>{d.role}</Badge>
                {!d.active && <Badge color="red">inactive</Badge>}
              </div>
              <div className="text-slate-400 text-xs">{d.phone}</div>
              <div className="text-slate-600 text-xs">
                {d.total_trips} trip{d.total_trips !== 1 ? 's' : ''}
                {d.last_login_at && ` · last login ${new Date(d.last_login_at).toLocaleDateString('he-IL')}`}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => openEdit(d)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-950 text-blue-400">
                Edit
              </button>
              <button
                onClick={() => toggleActive(d.id, !d.active)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                  d.active ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'
                }`}
              >
                {d.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Errors tab ─────────────────────────────────────────────────────────────

function ErrorsTab() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get('/errors').then(r => setErrors(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function clearAll() {
    if (!window.confirm('Clear all error logs?')) return;
    await api.delete('/errors');
    setErrors([]);
  }

  if (loading) return <div className="text-slate-500 text-sm text-center py-8">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-slate-400 text-xs">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          <button onClick={load} className="text-xs text-blue-400">Refresh</button>
          {errors.length > 0 && (
            <button onClick={clearAll} className="text-xs text-red-400">Clear all</button>
          )}
        </div>
      </div>
      <SectionCard>
        {errors.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">No errors logged</div>
        ) : errors.map(e => (
          <div key={e.id} className="px-4 py-3 border-b border-slate-700 last:border-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge color="red">{e.status_code ?? 500}</Badge>
                  <span className="text-slate-300 text-xs font-mono">{e.method} {e.path}</span>
                  {e.user_name && <span className="text-slate-500 text-xs">{e.user_name}</span>}
                </div>
                <div className="text-red-400 text-sm mt-1">{e.message}</div>
                {e.stack && (
                  <details className="mt-1">
                    <summary className="text-slate-600 text-xs cursor-pointer">Stack trace</summary>
                    <pre className="text-slate-500 text-xs mt-1 whitespace-pre-wrap break-all">{e.stack}</pre>
                  </details>
                )}
              </div>
              <div className="text-slate-600 text-xs flex-shrink-0">
                {new Date(e.created_at).toLocaleDateString('he-IL')}<br/>
                {new Date(e.created_at).toLocaleTimeString('he-IL')}
              </div>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Admin Panel ────────────────────────────────────────────────────────────

const TABS = ['Trips', 'Cars', 'Drivers', 'Errors'];

export default function AdminPanel() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const [tab, setTab]       = useState('Trips');
  const [cars, setCars]     = useState([]);
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    api.get('/cars').then(r => setCars(r.data));
    api.get('/drivers').then(r => setDrivers(r.data));
  }, []);

  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 text-2xl leading-none">‹</button>
          <h1 className="text-white font-bold text-lg">Admin Panel</h1>
        </div>
        <button onClick={logout} className="text-slate-500 text-sm">Sign out</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === t
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {tab === 'Trips'   && <TripsTab cars={cars} drivers={drivers} />}
        {tab === 'Cars'    && <CarsTab />}
        {tab === 'Drivers' && <DriversTab />}
        {tab === 'Errors'  && <ErrorsTab />}
      </div>

    </div>
  );
}
