// Función auxiliar para enviar push notifications directamente desde el cliente
// Se usa como fallback cuando la Edge Function falla con 401
// NOTA: Esto requiere que FCM_SERVER_KEY esté disponible en el cliente (no es ideal para seguridad)

import { supabase } from './supabase'

export async function sendPushNotificationDirectly(
  userId: string,
  title: string,
  body: string,
  data: any = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    // Obtener tokens del usuario
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId)

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError)
      return { success: false, error: tokensError.message }
    }

    const tokenList = (tokens || []).map((t: any) => t.token).filter(Boolean)
    if (tokenList.length === 0) {
      console.log('No push tokens found for user')
      return { success: false, error: 'No tokens found' }
    }

    // IMPORTANTE: Para enviar push desde el cliente, necesitaríamos FCM_SERVER_KEY
    // Pero esto NO es seguro exponerlo en el cliente
    // Por ahora, esta función solo está preparada pero no se puede usar sin FCM_SERVER_KEY
    
    console.warn('⚠️ Cannot send push from client - FCM_SERVER_KEY should not be exposed')
    return { success: false, error: 'Cannot send push from client (security restriction)' }
  } catch (error: any) {
    console.error('Error in sendPushNotificationDirectly:', error)
    return { success: false, error: error.message }
  }
}
