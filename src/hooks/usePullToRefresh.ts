import { useEffect, useRef, useState, useCallback } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void
  enabled?: boolean
  threshold?: number // Distancia mínima en píxeles para activar el refresh
}

export function usePullToRefresh({ onRefresh, enabled = true, threshold = 80 }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pullDistanceRef = useRef(0)

  // Memoizar la función de refresh para evitar recreaciones
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
      setPullDistance(0)
      pullDistanceRef.current = 0
    }
  }, [onRefresh, isRefreshing])

  useEffect(() => {
    if (!enabled) return

    const getScrollTop = () => {
      // Intentar obtener el scroll del window primero (más común en esta app)
      try {
        const container = containerRef.current
        return window.scrollY || document.documentElement.scrollTop || (container?.scrollTop || 0)
      } catch {
        return 0
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      try {
        // Solo activar si estamos en la parte superior de la página
        const scrollTop = getScrollTop()
        if (scrollTop === 0 && !isRefreshing && e.touches && e.touches.length > 0) {
          startY.current = e.touches[0].clientY
        }
      } catch (err) {
        console.error('Error in handleTouchStart:', err)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      try {
        if (startY.current === null || isRefreshing || !e.touches || e.touches.length === 0) return
        
        const scrollTop = getScrollTop()
        if (scrollTop > 0) {
          startY.current = null
          setPullDistance(0)
          pullDistanceRef.current = 0
          return
        }

        const currentY = e.touches[0].clientY
        const distance = currentY - startY.current

        // Solo permitir deslizar hacia abajo
        if (distance > 0) {
          // Resistencia: hacer que sea más difícil de tirar después del threshold
          const resistance = distance > threshold ? threshold + (distance - threshold) * 0.3 : distance
          setPullDistance(resistance)
          pullDistanceRef.current = resistance
          e.preventDefault() // Prevenir el scroll nativo mientras tiramos
        }
      } catch (err) {
        console.error('Error in handleTouchMove:', err)
      }
    }

    const handleTouchEnd = async () => {
      try {
        if (startY.current === null) return

        const currentDistance = pullDistanceRef.current
        if (currentDistance >= threshold && !isRefreshing) {
          await handleRefresh()
        } else {
          setPullDistance(0)
          pullDistanceRef.current = 0
        }

        startY.current = null
      } catch (err) {
        console.error('Error in handleTouchEnd:', err)
        startY.current = null
        setPullDistance(0)
        pullDistanceRef.current = 0
      }
    }

    // Solo usar window para los event listeners ya que el scroll está en window
    try {
      window.addEventListener('touchstart', handleTouchStart, { passive: false })
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleTouchEnd)
    } catch (err) {
      console.error('Error adding event listeners:', err)
    }

    return () => {
      try {
        window.removeEventListener('touchstart', handleTouchStart)
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleTouchEnd)
      } catch (err) {
        console.error('Error removing event listeners:', err)
      }
    }
  }, [enabled, handleRefresh, threshold, isRefreshing])

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
  }
}
