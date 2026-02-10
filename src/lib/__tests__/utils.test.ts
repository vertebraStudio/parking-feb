import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn (className merge utility)', () => {
  it('combina clases simples', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2')
  })

  it('resuelve conflictos de Tailwind (última gana)', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6')
  })

  it('maneja valores condicionales', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
  })

  it('ignora valores falsy (undefined, null, false)', () => {
    expect(cn('base', undefined, null, false, '')).toBe('base')
  })

  it('combina variantes responsivas correctamente', () => {
    expect(cn('p-4', 'lg:p-6')).toBe('p-4 lg:p-6')
  })

  it('resuelve conflictos en variantes responsivas', () => {
    expect(cn('lg:p-4', 'lg:p-8')).toBe('lg:p-8')
  })

  it('devuelve string vacío sin argumentos', () => {
    expect(cn()).toBe('')
  })
})
