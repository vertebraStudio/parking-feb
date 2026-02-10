import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock completo de supabase (necesario para todos los componentes que se renderizan)
const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()

const mockChainable = () => {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.neq = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.then = vi.fn((resolve: any) => resolve({ data: [], error: null }))
  return chain
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
    },
    from: vi.fn(() => mockChainable()),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    })),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    },
  },
  isSupabaseConfigured: true,
}))

vi.mock('../lib/firebase', () => ({
  messaging: null,
  getFirebaseToken: vi.fn(),
}))

vi.mock('../lib/pushNotifications', () => ({
  requestPushPermission: vi.fn(),
  isPushSupported: vi.fn().mockReturnValue(false),
}))

// Mock scrollTo (no disponible en jsdom)
window.scrollTo = vi.fn()

import App from '../App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
    window.history.pushState({}, '', '/parking-feb/')
  })

  it('muestra pantalla de carga inicialmente', () => {
    mockGetSession.mockReturnValue(new Promise(() => {}))
    render(<App />)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('redirige al login si no hay sesión', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    window.history.pushState({}, '', '/parking-feb/login')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('FEB parking')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Correo electrónico')).toBeInTheDocument()
    })
  })

  it('no muestra el formulario de login si hay sesión activa', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'test-user' } } },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Correo electrónico')).not.toBeInTheDocument()
    })
  })
})
