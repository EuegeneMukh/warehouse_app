import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const PACKAGES = ['0201', '0402', '0603', '0805', '1206', 'SOT-23', 'SOT-323', 'SOIC-8', 'DIP-8', 'DIP-14', 'DIP-28', 'QFP', 'QFN', 'TO-92', 'TO-220', 'DO-41', 'THT', 'SMD']

const EMPTY = { name: '', category: '', nominal: '', package: '', manufacturer: '', article: '', note: '' }

export default function TabCard({ item, onSaved, onCancel }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState([])
  const scanRef = useRef('')
  const scanTimer = useRef(null)

  useEffect(() => {
    setForm(item ? { ...EMPTY, ...item } : EMPTY)
    setError('')
  }, [item])

  useEffect(() => {
    api.components.list().then(data => {
      const values = (data || []).map(row => row.category?.trim()).filter(Boolean)
      setCategories([...new Set(values)].sort((a, b) => a.localeCompare(b, 'ru')))
    })
  }, [])

  // Scanner support on card — fills the article field
  useEffect(() => {
    const handleKey = (e) => {
      const active = document.activeElement
      const isTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
      if (isTyping) return
      if (e.key === 'Enter') {
        if (scanRef.current.length > 3) {
          setForm(f => ({ ...f, article: scanRef.current }))
          scanRef.current = ''
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
  }, [])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const save = async () => {
    if (!form.name.trim()) { setError('Введите название компонента'); return }
    setSaving(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      category: form.category,
      nominal: form.nominal.trim(),
      package: form.package.trim(),
      manufacturer: form.manufacturer.trim(),
      article: form.article.trim(),
      note: form.note.trim(),
    }
    let result
    if (item?.id) {
      try { await api.components.update(item.id, payload); result = {} } catch (error) { result = { error } }
    } else {
      try { await api.components.create(payload); result = {} } catch (error) { result = { error } }
    }
    if (result.error) {
      setError(`Не удалось сохранить компонент: ${result.error.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="tab-card">
      <div className="card-header">
        <h2>{item ? 'Редактировать компонент' : 'Новый компонент'}</h2>
        {item && <span className="card-id">ID: {item.id}</span>}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-grid">
        <div className="form-group full">
          <label>Название *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="например: Резистор 10 кОм" />
        </div>

        <div className="form-group">
          <label>Категория</label>
          <input list="categories-list" value={form.category} onChange={e => set('category', e.target.value)} placeholder="Введите категорию" />
          <datalist id="categories-list">
            {categories.map(category => <option key={category} value={category} />)}
          </datalist>
        </div>

        <div className="form-group">
          <label>Номинал</label>
          <input value={form.nominal} onChange={e => set('nominal', e.target.value)} placeholder="10 кОм / 100 мкФ 16В" />
        </div>

        <div className="form-group">
          <label>Корпус</label>
          <input value={form.package} onChange={e => set('package', e.target.value)} list="packages-list" placeholder="0402 / DIP-28 / TO-220" />
          <datalist id="packages-list">{PACKAGES.map(p => <option key={p} value={p} />)}</datalist>
        </div>

        <div className="form-group">
          <label>Производитель</label>
          <input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} placeholder="Yageo, Nichicon, LCSC..." />
        </div>

        <div className="form-group">
          <label>Артикул / Штрихкод</label>
          <div className="input-with-hint">
            <input value={form.article} onChange={e => set('article', e.target.value)} placeholder="RC0402FR-0710KL" />
            <span className="scan-hint" title="Сканер заполнит это поле автоматически">📷 сканер</span>
          </div>
        </div>

        <div className="form-group full">
          <label>Заметка</label>
          <textarea rows={3} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Личные заметки, ссылки, особенности..." />
        </div>
      </div>

      <div className="card-actions">
        <button className="btn-cancel" onClick={onCancel}>Отмена</button>
        <button className="btn-save" onClick={save} disabled={saving}>
          {saving ? 'Сохраняю...' : (item ? 'Сохранить изменения' : 'Добавить компонент')}
        </button>
      </div>
    </div>
  )
}
