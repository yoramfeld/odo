import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

async function getLocationFull() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
          { headers: { 'User-Agent': 'YomNesiot/1.0' } }
        );
        const d = await r.json();
        const a = d.address || {};
        const road = a.road || a.pedestrian || a.footway || '';
        const city = a.city || a.town || a.village || a.suburb || '';
        const address = [road, city].filter(Boolean).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        resolve({ lat, lng, address });
      } catch { resolve({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }); }
    }, () => resolve(null), { timeout: 8000, maximumAge: 30000 });
  });
}

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
  const [ocrLoading, setOcrLoading]       = useState(false);
  const [previewSrc, setPreviewSrc]       = useState(null);
  const [confidence, setConf]             = useState(null);
  const [locationText, setLocationText]   = useState('');
  const [detectedLoc, setDetectedLoc]     = useState(null);
  const [locationLoading, setLocLoading]  = useState(true);
  const [gpsCoords, setGpsCoords]         = useState(null);

  const cameraRef = useRef();
  const canvasRef = useRef(null);

  // Get location on mount, then check for learned correction
  useEffect(() => {
    getLocationFull().then(async result => {
      if (!result) { setLocLoading(false); return; }
      setGpsCoords({ lat: result.lat, lng: result.lng });
      try {
        const { data } = await api.get(`/locations/lookup?lat=${result.lat}&lng=${result.lng}`);
        const name = data.name || result.address;
        setDetectedLoc(name);
        setLocationText(name);
      } catch {
        setDetectedLoc(result.address);
        setLocationText(result.address);
      }
      setLocLoading(false);
    });
  }, []);

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

  function resizeImage(file, maxWidth = 1600) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const srcY  = Math.round(img.height / 3);
        const srcH  = Math.round(img.height / 3);
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width * scale);
        canvas.height = Math.round(srcH * scale);
        canvas.getContext('2d').drawImage(img, 0, srcY, img.width, srcH, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          const reader = new FileReader();
          reader.onload = e => resolve({ base64: e.target.result.split(',')[1], canvas });
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.88);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function cropCanvas(canvas, c) {
    const pad = 0.04;
    const iw = canvas.width, ih = canvas.height;
    const x = Math.max(0, (c.left - pad)) * iw;
    const y = Math.max(0, (c.top  - pad)) * ih;
    const w = Math.min(iw, (c.right  + pad) * iw) - x;
    const h = Math.min(ih, (c.bottom + pad) * ih) - y;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return out;
  }

  async function handleFile(file) {
    if (!file?.type.startsWith('image/')) return;
    setError('');
    setOcrLoading(true);
    try {
      const { base64, canvas } = await resizeImage(file);
      canvasRef.current = canvas;
      setPreviewSrc(canvas.toDataURL('image/jpeg', 0.92));

      const { data } = await api.post('/ocr/odometer', {
        image: base64,
        mimeType: 'image/jpeg',
        contextKm: lastKm ?? null,
      });

      if (data.crop && canvasRef.current) {
        const cropped = cropCanvas(canvasRef.current, data.crop);
        setPreviewSrc(cropped.toDataURL('image/jpeg', 0.92));
      }

      setConf(data.confidence ?? 'none');
      if (data.km != null) {
        setStartKm(String(data.km));
        if (lastKm != null && Math.abs(data.km - lastKm) > 5) {
          setWarn(`Expected ${lastKm.toLocaleString()} km — OCR read ${data.km.toLocaleString()} km.`);
        } else {
          setWarn('');
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'OCR failed — please try again');
    } finally {
      setOcrLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const isManual = locationText.trim() !== (detectedLoc || '').trim() && locationText.trim() !== '';
    if (isManual && gpsCoords) {
      api.post('/locations/correct', { ...gpsCoords, name: locationText.trim() }).catch(() => {});
    }
    try {
      const { data } = await api.post('/trips/start', {
        carId: parseInt(carId),
        startKm: parseInt(startKm),
        reason,
        notes: notes || undefined,
        startLocation: locationText.trim() || undefined,
        startLocationManual: isManual,
      });
      navigate(`/trip/end/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהתחלת נסיעה');
    } finally {
      setLoading(false);
    }
  }

  const selectedCar = cars.find(c => String(c.id) === carId);

  return (
    <div dir="rtl" className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <button onClick={() => navigate('/')} className="text-slate-400 text-2xl leading-none">›</button>
        <h1 className="text-white font-bold text-lg">התחל נסיעה</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-5 py-5 space-y-5">

        {/* Car selector */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
            רכב
          </label>
          {carsLoading ? (
            <div className="text-slate-500 text-sm">טוען רכבים…</div>
          ) : (
            <select
              value={carId}
              onChange={e => setCarId(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-base focus:outline-none focus:border-blue-500"
            >
              <option value="">בחר רכב…</option>
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
              מד קילומטר התחלתי
            </label>
            {lastKm != null && (
              <p className="text-slate-500 text-xs mb-2">
                אחרון מתועד: <span className="text-slate-300">{lastKm.toLocaleString()} ק״מ</span>
              </p>
            )}

            {/* OCR preview */}
            {previewSrc && (
              <img src={previewSrc} alt="odometer"
                className="w-full rounded-xl mb-3 object-contain bg-black"
                style={{ maxHeight: '30dvh' }} />
            )}

            <input ref={cameraRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={e => handleFile(e.target.files[0])} />

            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={startKm}
                onChange={e => handleKmChange(e.target.value)}
                required
                min={0}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pl-12
                           text-white text-2xl font-bold focus:outline-none focus:border-blue-500
                           [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                           [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button type="button" onClick={() => cameraRef.current.click()}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl leading-none">
                {ocrLoading
                  ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  : '📷'}
              </button>
            </div>

            {confidence && (
              <p className="text-xs mt-1.5">
                <span className={`px-2 py-0.5 rounded-full border text-xs
                  ${confidence === 'high' ? 'bg-green-950 text-green-400 border-green-800'
                  : confidence === 'low'  ? 'bg-amber-950 text-amber-400 border-amber-800'
                                          : 'bg-red-950 text-red-400 border-red-800'}`}>
                  {confidence}
                </span>
              </p>
            )}
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
              סיבת הנסיעה
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder='לדוגמה: בט"ש, איסוף ציוד…'
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
              הערות <span className="normal-case text-slate-600">(אופציונלי)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="הערות נוספות…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        )}

        {/* Location */}
        {carId && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              מיקום יציאה
              {!locationLoading && locationText.trim() !== (detectedLoc || '').trim() && locationText.trim() !== '' && (
                <span className="mr-2 normal-case text-amber-400 text-xs">(ידני)</span>
              )}
            </label>
            <input
              type="text"
              value={locationLoading ? '' : locationText}
              onChange={e => setLocationText(e.target.value)}
              placeholder={locationLoading ? 'מאתר מיקום…' : 'הזן כתובת ידנית…'}
              disabled={locationLoading}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
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
            {loading ? 'מתחיל…' : 'התחל נסיעה ←'}
          </button>
        )}

      </form>
    </div>
  );
}
