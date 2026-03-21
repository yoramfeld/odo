import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalise error so err.response.data.error is always a string
function normaliseError(err) {
  const data = err.response?.data;
  if (data && typeof data.error === 'object' && data.error !== null) {
    data.error = data.error.message || JSON.stringify(data.error);
  }
  return err;
}

api.interceptors.response.use(
  res => res,
  err => {
    normaliseError(err);
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
