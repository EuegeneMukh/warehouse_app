import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const DEFAULT_ORGANIZERS = [
  {
    id: 'org1', name: 'Органайзер 1',
    rows: [
      [{ id: 'A1', w: 2 }, { id: 'A2', w: 2 }, { id: 'A3', w: 1 }, { id: 'A4', w: 1 }],
      [{ id: 'B1', w: 1 }, { id: 'B2', w: 1 }, { id: 'B3', w: 2 }, { id: 'B4', w: 2 }],
      [{ id: 'C1', w: 3 }, { id: 'C2', w: 3 }],
      [{ id: 'D1', w: 1 }, { id: 'D2', w: 1 }, { id: 'D3', w: 1 }, { id: 'D4', w: 1 }, { id: 'D5', w: 2 }],
    ]
  },
  {
    id: 'org2', name: 'Органайзер 2',
    rows: [
      [{ id: 'E1', w: 1 }, { id: 'E2', w: 1 }, { id: 'E3', w: 1 }, { id: 'E4', w: 1 }, { id: 'E5', w: 1 }, { id: 'E6', w: 1 }],
      [{ id: 'F1', w: 2 }, { id: 'F2', w: 2 }, { id: 'F3', w: 2 }],
      [{ id: 'G1', w: 3 }, { id: 'G2', w: 3 }],
    ]
  }
]

const STORAGE_KEY = 'warehouse_organizers'

