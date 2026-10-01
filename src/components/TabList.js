import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const BADGE_COLORS = {
  'Резисторы':    '#4ade80',
  'Конденсаторы': '#60a5fa',
  'Микросхемы':   '#c084fc',
  'Транзисторы':  '#fb923c',
  'Диоды':        '#f87171',
  'Индуктивности':'#fbbf24',
  'Разъёмы':      '#34d399',
  'Другое':       '#94a3b8',
}

export default function TabList({ onEdit, onNew }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [catOpen, setCatOpen] = useState(false)
  const [selectedCat, setSelectedCat] = useState('Все')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const scanRef = useRef('')
  const scanTimer = useRef(null)

  useEffect(() => {
    fetchItems()
  }, [])

  // Barcode scanner support — USB scanners type quickly and end with Enter
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Enter') {
        if (scanRef.current.length > 3) {
          const code = scanRef.current
          scanRef.current = ''
          handleScan(code)
        }
        return
      }
      if (e.key.length === 1) {
        scanRef.current += e.key
        clearTimeout(scanTimer.current)
        scanTimer.current = setTimeout(() => { scanRef.current = '' }, 300)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [items])

  const handleScan = (code) => {
    const found = items.find(i => i.article && i.article.toLowerCase().includes(code.toLowerCase()))
    if (found) onEdit(found)
    else {
      alert(`Компонент с артикулом "${code}" не найден.\nДобавить новый?`)
    }
  }

  const fetchItems = async () => {
    setLoading(true)
    try {
      setItems(await api.components.list())
      setError('')
    } catch (error) {
      setError(`Не удалось загрузить компоненты: ${error.message}`)
    }
    setLoading(false)
  }

  const deleteItem = async (id) => {
    if (!window.confirm('Удалить компонент?')) return
    try { await api.components.remove(id); fetchItems() } catch (error) { setError(error.message) }
  }

  const categories = ['Все', ...new Set(items.map(item => item.category).filter(Boolean))]
  const filteredCats = categories.filter(c =>
    c === 'Все' || c.toLowerCase().includes(catSearch.toLowerCase())
  )

  const filtered = items.filter(item => {
    const q = search.toLowerCase()
    const matchSearch = !q || [item.name, item.nominal, item.article, item.package, item.manufacturer, item.location, item.note]
      .some(f => f && f.toLowerCase().includes(q))
    const matchCat = selectedCat === 'Все' || item.category === selectedCat
    return matchSearch && matchCat
  })

  const stats = {
    total: items.length,
    cats: new Set(items.map(i => i.category).filter(Boolean)).size,
  }

  return (
    <div className="tab-list">
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-box"><div className="stat-label">Позиций</div><div className="stat-val">{stats.total}</div></div>
        <div className="stat-box"><div className="stat-label">Категорий</div><div className="stat-val">{stats.cats}</div></div>
      </div>

      {/* Search and filter bar */}
      <div className="search-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Поиск по названию, номиналу, артикулу..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="clear-btn" onClick={() => setSearch('')}>✕</button>}
        </div>

        {/* Category dropdown */}
        <div className="cat-dropdown" style={{ position: 'relative' }}>
          <button className="cat-trigger" onClick={() => setCatOpen(o => !o)}>
            <span className="cat-dot" style={{ background: BADGE_COLORS[selectedCat] || '#6366f1' }} />
            {selectedCat}
            <span style={{ marginLeft: 'auto', opacity: 0.5 }}>▾</span>
          </button>
          {catOpen && (
            <div className="cat-menu">
              <input
                className="cat-search"
                placeholder="Фильтр категорий..."
                value={catSearch}
                onChange={e => setCatSearch(e.target.value)}
                autoFocus
              />
              {filteredCats.map(c => (
                <button key={c} className={`cat-option ${selectedCat === c ? 'active' : ''}`}
                  onClick={() => { setSelectedCat(c); setCatOpen(false); setCatSearch('') }}>
                  {c !== 'Все' && <span className="cat-dot" style={{ background: BADGE_COLORS[c] }} />}
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="btn-add" onClick={onNew}>+ Добавить</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : error ? (
        <div className="empty form-error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div>Ничего не найдено</div>
          {items.length === 0 && <button className="btn-add" style={{ marginTop: 16 }} onClick={onNew}>Добавить первый компонент</button>}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название / Артикул</th>
                <th>Категория</th>
                <th>Номинал</th>
                <th>Корпус</th>
                <th>Заметка</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="comp-name">{item.name}</div>
                    {item.manufacturer && <div className="comp-sub">{item.manufacturer}</div>}
                    {item.article && <div className="comp-sub" style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.article}</div>}
                  </td>
                  <td>
                    <span className="badge" style={{
                      background: (BADGE_COLORS[item.category] || '#94a3b8') + '22',
                      color: BADGE_COLORS[item.category] || '#94a3b8',
                      border: `1px solid ${(BADGE_COLORS[item.category] || '#94a3b8')}44`
                    }}>{item.category || '—'}</span>
                  </td>
                  <td>{item.nominal || '—'}</td>
                  <td><span className="mono">{item.package || '—'}</span></td>
                  <td><span className="note-text">{item.note || ''}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="Редактировать" onClick={() => onEdit(item)}>✏️</button>
                      <button className="icon-btn danger" title="Удалить" onClick={() => deleteItem(item.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
