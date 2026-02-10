import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from '../Login'

// Mock de supabase
const mockSignIn = vi.fn()
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: any[]) => mockSignIn(...args),
    },
  },
  isSupabaseConfigured: true,
}))

// Mock de useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza el formulario de login correctamente', () => {
    renderLogin()

    expect(screen.getByText('FEB parking')).toBeInTheDocument()
    expect(screen.getByText('Inicia sesión para continuar')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument()
    expect(screen.getByText(/¿No tienes cuenta\? Regístrate/i)).toBeInTheDocument()
  })

  it('permite escribir en los campos de email y contraseña', async () => {
    const user = userEvent.setup()
    renderLogin()

    const emailInput = screen.getByPlaceholderText('Correo electrónico')
    const passwordInput = screen.getByPlaceholderText('Contraseña')

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')

    expect(emailInput).toHaveValue('test@example.com')
    expect(passwordInput).toHaveValue('password123')
  })

  it('llama a signInWithPassword al enviar el formulario', async () => {
    mockSignIn.mockResolvedValue({
      data: { session: { user: { id: 'test-id' } } },
      error: null,
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('Correo electrónico'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Contraseña'), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })
  })

  it('navega al inicio tras login exitoso', async () => {
    mockSignIn.mockResolvedValue({
      data: { session: { user: { id: 'test-id' } } },
      error: null,
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('Correo electrónico'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Contraseña'), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('muestra error si las credenciales son incorrectas', async () => {
    mockSignIn.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('Correo electrónico'), 'bad@example.com')
    await user.type(screen.getByPlaceholderText('Contraseña'), 'wrong')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
    })
  })

  it('muestra mensaje específico si el email no está confirmado', async () => {
    mockSignIn.mockResolvedValue({
      data: { session: null },
      error: { message: 'Email not confirmed' },
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('Correo electrónico'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Contraseña'), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByText(/confirma tu email/i)).toBeInTheDocument()
    })
  })

  it('muestra texto de cargando durante el login', async () => {
    // Hacer que signIn no resuelva inmediatamente
    mockSignIn.mockImplementation(() => new Promise(() => {}))

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('Correo electrónico'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Contraseña'), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    expect(screen.getByText('Iniciando sesión...')).toBeInTheDocument()
  })

  it('el enlace de registro apunta a /register', () => {
    renderLogin()
    const registerLink = screen.getByText(/¿No tienes cuenta\? Regístrate/i)
    expect(registerLink).toHaveAttribute('href', '/register')
  })
})
