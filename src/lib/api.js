async function request(path, options = {}) {
  const response = await fetch(`api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Ошибка сервера (${response.status})`)
  return body
}

export const api = {
  components: {
    list: () => request('/components'),
    create: payload => request('/components', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/components/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: id => request(`/components/${id}`, { method: 'DELETE' }),
  },
  inventory: {
    list: () => request('/inventory'),
    upsert: payload => request('/inventory', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: id => request(`/inventory/${id}`, { method: 'DELETE' }),
  },
  organizers: {
    list: () => request('/organizers'),
    save: payload => request('/organizers', { method: 'PUT', body: JSON.stringify(payload) }),
    remove: id => request(`/organizers/${id}`, { method: 'DELETE' }),
  },
  backup: () => request('/backup', { method: 'POST' }),
  exportData: async () => {
    const response = await fetch('api/export')
    if (!response.ok) throw new Error('Не удалось экспортировать базу')
    return response.blob()
  },
  importData: data => request('/import', { method: 'POST', body: JSON.stringify(data) }),
  restoreDatabase: async file => {
    const response = await fetch('api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Не удалось восстановить базу')
    return body
  },
}
