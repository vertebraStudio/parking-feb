import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
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

  const checkPushStatus = async () => {
    if (!isFirebaseConfigured) return

    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const { data: tokens, error } = await supabase
        .from('push_tokens')
        .select('id')
        .eq('user_id', auth.user.id)
        .limit(1)

      if (!error && tokens && tokens.length > 0) {
        setPushStatus('enabled')
      }
    } catch {
      // no-op
    }
  }

  useEffect(() => {
    loadNotifications()
    checkPushStatus()

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

  const deleteNotification = async (n: AppNotification, e: React.MouseEvent) => {
    e.stopPropagation() // Evitar que se marque como leída al hacer clic en borrar
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', n.id)

      if (error) throw error
      setItems(prev => prev.filter(x => x.id !== n.id))
    } catch (e: any) {
      setError(e.message || 'Error al borrar la notificación')
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

  const disablePush = async () => {
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', auth.user.id)

      if (error) throw error
      setPushStatus('idle')
    } catch (e: any) {
      setError(e.message || 'No se pudo desactivar push.')
    }
  }

  const handlePushToggle = async () => {
    if (pushStatus === 'enabled') {
      await disablePush()
    } else {
      await enablePush()
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

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 font-medium">
              {pushStatus === 'enabled' ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}
            </span>
            <button
              onClick={handlePushToggle}
              disabled={pushStatus === 'enabling' || !isFirebaseConfigured}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                pushStatus === 'enabled' ? 'bg-orange-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  pushStatus === 'enabled' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
        {!isFirebaseConfigured && (
          <p className="text-gray-600 text-xs mt-3">
            Falta configurar Firebase (variables <span className="font-semibold">VITE_FIREBASE_*</span> y{' '}
            <span className="font-semibold">VITE_FIREBASE_VAPID_KEY</span>) en el entorno de build.
          </p>
        )}
        {pushStatus === 'enabling' && (
          <p className="text-gray-600 text-xs mt-3">Activando notificaciones push...</p>
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
            <div
              key={n.id}
              className="relative rounded-[20px] p-4 border border-gray-200 bg-white"
            >
              <button
                onClick={() => markAsRead(n)}
                className="w-full text-left active:scale-[0.99] transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-900 font-semibold flex items-center gap-1">
                      <span className="truncate">
                        {n.type === 'booking_confirmed'
                          ? n.title.replace(/^✅\s*/, '')
                          : n.title}
                      </span>
                      {n.type === 'booking_confirmed' && (
                        <span className="flex-shrink-0">✅</span>
                      )}
                    </p>
                    <p className="text-gray-600 text-sm mt-1">{n.body}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!n.read_at && (
                      <span
                        className="mt-1 inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: '#FF9500' }}
                        aria-label="No leída"
                      />
                    )}
                    <button
                      onClick={(e) => deleteNotification(n, e)}
                      className="p-1.5 rounded-[8px] hover:bg-red-50 active:scale-95 transition-colors"
                      title="Borrar notificación"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                </p>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

