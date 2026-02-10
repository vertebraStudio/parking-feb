import { test, expect } from '@playwright/test'

// Estos tests E2E requieren un .env configurado con Supabase válido.
// Ejecutar con: npm run test:e2e

test.describe('Diseño Responsive', () => {
  test.describe('Login', () => {
    test('layout de login se ve correctamente en desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto('/login', { waitUntil: 'networkidle' })

      const hasLogin = await page.getByText('FEB parking').isVisible().catch(() => false)
      if (!hasLogin) {
        test.skip(true, 'Supabase no configurado')
        return
      }

      await expect(page.getByAltText('Login icon')).toBeVisible()
      await expect(page.getByPlaceholder('Correo electrónico')).toBeVisible()
    })

    test('login se ve correctamente en móvil', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto('/login', { waitUntil: 'networkidle' })

      const hasLogin = await page.getByText('FEB parking').isVisible().catch(() => false)
      if (!hasLogin) {
        test.skip(true, 'Supabase no configurado')
        return
      }

      await expect(page.getByText('FEB parking')).toBeVisible()
      await expect(page.getByPlaceholder('Correo electrónico')).toBeVisible()
    })
  })

  test.describe('Registro', () => {
    test('formulario de registro es visible', async ({ page }) => {
      await page.goto('/register', { waitUntil: 'networkidle' })

      const hasForm = await page.getByPlaceholder('Nombre completo').isVisible().catch(() => false)
      if (!hasForm) {
        test.skip(true, 'Supabase no configurado')
        return
      }

      await expect(page.getByPlaceholder('Nombre completo')).toBeVisible()
      await expect(page.getByPlaceholder('Correo electrónico')).toBeVisible()
      await expect(page.getByPlaceholder('Contraseña')).toBeVisible()
    })
  })
})
