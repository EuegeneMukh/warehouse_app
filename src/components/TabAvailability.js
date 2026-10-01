import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const EMPTY_FORM = { componentId: '', location: '', quantity: '1' }

export default function TabAvailability() {
  const [components, setComponents] = useState([])
  const [stock, setStock] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [componentSearch, setComponentSearch] = useState('')
  const [inventorySearch, setInventorySearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [componentsData, stockData] = await Promise.all([api.components.list(), api.inventory.list()])
      setComponents(componentsData || [])
      setStock(stockData || [])
      setError('')
    } catch (error) {
      setError(`Не удалось загрузить наличие: ${error.message}`)
    }
    setLoading(false)
  }

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }))

  const matchingComponents = components.filter(component => {
    const query = componentSearch.trim().toLowerCase()
    if (!query) return false
    return [component.name, component.category, component.nominal, component.article, component.manufacturer]
      .some(value => value && value.toLowerCase().includes(query))
  })

  const chooseComponent = (component) => {
    set('componentId', component.id)
    setComponentSearch(component.name)
  }

  const addStock = async () => {
    const quantity = parseInt(form.quantity, 10)
    if (!form.componentId) { setError('Выберите компонент из базы'); return }
    if (!Number.isInteger(quantity) || quantity <= 0) { setError('Количество должно быть больше нуля'); return }
    setSaving(true)
    setError('')
    try {
      await api.inventory.upsert({
      component_id: form.componentId,
      location: form.location.trim(),
      quantity,
      })
      setForm(EMPTY_FORM)
      setComponentSearch('')
      await loadData()
    } catch (error) {
      setError(`Не удалось добавить наличие: ${error.message}`)
    }
    setSaving(false)
  }

  const changeQuantity = async (row, delta) => {
    const quantity = row.quantity + delta
    if (quantity < 0) return
    try { await api.inventory.update(row.id, { quantity }); loadData() } catch (error) { setError(error.message) }
  }

  const removeStock = async (id) => {
    try { await api.inventory.remove(id); loadData() } catch (error) { setError(error.message) }
  }

  const componentName = (id) => components.find(component => component.id === id)?.name || 'Удалённый компонент'
  const filteredStock = stock.filter(row => {
    const query = inventorySearch.trim().toLowerCase()
    if (!query) return true
    const component = components.find(item => item.id === row.component_id)
    return [component?.name, component?.category, component?.article, row.location]
      .some(value => value && value.toLowerCase().includes(query))
  })

  return (
    <div className="tab-list">
      <div className="card-header">
        <h2>Наличие компонентов</h2>
      </div>
      <div className="search-bar">
        <input className="availability-list-search" value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} placeholder="Поиск по компоненту или месту хранения..." />
      </div>
      <div className="availability-form">
        <div className="cat-dropdown availability-component-search">
          <input
            className="availability-search-input"
            value={componentSearch}
            onChange={e => { setComponentSearch(e.target.value); set('componentId', '') }}
            placeholder="Выберите компонент из базы..."
          />
          {componentSearch && !form.componentId && (
            <div className="cat-menu">
              {matchingComponents.length > 0 ? matchingComponents.map(component => (
                <button key={component.id} className="cat-option" onClick={() => chooseComponent(component)}>
                  <span>{component.name}</span>
                  {component.category && <small>{component.category}</small>}
                </button>
              )) : <div className="cat-option">Совпадений не найдено</div>}
            </div>
          )}
        </div>
        <input className="availability-form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Адрес / место хранения" />
        <input className="availability-form-input quantity-input" type="number" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="Количество" />
        <button className="btn-add" onClick={addStock} disabled={saving || components.length === 0}>Добавить</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {loading ? <div className="loading">Загрузка...</div> : stock.length === 0 ? (
        <div className="empty">Наличие пока не добавлено. Сначала выберите компонент из базы.</div>
      ) : filteredStock.length === 0 ? (
        <div className="empty">По вашему запросу ничего не найдено</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Компонент</th><th>Место</th><th>Количество</th><th></th></tr></thead>
            <tbody>{filteredStock.map(row => (
              <tr key={row.id}>
                <td>{componentName(row.component_id)}</td>
                <td>{row.location || 'Без места'}</td>
                <td><button className="icon-btn" onClick={() => changeQuantity(row, -1)} disabled={row.quantity === 0}>−</button> <strong>{row.quantity}</strong> <button className="icon-btn" onClick={() => changeQuantity(row, 1)}>+</button></td>
                <td><button className="icon-btn danger" onClick={() => removeStock(row.id)}>🗑️</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