export default function TabOrganizer({ onEdit }) {
  const [organizers, setOrganizers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_ORGANIZERS } catch { return DEFAULT_ORGANIZERS }
  })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null) // { cell, items }
  const [allItems, setAllItems] = useState([])
  const [orgIndex, setOrgIndex] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')

  useEffect(() => {
    const load = async () => {
      const [components, inventory] = await Promise.all([api.components.list(), api.inventory.list()])
      const componentById = Object.fromEntries((components || []).map(component => [component.id, component]))
      setAllItems((inventory || []).map(row => ({ ...row, component: componentById[row.component_id] })))

      const data = await api.organizers.list()
      if (data?.length) {
        setOrganizers(data.map(({ id, name, rows }) => ({ id, name, rows })))
      } else {
        await api.organizers.save(organizers.map(({ id, name, rows }) => ({ id, name, rows })))
      }
      setReady(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(organizers))
    api.organizers.save(organizers.map(({ id, name, rows }) => ({ id, name, rows }))).catch(error => {
      setError(`Не удалось сохранить конфигурацию органайзера: ${error.message}`)
    })
  }, [organizers, ready])

  const org = organizers[orgIndex]

  const clickCell = (cellId) => {
    const items = allItems.filter(i => i.location && i.location.toUpperCase() === cellId.toUpperCase())
    setSelected({ cellId, items })
  }

  const getCellItems = (cellId) =>
    allItems.filter(i => i.location && i.location.toUpperCase() === cellId.toUpperCase())

  // Edit mode helpers
  const addRow = () => {
    const newRow = [{ id: `${org.id}_R${Date.now()}`, w: 1 }, { id: `${org.id}_R${Date.now() + 1}`, w: 1 }]
    setOrganizers(os => os.map((o, i) => i === orgIndex ? { ...o, rows: [...o.rows, newRow] } : o))
  }

  const removeRow = (ri) => {
    setOrganizers(os => os.map((o, i) => i === orgIndex ? { ...o, rows: o.rows.filter((_, j) => j !== ri) } : o))
  }

  const addCell = (ri) => {
    setOrganizers(os => os.map((o, i) => {
      if (i !== orgIndex) return o
      const rows = o.rows.map((row, j) => j === ri ? [...row, { id: `cell_${Date.now()}`, w: 1 }] : row)
      return { ...o, rows }
    }))
  }

  const removeCell = (ri, ci) => {
    setOrganizers(os => os.map((o, i) => {
      if (i !== orgIndex) return o
      const rows = o.rows.map((row, j) => j === ri ? row.filter((_, k) => k !== ci) : row)
      return { ...o, rows }
    }))
  }

  const changeWidth = (ri, ci, delta) => {
    setOrganizers(os => os.map((o, i) => {
      if (i !== orgIndex) return o
      const rows = o.rows.map((row, j) => j === ri
        ? row.map((cell, k) => k === ci ? { ...cell, w: Math.max(1, Math.min(6, cell.w + delta)) } : cell)
        : row)
      return { ...o, rows }
    }))
  }

  const changeCellId = (ri, ci, val) => {
    setOrganizers(os => os.map((o, i) => {
      if (i !== orgIndex) return o
      const rows = o.rows.map((row, j) => j === ri
        ? row.map((cell, k) => k === ci ? { ...cell, id: val.toUpperCase() } : cell)
        : row)
      return { ...o, rows }
    }))
  }

  const addOrganizer = () => {
    if (!newOrgName.trim()) return
    const newOrg = {
      id: `org_${Date.now()}`, name: newOrgName.trim(),
      rows: [[{ id: 'A1', w: 1 }, { id: 'A2', w: 1 }, { id: 'A3', w: 1 }]]
    }
    setOrganizers(os => [...os, newOrg])
    setOrgIndex(organizers.length)
    setNewOrgName('')
  }

  const removeOrganizer = async () => {
    if (organizers.length <= 1) return
    if (!window.confirm(`Удалить "${org.name}"?`)) return
    try {
      await api.organizers.remove(org.id)
    } catch (error) {
      setError(`Не удалось удалить органайзер: ${error.message}`)
      return
    }
    setOrganizers(os => os.filter((_, i) => i !== orgIndex))
    setOrgIndex(0)
  }

  return (
    <div className="tab-organizer">
      {/* Organizer selector */}
      <div className="org-header">
        <div className="org-tabs">
          {organizers.map((o, i) => (
            <button key={o.id} className={`org-tab ${i === orgIndex ? 'active' : ''}`} onClick={() => { setOrgIndex(i); setSelected(null) }}>
              {o.name}
            </button>
          ))}
        </div>
        <div className="org-header-actions">
          <button className={`btn-sm ${editMode ? 'active' : ''}`} onClick={() => setEditMode(e => !e)}>
            {editMode ? '✓ Готово' : '⚙️ Настроить'}
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {editMode && (
        <div className="edit-toolbar">
          <div className="add-org-row">
            <input value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="Название нового органайзера" className="edit-input" />
            <button className="btn-sm" onClick={addOrganizer}>+ Добавить органайзер</button>
            {organizers.length > 1 && <button className="btn-sm danger" onClick={removeOrganizer}>🗑 Удалить</button>}
          </div>
          <div className="edit-hint">Нажмите на адрес ячейки чтобы переименовать. Используйте ← → для изменения ширины.</div>
        </div>
      )}

      {/* Visual organizer grid */}
      <div className="org-body">
        <div className="org-grid">
          {org.rows.map((row, ri) => (
            <div key={ri} className="org-row">
              {row.map((cell, ci) => {
                const cellItems = getCellItems(cell.id)
                const count = cellItems.reduce((total, item) => total + item.quantity, 0)
                return (
                  <div
                    key={ci}
                    className={`org-cell ${count > 0 ? 'has-items' : ''} ${selected?.cellId === cell.id ? 'selected' : ''}`}
                    style={{ flex: cell.w }}
                    onClick={() => !editMode && clickCell(cell.id)}
                  >
                    {editMode ? (
                      <div className="cell-edit">
                        <input
                          className="cell-id-input"
                          value={cell.id}
                          onChange={e => changeCellId(ri, ci, e.target.value)}
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="cell-edit-btns">
                          <button onClick={e => { e.stopPropagation(); changeWidth(ri, ci, -1) }}>←</button>
                          <span>{cell.w}</span>
                          <button onClick={e => { e.stopPropagation(); changeWidth(ri, ci, 1) }}>→</button>
                          <button className="danger" onClick={e => { e.stopPropagation(); removeCell(ri, ci) }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="cell-id">{cell.id}</div>
                        {count > 0 && <div className="cell-count">{count}</div>}
                      </>
                    )}
                  </div>
                )
              })}
              {editMode && (
                <div className="row-actions-col">
                  <button className="btn-sm small" onClick={() => addCell(ri)} title="Добавить ячейку">+</button>
                  <button className="btn-sm small danger" onClick={() => removeRow(ri)} title="Удалить ряд">−</button>
                </div>
              )}
            </div>
          ))}
          {editMode && (
            <button className="btn-add-row" onClick={addRow}>+ Добавить ряд</button>
          )}
        </div>

        {/* Selected cell panel */}
        {selected && !editMode && (
          <div className="cell-panel">
            <div className="cell-panel-header">
              <h3>Ячейка {selected.cellId}</h3>
              <button className="close-btn" onClick={() => setSelected(null)}>✕</button>
            </div>
            {selected.items.length === 0 ? (
              <div className="cell-empty">Ячейка пуста</div>
            ) : (
              <div className="cell-items">
                {selected.items.map(item => (
                    <div key={item.id} className="cell-item" onClick={() => item.component && onEdit(item.component)}>
                     <div className="cell-item-name">{item.component?.name || 'Компонент удалён'}</div>
                     <div className="cell-item-sub">{[item.component?.nominal, item.component?.package].filter(Boolean).join(' · ')}</div>
                    <div className="cell-item-qty">× {item.quantity ?? '?'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="org-legend">
        <span className="legend-dot has-items" /> Есть компоненты
        <span className="legend-dot" style={{ marginLeft: 16 }} /> Пусто
      </div>
    </div>
  )
}
