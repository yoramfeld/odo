import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function Login() {
  const [phone, setPhone]       = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { phone, idNumber });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate(data.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-slate-900">
      <div className="w-full max-w-sm">

        {/* Logo / title */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-3">🚗</div>
          <h1 className="text-2xl font-bold text-white">Fleet KM Logger</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Phone */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              Phone number
            </label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="05X-XXXXXXX"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-lg placeholder-slate-600
                         focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* National ID */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">
              National ID number
            </label>
            <input
              type="password"
              inputMode="numeric"
              placeholder="••••••••"
              value={idNumber}
              onChange={e => setIdNumber(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
                         text-white text-lg placeholder-slate-600
                         focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                       text-white font-semibold rounded-xl py-4 text-base
                       transition-colors mt-2"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

        </form>

        <p className="text-center text-xs text-slate-600 mt-8">
          No self-registration — contact your fleet manager
        </p>
      </div>
    </div>
  );
}
