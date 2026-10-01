import { useRef, useState } from 'react'
import { api } from './lib/api'
import TabList from './components/TabList'
import TabCard from './components/TabCard'
import TabAvailability from './components/TabAvailability'
import TabOrganizer from './components/TabOrganizer'
import './App.css'

export default function App() {
  const [activeTab, setActiveTab] = useState('list')
  const [editItem, setEditItem] = useState(null)
  const importRef = useRef(null)
  const restoreRef = useRef(null)

  const openEdit = (item) => {
    setEditItem(item)
    setActiveTab('card')
  }

  const openNew = () => {
    setEditItem(null)
    setActiveTab('card')
  }

  const onSaved = () => {
    setEditItem(null)
    setActiveTab('list')
  }

  const makeBackup = async () => {
    try {
      const result = await api.backup()
      alert(`Резервная копия создана: ${result.file}`)
    } catch (error) {
      alert(`Не удалось создать резервную копию: ${error.message}`)
    }
  }

  const exportDatabase = async () => {
    try {
      const blob = await api.exportData()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `warehouse-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(`Не удалось экспортировать базу: ${error.message}`)
    }
  }

  const importDatabase = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!window.confirm('Импорт полностью заменит текущие данные. Продолжить?')) return
    try {
      const data = JSON.parse(await file.text())
      const result = await api.importData(data)
      alert(`Импорт завершён. Компонентов: ${result.components}, записей наличия: ${result.inventory}`)
      window.location.reload()
    } catch (error) {
      alert(`Не удалось импортировать базу: ${error.message}`)
    }
  }

  const restoreDatabase = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!window.confirm('Восстановление заменит текущую базу. Продолжить?')) return
    try {
      await api.restoreDatabase(file)
      alert('База восстановлена. Текущая версия сохранена в резервную копию.')
      window.location.reload()
    } catch (error) {
      alert(`Не удалось восстановить базу: ${error.message}`)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">Склад компонентов</span>
        </div>
        <nav className="tabs">
          <button className={activeTab === 'list' ? 'tab active' : 'tab'} onClick={() => setActiveTab('list')}>
            📋 База компонентов
          </button>
          <button className={activeTab === 'availability' ? 'tab active' : 'tab'} onClick={() => setActiveTab('availability')}>
            📦 Наличие
          </button>
          <button className={activeTab === 'card' ? 'tab active' : 'tab'} onClick={() => { setEditItem(null); setActiveTab('card') }}>
            ✏️ Карточка
          </button>
          <button className={activeTab === 'organizer' ? 'tab active' : 'tab'} onClick={() => setActiveTab('organizer')}>
            🗄️ Органайзер
          </button>
        </nav>
        <div className="topbar-actions">
          <button className="btn-signout" onClick={exportDatabase}>⬇️ Экспорт</button>
          <button className="btn-signout" onClick={() => importRef.current?.click()}>⬆️ Импорт</button>
          <button className="btn-signout" onClick={() => restoreRef.current?.click()}>♻️ Восстановить</button>
          <button className="btn-signout" onClick={makeBackup}>💾 Копия</button>
          <input ref={importRef} type="file" accept="application/json,.json" onChange={importDatabase} hidden />
          <input ref={restoreRef} type="file" accept="application/octet-stream,.db" onChange={restoreDatabase} hidden />
        </div>
      </header>

      <main className="content">
        {activeTab === 'list' && <TabList onEdit={openEdit} onNew={openNew} />}
        {activeTab === 'availability' && <TabAvailability />}
        {activeTab === 'card' && <TabCard item={editItem} onSaved={onSaved} onCancel={() => setActiveTab('list')} />}
        {activeTab === 'organizer' && <TabOrganizer onEdit={openEdit} />}
      </main>
    </div>
  )
}
