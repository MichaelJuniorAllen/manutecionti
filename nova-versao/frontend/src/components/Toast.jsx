import { useEffect, useState } from 'react'

let toastCounter = 0

export function showToast(message, type = 'info') {
  window.dispatchEvent(
    new CustomEvent('nova-versao:toast', {
      detail: {
        id: toastCounter += 1,
        message,
        type
      }
    })
  )
}

export default function Toast() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const handleToast = (event) => {
      const toast = event.detail
      setToasts((current) => [...current, toast])
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id))
      }, 3600)
    }

    window.addEventListener('nova-versao:toast', handleToast)
    return () => window.removeEventListener('nova-versao:toast', handleToast)
  }, [])

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-indicator" />
          <div>
            <strong>{toast.type === 'error' ? 'Erro' : 'Notificação'}</strong>
            <p>{toast.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
