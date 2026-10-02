// Thin wrapper around the Beaver REST API.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/login')) window.dispatchEvent(new Event('beaver:signed-out'));
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  setupStatus: () => request('GET', '/api/setup'),
  setup: (body) => request('POST', '/api/setup', body),
  login: (body) => request('POST', '/api/login', body),
  logout: () => request('POST', '/api/logout', {}),

  me: () => request('GET', '/api/me'),
  updateMe: (body) => request('PUT', '/api/me', body),
  changePassword: (body) => request('PUT', '/api/me/password', body),

  users: () => request('GET', '/api/users'),
  createUser: (body) => request('POST', '/api/users', body),
  updateUser: (id, body) => request('PUT', `/api/users/${id}`, body),

  levels: () => request('GET', '/api/levels'),
  createLevel: (body) => request('POST', '/api/levels', body),
  updateLevel: (id, body) => request('PUT', `/api/levels/${id}`, body),
  reorderLevels: (ids) => request('POST', '/api/levels/reorder', { ids }),
  deleteLevel: (id) => request('DELETE', `/api/levels/${id}`),

  tasks: (params) => request('GET', `/api/tasks?${new URLSearchParams(params)}`),
  counts: () => request('GET', '/api/counts'),
  createTask: (body) => request('POST', '/api/tasks', body),
  updateTask: (id, body) => request('PUT', `/api/tasks/${id}`, body),
  deleteTask: (id) => request('DELETE', `/api/tasks/${id}`),
};
