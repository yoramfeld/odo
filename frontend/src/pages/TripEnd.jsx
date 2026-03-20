import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';

export default function TripEnd() {
  const { tripId } = useParams();
  const navigate   = useNavigate();

  const [trip, setTrip]         = useState(null);
  const [endKm, setEndKm]       = useState('');
  const [endKmOcr, setEndKmOcr] = useState(null);
  const [confidence, setConf]   = useState('none');
  const [warn, setWarn]         = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const fileRef    = useRef();
  const cameraRef  = useRef();
  const canvasRef  = useRef(null); // holds resized canvas for crop

  useEffect(() => {
    api.get(`/trips/${tripId}`).then(res => setTrip(res.data));
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
      setError(err.response?.data?.error || 'OCR failed — please try again');
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!endKm) { setError('Please take a photo first'); return; }

    setLoading(true);
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
      setError(err.response?.data?.error || 'Failed to end trip');
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
  const elapsedText = elapsed < 60
    ? `${elapsed} min ago`
    : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m ago`;

  const distance = endKm && parseInt(endKm) > trip.start_km_confirmed
    ? parseInt(endKm) - trip.start_km_confirmed
    : null;

  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <button onClick={() => navigate('/')} className="text-slate-400 text-2xl leading-none">‹</button>
        <h1 className="text-white font-bold text-lg">End Trip</h1>
      </div>

      <div className="flex-1 px-5 py-5 space-y-5">

        {/* Trip summary */}
        <div className="bg-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-white font-bold">
            {trip.plate} · {trip.make} {trip.model}
          </div>
          <div className="text-slate-400 text-sm">{trip.reason}</div>
          <div className="text-slate-500 text-xs">
            Started {elapsedText} · {trip.start_km_confirmed?.toLocaleString()} km
          </div>
        </div>

        {/* Photo */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
            Odometer photo
          </label>

          {/* Preview */}
          {previewSrc && (
            <img
              src={previewSrc}
              alt="odometer"
              className="w-full rounded-xl mb-3 object-contain bg-black"
              style={{ maxHeight: previewSrc ? '35dvh' : undefined }}
            />
          )}

          {/* Camera buttons */}
          {!ocrLoading && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current.click()}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-300
                           font-semibold rounded-xl py-3 text-sm"
              >
                📷 Camera
              </button>
              <button
                type="button"
                onClick={() => fileRef.current.click()}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-300
                           font-semibold rounded-xl py-3 text-sm"
              >
                🖼 Gallery
              </button>
            </div>
          )}

          {ocrLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Reading odometer…
            </div>
          )}

          <input ref={fileRef}   type="file" accept="image/*"                          className="hidden" onChange={e => handleFile(e.target.files[0])} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment"    className="hidden" onChange={e => handleFile(e.target.files[0])} />
        </div>

        {/* KM result */}
        {endKm !== '' && !ocrLoading && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              End odometer (km)
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs border ${badgeClass(confidence)}`}>
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
                Trip distance: <span className="text-white font-semibold">{distance} km</span>
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

        {/* Submit */}
        <form onSubmit={handleSubmit}>
          <button
            type="submit"
            disabled={loading || ocrLoading || !endKm}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40
                       text-white font-bold rounded-2xl py-4 text-lg transition-colors"
          >
            {loading ? 'Saving…' : 'End Trip ✓'}
          </button>
        </form>

      </div>
    </div>
  );
}
