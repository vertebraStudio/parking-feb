import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { registerPushTokenForCurrentUser } from '../lib/pushNotifications'
import { isFirebaseConfigured } from '../lib/firebase'
import type { AppNotification } from '../types'

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AppNotification[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabling' | 'enabled'>('idle')

  const unreadCount = useMemo(() => items.filter(n => !n.read_at).length, [items])

  const loadNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setItems([])
        setError('Debes iniciar sesión para ver tus notificaciones.')
        return
      }

      const { data, error: nError } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (nError) throw nError
      setItems((data || []) as AppNotification[])
    } catch (e: any) {
      setError(e.message || 'Error cargando notificaciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => loadNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markAsRead = async (n: AppNotification) => {
    if (n.read_at) return
    try {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', n.id)
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
    } catch {
      // no-op
    }
  }

  const enablePush = async () => {
    setPushStatus('enabling')
    setError(null)
    try {
      const result = await registerPushTokenForCurrentUser()
      if (result.permission !== 'granted') {
        setPushStatus('idle')
        setError('Permiso de notificaciones no concedido.')
        return
      }
      setPushStatus('enabled')
    } catch (e: any) {
      setPushStatus('idle')
      setError(e.message || 'No se pudo activar push.')
    }
  }

  return (
    <div className="p-4 min-h-screen bg-white">
      <h1
        className="text-3xl font-semibold text-gray-900 tracking-tight mb-4"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
          letterSpacing: '-0.5px',
        }}
      >
        Notificaciones
      </h1>

      <div className="rounded-[20px] p-4 border border-gray-200 bg-gray-50 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-gray-900 font-semibold">Bandeja</p>
            <p className="text-gray-600 text-sm">
              {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
            </p>
          </div>

          <button
            onClick={enablePush}
            disabled={pushStatus === 'enabling' || !isFirebaseConfigured}
            className="px-4 py-2 rounded-[14px] font-semibold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#FF9500',
              boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)',
            }}
          >
            {pushStatus === 'enabled'
              ? 'Push activadas'
              : pushStatus === 'enabling'
              ? 'Activando...'
              : !isFirebaseConfigured
              ? 'Push no configuradas'
              : 'Activar push'}
          </button>
        </div>
        {!isFirebaseConfigured && (
          <p className="text-gray-600 text-xs mt-3">
            Falta configurar Firebase (variables <span className="font-semibold">VITE_FIREBASE_*</span> y{' '}
            <span className="font-semibold">VITE_FIREBASE_VAPID_KEY</span>) en el entorno de build.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-[14px] border border-red-300 bg-red-50">
          <p className="text-red-800 text-sm font-medium">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-600">Cargando...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[20px] p-4 border border-gray-200 bg-white">
          <p className="text-gray-700 font-medium">No tienes notificaciones todavía.</p>
          <p className="text-gray-600 text-sm mt-1">
            Cuando un admin confirme una reserva, aparecerá aquí y te llegará una push.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => markAsRead(n)}
              className="w-full text-left rounded-[20px] p-4 border border-gray-200 bg-white active:scale-[0.99] transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-gray-900 font-semibold truncate">{n.title}</p>
                  <p className="text-gray-600 text-sm mt-1">{n.body}</p>
                </div>
                {!n.read_at && (
                  <span
                    className="mt-1 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#FF9500' }}
                    aria-label="No leída"
                  />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

