import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
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
  const location   = useLocation();

  const [trip, setTrip]         = useState(null);
  const [endKm, setEndKm]       = useState('');
  const [endKmOcr, setEndKmOcr] = useState(null);
  const [confidence, setConf]   = useState('none');
  const [warn, setWarn]         = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [ocrLoading, setOcrLoading]       = useState(false);
  const [locationText, setLocationText]   = useState('');
  const [detectedLoc, setDetectedLoc]     = useState(null);
  const [locationLoading, setLocLoading]  = useState(true);
  const [gpsCoords, setGpsCoords]         = useState(null);

  // Forgotten-start edit
  const [showStartEdit, setShowStartEdit]   = useState(false);
  const [startForm, setStartForm]           = useState({ startKm: '', reason: '', approvedBy: '', startLocation: '' });
  const [startSaving, setStartSaving]       = useState(false);
  const [startEditDone, setStartEditDone]   = useState(false);
  const [suggestions, setSuggestions]       = useState({ reason: [], approved_by: [] });

  const cameraRef  = useRef();
  const canvasRef  = useRef(null);

  useEffect(() => {
    api.get(`/trips/${tripId}`).then(res => {
      const t = res.data;
      setTrip(t);
      const elapsed = (Date.now() - new Date(t.start_time)) / 60000;
      if (elapsed < 3 && !location.state?.justStarted) setShowStartEdit(true);
      // Format start_time as datetime-local value (local time)
      const st = new Date(t.start_time);
      const pad = n => String(n).padStart(2, '0');
      const localDT = `${st.getFullYear()}-${pad(st.getMonth()+1)}-${pad(st.getDate())}T${pad(st.getHours())}:${pad(st.getMinutes())}`;
      setStartForm(f => ({
        ...f,
        startKm: String(t.start_km_confirmed ?? ''),
        startTime: localDT,
        reason: t.reason ?? '',
        approvedBy: t.approved_by ?? '',
        startLocation: t.start_location ?? '',
      }));
    });
    api.get('/trips/suggestions').then(r => setSuggestions(r.data)).catch(() => {});
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
      setEndKm(km != null ? String(km) : '');

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

  async function saveStartDetails() {
    setStartSaving(true);
    try {
      const updated = await api.patch(`/trips/${tripId}/start-details`, {
        startKm: parseInt(startForm.startKm) || undefined,
        startTime: startForm.startTime || undefined,
        startLocation: startForm.startLocation.trim() || undefined,
        startLocationManual: startForm.startLocation.trim() !== (trip.start_location || ''),
        reason: startForm.reason.trim() || undefined,
        approvedBy: startForm.approvedBy.trim() || undefined,
      });
      setTrip(updated.data);
      setShowStartEdit(false);
      setStartEditDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירת פרטי יציאה');
    } finally {
      setStartSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!endKm) { setError('אנא צלם תמונה תחילה'); return; }

    setLoading(true);
    const endLocation = locationText.trim() || undefined;
    const isManual = locationText.trim() !== (detectedLoc || '').trim() && locationText.trim() !== '';
    if (isManual && gpsCoords) {
      api.post('/locations/correct', { ...gpsCoords, name: locationText.trim() }).catch(() => {});
    }
    try {
      // Send cropped photo as base64 if available
      let endPhotoBase64 = null;
      if (canvasRef.current) {
        const blob = await new Promise(r => canvasRef.current.toBlob(r, 'image/jpeg', 0.88));
        endPhotoBase64 = await new Promise(r => {
          const reader = new FileReader();
          reader.onload = e => r(e.target.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
      }

      const { data } = await api.patch(`/trips/${tripId}/end`, {
        endKmOcr,
        endKmConfirmed: parseInt(endKm),
        endPhotoBase64,
        endLocation,
        endLocationManual: isManual,
      });

      if (data.warn) setWarn(data.warn);

      // Show auto-correction notice briefly then navigate
      if (data.autoCorrection) {
        setEndKm(String(data.trip.end_km_confirmed));
        setWarn(`Auto-corrected from ${endKmOcr} → ${data.trip.end_km_confirmed} km`);
        setTimeout(() => navigate('/'), 2000);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בסיום נסיעה');
    } finally {
      setLoading(false);
    }
  }

  if (!trip) return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-slate-500">Loading…</div>
    </div>
  );

  const elapsed = Math.round((Date.now() - new Date(trip.start_time)) / 60000);
  const elapsedH = Math.floor(elapsed / 60), elapsedM = elapsed % 60;
  const elapsedText = `${elapsedH}:${String(elapsedM).padStart(2, '0')}`;

  const distance = endKm && parseInt(endKm) > trip.start_km_confirmed
    ? parseInt(endKm) - trip.start_km_confirmed
    : null;

  return (
    <div dir="rtl" className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <button onClick={() => navigate('/')} className="text-slate-400 text-2xl leading-none">›</button>
        <h1 className="text-white font-bold text-lg">סיים נסיעה</h1>
      </div>

      <div className="flex-1 px-5 py-5 space-y-5">

        {/* Trip summary */}
        <div className="bg-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-white font-bold">
            {trip.plate} · {trip.make} {trip.model}
          </div>
          <div className="text-slate-400 text-sm">{trip.reason}</div>
          <div className="text-slate-500 text-xs">
            משך {elapsedText} · {trip.start_km_confirmed?.toLocaleString()} ק״מ
          </div>
          {trip.start_location && (
            <div className="text-slate-500 text-xs mt-0.5">📍 {trip.start_location}</div>
          )}
        </div>

        {/* Forgotten-start banner */}
        {(showStartEdit || startEditDone) && (
          <div className={`rounded-2xl border p-4 space-y-3 ${startEditDone ? 'bg-green-950 border-green-800' : 'bg-amber-950 border-amber-800'}`}>
            {startEditDone ? (
              <p className="text-green-400 text-sm">✓ פרטי היציאה עודכנו</p>
            ) : (
              <>
                <p className="text-amber-400 text-sm font-semibold">שכחת לרשום יציאה? עדכן פרטים</p>
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={startForm.startTime || ''}
                    onChange={e => setStartForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="number" inputMode="numeric"
                    value={startForm.startKm}
                    onChange={e => setStartForm(f => ({ ...f, startKm: e.target.value }))}
                    placeholder="מד ק״מ בהתחלה"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500
                               [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                               [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <AutocompleteInput
                    value={startForm.reason}
                    onChange={v => setStartForm(f => ({ ...f, reason: v }))}
                    suggestions={suggestions.reason}
                    placeholder="סיבת הנסיעה"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                  <AutocompleteInput
                    value={startForm.approvedBy}
                    onChange={v => setStartForm(f => ({ ...f, approvedBy: v }))}
                    suggestions={suggestions.approved_by}
                    placeholder="באישור"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={startForm.startLocation}
                    onChange={e => setStartForm(f => ({ ...f, startLocation: e.target.value }))}
                    placeholder="מיקום יציאה"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowStartEdit(false)}
                    className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-2 text-sm">
                    ביטול
                  </button>
                  <button type="button" onClick={saveStartDetails} disabled={startSaving}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40
                               text-white font-semibold rounded-xl py-2 text-sm">
                    {startSaving ? 'שומר…' : 'שמור פרטי יציאה'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Photo */}
        <div>
          <button type="button" onClick={() => !ocrLoading && cameraRef.current.click()}
            className="flex items-center gap-2 mb-2 w-full">
            {ocrLoading ? (
              <>
                <span className="text-slate-400 text-xs uppercase tracking-widest">קורא מד קילומטר…</span>
                <svg className="animate-spin w-4 h-4 text-slate-400 mr-auto" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              </>
            ) : (
              <>
                <span className="text-slate-400 text-xs uppercase tracking-widest">סיימת? צלם את מד הק״מ</span>
                <span className="text-2xl">📷</span>
              </>
            )}
          </button>

          {/* Preview */}
          {previewSrc && (
            <img
              src={previewSrc}
              alt="odometer"
              className="w-full rounded-xl mb-3 object-contain bg-black"
              style={{ maxHeight: '35dvh' }}
            />
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={e => handleFile(e.target.files[0])} />

          {/* End location — right below camera */}
          <div className="mt-3">
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              מיקום סיום
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
        </div>

        {/* KM result */}
        {endKm !== '' && !ocrLoading && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              מד קילומטר סיום
              <span className={`mr-2 px-2 py-0.5 rounded-full text-xs border ${badgeClass(confidence)}`}>
                {confidence}
              </span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={endKm}
              onChange={e => setEndKm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-2xl font-bold focus:outline-none focus:border-blue-500
                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                         [&::-webkit-inner-spin-button]:appearance-none"
            />
            {distance != null && (
              <p className="text-slate-400 text-sm mt-2">
                מרחק נסיעה: <span className="text-white font-semibold">{distance} ק״מ</span>
              </p>
            )}
          </div>
        )}

        {warn && (
          <div className="bg-amber-950 border border-amber-800 text-amber-400 text-sm rounded-xl px-4 py-3">
            ⚠️ {warn}
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Combined camera / submit button */}
        <form onSubmit={handleSubmit}>
          {ocrLoading ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-4">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              קורא מד קילומטר…
            </div>
          ) : endKm !== '' ? (
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40
                         text-white font-bold rounded-2xl py-4 text-lg transition-colors"
            >
              {loading ? 'שומר…' : 'סיים נסיעה ✓'}
            </button>
          ) : null}
        </form>

      </div>
    </div>
  );
}
