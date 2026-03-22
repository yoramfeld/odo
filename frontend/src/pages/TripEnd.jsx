import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import AutocompleteInput from '../components/AutocompleteInput';

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

export default function TripEnd() {
  const { tripId } = useParams();
  const navigate   = useNavigate();

  const [trip, setTrip]     = useState(null);
  const [form, setForm]     = useState({
    startKm: '', startTime: '', startLocation: '',
    endKm: '', endLocation: '',
    reason: '', approvedBy: '', notes: '',
  });
  const [endKmOcr, setEndKmOcr]   = useState(null);
  const [confidence, setConf]     = useState('none');
  const [suggestions, setSugg]    = useState({ reason: [], approved_by: [], end_location: [] });
  const [anomaly, setAnomaly]     = useState(null);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [endActive, setEndActive] = useState(false);

  const cameraRef   = useRef();
  const canvasRef   = useRef(null);
  const locationRef = useRef(null);
  const endKmRef    = useRef(null);

  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  function prefillForm(t) {
    const d = new Date(t.start_time);
    const pad = n => String(n).padStart(2, '0');
    const localDT = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setForm(f => ({
      ...f,
      startKm:       String(t.start_km_confirmed ?? ''),
      startTime:     localDT,
      startLocation: t.start_location ?? '',
      reason:        t.reason ?? '',
      approvedBy:    t.approved_by ?? '',
      notes:         t.notes ?? '',
    }));
  }

  async function fetchLocation() {
    const result = await getLocationFull();
    if (!result) return;
    try {
      const { data } = await api.get(`/locations/lookup?lat=${result.lat}&lng=${result.lng}`);
      locationRef.current = data.name || result.address;
    } catch {
      locationRef.current = result.address;
    }
  }

  useEffect(() => {
    api.get(`/trips/${tripId}`).then(res => { setTrip(res.data); prefillForm(res.data); });
    api.get('/trips/suggestions').then(r => setSugg(r.data)).catch(() => {});
    fetchLocation();
  }, [tripId]);

  // ── Image processing (same as POC) ──────────────────────────────────────
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
    const iw  = canvas.width, ih = canvas.height;
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

      // Show the resized canvas as preview
      setPreviewSrc(canvas.toDataURL('image/jpeg', 0.92));

      const { data } = await api.post('/ocr/odometer', {
        image: base64,
        mimeType: 'image/jpeg',
        contextKm: trip?.start_km_confirmed ?? null,
      });

      const km   = data.km;
      const conf = data.confidence ?? 'none';
      setEndKmOcr(km);
      setConf(conf);
      if (km != null) set('endKm')(String(km));

      // Crop preview to digit area
      if (data.crop && canvasRef.current) {
        const cropped = cropCanvas(canvasRef.current, data.crop);
        setPreviewSrc(cropped.toDataURL('image/jpeg', 0.92));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בקריאה — נסה שוב');
    } finally {
      setOcrLoading(false);
    }
  }

  const [previewSrc, setPreviewSrc] = useState(null);

  function badgeClass(c) {
    return c === 'high' ? 'bg-green-950 text-green-400 border-green-800'
         : c === 'low'  ? 'bg-amber-950 text-amber-400 border-amber-800'
                        : 'bg-red-950 text-red-400 border-red-800';
  }

  async function doSubmit() {
    setLoading(true);
    try {
      let endPhotoBase64 = null;
      if (canvasRef.current) {
        const blob = await new Promise(r => canvasRef.current.toBlob(r, 'image/jpeg', 0.88));
        endPhotoBase64 = await new Promise(r => {
          const reader = new FileReader();
          reader.onload = e => r(e.target.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
      }
      await api.patch(`/trips/${tripId}/end`, {
        endKmOcr,
        endKmConfirmed: parseInt(form.endKm),
        endPhotoBase64,
        endLocation:    form.endLocation.trim() || undefined,
        endLocationGps: locationRef.current || undefined,
        endKmManual:    !canvasRef.current,
        startKm:        parseInt(form.startKm) || undefined,
        startTime:      form.startTime ? new Date(form.startTime).toISOString() : undefined,
        startLocation:  form.startLocation.trim() || undefined,
        reason:         form.reason.trim() || undefined,
        approvedBy:     form.approvedBy.trim() || undefined,
        notes:          form.notes.trim() || undefined,
      });
      navigate('/');
    } catch (err) {
      if (err.response?.status === 409) { navigate('/'); return; }
      setError(err.response?.data?.error || 'שגיאה בסיום נסיעה');
    } finally {
      setLoading(false);
    }
  }

  function activateEndKm() {
    setEndActive(true);
    setTimeout(() => endKmRef.current?.focus(), 50);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!endActive) { activateEndKm(); return; }
    setError('');
    setAnomaly(null);
    if (!form.endKm) { endKmRef.current?.focus(); setError('אנא הזן מד קילומטר סיום'); return; }
    if (!form.endLocation.trim()) { setError('אנא הזן מיקום סיום'); return; }
    if (!form.reason.trim()) { setError('אנא הזן סיבת נסיעה'); return; }
    const delta = parseInt(form.endKm) - parseInt(form.startKm);
    if (delta < 0)  { setAnomaly('מד ק״מ סיום נמוך מתחילת הנסיעה'); return; }
    if (delta === 0) { setAnomaly('מד ק״מ סיום זהה לתחילת הנסיעה'); return; }
    await doSubmit();
  }

  if (!trip) return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-slate-500">Loading…</div>
    </div>
  );

  const distance = endActive && form.endKm && parseInt(form.endKm) > parseInt(form.startKm)
    ? parseInt(form.endKm) - parseInt(form.startKm) : null;

  const fieldClass = "w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500";

  return (
    <div dir="rtl" className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <button onClick={() => navigate('/')} className="text-slate-400 text-2xl leading-none">›</button>
        <h1 className="text-white font-bold text-lg">סיים נסיעה</h1>
        <span className="text-slate-500 text-sm mr-auto">{trip.plate} · {trip.make} {trip.model}</span>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="flex-1 px-5 py-4 space-y-3 overflow-y-auto">

          {/* Row 1: Reason | Approved By */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1.5">סיבת הנסיעה</label>
              <AutocompleteInput value={form.reason} onChange={set('reason')}
                suggestions={suggestions.reason || []} placeholder="מנהלי, בט״ש…" className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1.5">באישור</label>
              <AutocompleteInput value={form.approvedBy} onChange={set('approvedBy')}
                suggestions={suggestions.approved_by || []} placeholder="ק.אגם, אח״מ…" className={fieldClass} />
            </div>
          </div>

          {/* Row 2: Start Location | End Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1.5">מיקום התחלה</label>
              <AutocompleteInput value={form.startLocation} onChange={set('startLocation')}
                suggestions={suggestions.start_location || []} placeholder="הזן מיקום…" className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1.5">מיקום סיום</label>
              <AutocompleteInput value={form.endLocation} onChange={set('endLocation')}
                suggestions={suggestions.end_location || []} placeholder="הזן מיקום…" className={fieldClass} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1.5">
              הערות <span className="normal-case text-slate-600">(אופציונלי)</span>
            </label>
            <textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
              rows={2} placeholder="הערות נוספות…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          {/* OCR preview */}
          {previewSrc && (
            <img src={previewSrc} alt="odometer"
              className="w-full rounded-xl object-contain bg-black"
              style={{ maxHeight: '30dvh' }} />
          )}

          {/* Row 3: Start KM | End KM */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1.5">ק״מ התחלה</label>
              <input type="number" inputMode="numeric" value={form.startKm}
                onChange={e => set('startKm')(e.target.value)}
                className={`${fieldClass} text-xl font-bold
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                  [&::-webkit-inner-spin-button]:appearance-none`} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-1.5">
                ק״מ סיום
                {endKmOcr != null && (
                  <span className={`mr-2 px-1.5 py-0.5 rounded-full text-xs border ${badgeClass(confidence)}`}>
                    {confidence}
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  ref={endKmRef}
                  type="number" inputMode="numeric"
                  value={form.endKm}
                  onChange={e => set('endKm')(e.target.value)}
                  disabled={!endActive}
                  placeholder={endActive ? 'הזן ק״מ…' : '—'}
                  className={`w-full border rounded-xl px-4 py-3 pl-10 text-xl font-bold
                    focus:outline-none focus:border-blue-500
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                    [&::-webkit-inner-spin-button]:appearance-none
                    ${endActive
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'}`}
                />
                {endActive && (
                  <button type="button" onClick={() => cameraRef.current.click()}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg leading-none">
                    {ocrLoading
                      ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      : '📷'}
                  </button>
                )}
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={e => handleFile(e.target.files[0])} />
              {distance != null && (
                <p className="text-slate-400 text-xs mt-1">
                  מרחק: <span className="text-white font-semibold">{distance} ק״מ</span>
                </p>
              )}
            </div>
          </div>

        </div>

        {/* Bottom */}
        <div className="px-5 pb-6 pt-2 space-y-3">

          {anomaly && (
            <div className="bg-amber-950 border border-amber-800 rounded-2xl px-4 py-3 space-y-3">
              <p className="text-amber-400 text-sm font-semibold">⚠️ {anomaly}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAnomaly(null)}
                  className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-2.5 text-sm">
                  חזור לטופס
                </button>
                <button type="button" onClick={doSubmit} disabled={loading}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40
                             text-white font-semibold rounded-xl py-2.5 text-sm">
                  {loading ? 'שומר…' : 'שמור בכל זאת'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!anomaly && (
            <button type="submit" disabled={loading}
              className={`w-full font-bold rounded-2xl py-4 text-lg transition-colors
                ${endActive
                  ? 'bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
              {loading ? 'שומר…' : endActive ? 'אשר וסיים ✓' : 'סיים נסיעה ←'}
            </button>
          )}

        </div>
      </form>
    </div>
  );
}
