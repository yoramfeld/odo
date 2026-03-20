import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function TripStart() {
  const navigate = useNavigate();

  const [cars, setCars]         = useState([]);
  const [carId, setCarId]       = useState('');
  const [lastKm, setLastKm]     = useState(null);
  const [startKm, setStartKm]   = useState('');
  const [reason, setReason]     = useState('');
  const [notes, setNotes]       = useState('');
  const [warn, setWarn]         = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [carsLoading, setCarsLoading] = useState(true);

  // Load cars
  useEffect(() => {
    api.get('/cars')
      .then(res => setCars(res.data))
      .finally(() => setCarsLoading(false));
  }, []);

  // When car changes, fetch last known KM
  useEffect(() => {
    if (!carId) { setLastKm(null); setStartKm(''); setWarn(''); return; }
    api.get(`/trips/car/${carId}/last-end-km`).then(res => {
      const km = res.data.last_km;
      setLastKm(km);
      setStartKm(km != null ? String(km) : '');
      setWarn('');
    });
  }, [carId]);

  // Warn if driver edits KM away from expected
  function handleKmChange(val) {
    setStartKm(val);
    if (lastKm != null && val !== '' && Math.abs(parseInt(val) - lastKm) > 5) {
      setWarn(`Expected ${lastKm.toLocaleString()} km — you entered ${parseInt(val).toLocaleString()} km. Add a note if needed.`);
    } else {
      setWarn('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/trips/start', {
        carId: parseInt(carId),
        startKm: parseInt(startKm),
        reason,
        notes: notes || undefined,
      });
      navigate(`/trip/end/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start trip');
    } finally {
      setLoading(false);
    }
  }

  const selectedCar = cars.find(c => String(c.id) === carId);

  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <button onClick={() => navigate('/')} className="text-slate-400 text-2xl leading-none">‹</button>
        <h1 className="text-white font-bold text-lg">Start Trip</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-5 py-5 space-y-5">

        {/* Car selector */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
            Vehicle
          </label>
          {carsLoading ? (
            <div className="text-slate-500 text-sm">Loading vehicles…</div>
          ) : (
            <select
              value={carId}
              onChange={e => setCarId(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-base focus:outline-none focus:border-blue-500"
            >
              <option value="">Select a vehicle…</option>
              {cars.map(c => (
                <option key={c.id} value={c.id}>
                  {c.plate} — {c.make} {c.model} {c.year ? `(${c.year})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Start KM */}
        {carId && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              Start odometer (km)
            </label>
            {lastKm != null && (
              <p className="text-slate-500 text-xs mb-2">
                Last recorded: <span className="text-slate-300">{lastKm.toLocaleString()} km</span>
              </p>
            )}
            <input
              type="number"
              inputMode="numeric"
              value={startKm}
              onChange={e => handleKmChange(e.target.value)}
              required
              min={0}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-2xl font-bold focus:outline-none focus:border-blue-500
                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                         [&::-webkit-inner-spin-button]:appearance-none"
            />
            {warn && (
              <div className="mt-2 bg-amber-950 border border-amber-800 text-amber-400
                              text-sm rounded-xl px-4 py-3">
                ⚠️ {warn}
              </div>
            )}
          </div>
        )}

        {/* Reason */}
        {carId && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              Reason for trip
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Client visit, supplies pickup…"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Notes */}
        {carId && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              Notes <span className="normal-case text-slate-600">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {carId && (
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                       text-white font-bold rounded-2xl py-4 text-lg transition-colors"
          >
            {loading ? 'Starting…' : 'Start Trip →'}
          </button>
        )}

      </form>
    </div>
  );
}
