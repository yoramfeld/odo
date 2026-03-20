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

  function exportXlsx() {
    const params = new URLSearchParams();
    if (filters.from)     params.set('from', filters.from);
    if (filters.to)       params.set('to', filters.to);
    if (filters.carId)    params.set('carId', filters.carId);
    if (filters.driverId) params.set('driverId', filters.driverId);
    window.location.href = `/api/export/trips?${params}`;
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
                </div>
                <div className="text-right flex-shrink-0">
                  {t.distance_km != null
                    ? <div className="text-white font-bold text-sm">{t.distance_km} km</div>
                    : <Badge color="blue">active</Badge>}
                  <div className="text-slate-500 text-xs mt-0.5">
                    {t.start_km_confirmed?.toLocaleString()} → {t.end_km_confirmed?.toLocaleString() ?? '…'}
                  </div>
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
    setForm({ plate: '', make: '', model: '', year: '', current_km: '' });
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
                <Input value={form.plate || ''} onChange={e => setF('plate', e.target.value)} placeholder="12-345-67" />
              </FieldRow>
              <FieldRow label="Year">
                <Input type="number" value={form.year || ''} onChange={e => setF('year', e.target.value)} placeholder="2022" />
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
              <div className="text-slate-400 text-xs">{c.make} {c.model} {c.year ? `· ${c.year}` : ''}</div>
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
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ name: '', phone: '', idNumber: '', role: 'driver' });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { loadDrivers(); }, []);
  async function loadDrivers() {
    const { data } = await api.get('/drivers');
    setDrivers(data);
  }

  async function addDriver() {
    setSaving(true); setError('');
    try {
      await api.post('/drivers', form);
      await loadDrivers();
      setShowAdd(false);
      setForm({ name: '', phone: '', idNumber: '', role: 'driver' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add driver');
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
      <button onClick={() => { setShowAdd(true); setError(''); }}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold
                   rounded-xl py-3 text-sm transition-colors">
        + Add Driver
      </button>

      {showAdd && (
        <SectionCard>
          <div className="p-4 space-y-3">
            <h3 className="text-white font-semibold text-sm">New Driver</h3>
            <FieldRow label="Full name">
              <Input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Avi Cohen" />
            </FieldRow>
            <FieldRow label="Phone">
              <Input type="tel" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="05X-XXXXXXX" />
            </FieldRow>
            <FieldRow label="National ID">
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
              <button onClick={() => setShowAdd(false)}
                className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-2.5 text-sm">Cancel</button>
              <button onClick={addDriver} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-sm">
                {saving ? 'Saving…' : 'Add Driver'}
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
            <button
              onClick={() => toggleActive(d.id, !d.active)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 ${
                d.active
                  ? 'bg-red-950 text-red-400'
                  : 'bg-green-950 text-green-400'
              }`}
            >
              {d.active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Admin Panel ────────────────────────────────────────────────────────────

const TABS = ['Trips', 'Cars', 'Drivers'];

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
      </div>

    </div>
  );
}
