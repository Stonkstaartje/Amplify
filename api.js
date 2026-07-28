// Alle API calls gaan naar /api/*.php op hetzelfde domein.
// Zorg dat de backend-map als /api op je hosting staat (zie DEPLOY.md).

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* geen json body (bv. stream) */ }
  if (!res.ok) {
    throw new Error(data?.error || `Serverfout (${res.status})`);
  }
  return data;
}

export const api = {
  register: (email, password, display_name) =>
    request('/auth.php?action=register', { method: 'POST', body: JSON.stringify({ email, password, display_name }) }),
  login: (email, password) =>
    request('/auth.php?action=login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth.php?action=logout', { method: 'POST' }),
  me: () => request('/auth.php?action=me'),

  tracks: (q = '') => request(`/tracks.php?action=list${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  uploadTrack: (formData) => request('/tracks.php?action=upload', { method: 'POST', body: formData }),
  deleteTrack: (id) => request('/tracks.php?action=delete', { method: 'POST', body: JSON.stringify({ id }) }),

  playlists: () => request('/playlists.php?action=list'),
  playlist: (id) => request(`/playlists.php?action=get&id=${id}`),
  createPlaylist: (name) => request('/playlists.php?action=create', { method: 'POST', body: JSON.stringify({ name }) }),
  deletePlaylist: (id) => request('/playlists.php?action=delete', { method: 'POST', body: JSON.stringify({ id }) }),
  addTrackToPlaylist: (playlist_id, track_id) =>
    request('/playlists.php?action=add_track', { method: 'POST', body: JSON.stringify({ playlist_id, track_id }) }),
  removeTrackFromPlaylist: (playlist_id, track_id) =>
    request('/playlists.php?action=remove_track', { method: 'POST', body: JSON.stringify({ playlist_id, track_id }) }),

  likedTracks: () => request('/likes.php?action=list'),
  toggleLike: (track_id) => request('/likes.php?action=toggle', { method: 'POST', body: JSON.stringify({ track_id }) }),

  streamUrl: (id) => `${BASE}/stream.php?id=${id}`,
  coverUrl: (id) => `${BASE}/cover.php?id=${id}`,
};
