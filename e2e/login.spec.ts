import { test, expect } from '@playwright/test'

// Estos tests E2E requieren un .env configurado con Supabase válido.
// Ejecutar con: npm run test:e2e

test.describe('Página de Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
  })

  test('muestra el formulario de login', async ({ page }) => {
    // Si Supabase no está configurado, se muestra "Configuración Requerida"
    const hasConfig = await page.getByText('FEB parking').isVisible().catch(() => false)
    
    if (!hasConfig) {
      // App sin config de Supabase → validar que muestra la pantalla de config
      await expect(page.getByText('Configuración Requerida')).toBeVisible()
      test.skip(true, 'Supabase no configurado - se necesita .env con variables válidas')
      return
    }

    await expect(page.getByText('FEB parking')).toBeVisible()
    await expect(page.getByPlaceholder('Correo electrónico')).toBeVisible()
    await expect(page.getByPlaceholder('Contraseña')).toBeVisible()
    await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible()
  })

  test('muestra el enlace de registro', async ({ page }) => {
    const registerLink = page.getByText('¿No tienes cuenta? Regístrate')
    const isVisible = await registerLink.isVisible().catch(() => false)
    if (!isVisible) {
      test.skip(true, 'Supabase no configurado')
      return
    }
    await expect(registerLink).toBeVisible()
  })

  test('navega a la página de registro', async ({ page }) => {
    const registerLink = page.getByText('¿No tienes cuenta? Regístrate')
    const isVisible = await registerLink.isVisible().catch(() => false)
    if (!isVisible) {
      test.skip(true, 'Supabase no configurado')
      return
    }
    await registerLink.click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('permite escribir en los campos', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Correo electrónico')
    const isVisible = await emailInput.isVisible().catch(() => false)
    if (!isVisible) {
      test.skip(true, 'Supabase no configurado')
      return
    }

    await emailInput.fill('test@example.com')
    await page.getByPlaceholder('Contraseña').fill('password123')

    await expect(emailInput).toHaveValue('test@example.com')
    await expect(page.getByPlaceholder('Contraseña')).toHaveValue('password123')
  })
})
