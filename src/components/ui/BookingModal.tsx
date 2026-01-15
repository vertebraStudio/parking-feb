import { useState, useMemo, useEffect } from 'react'
import { X, Users, Search } from 'lucide-react'
import { Profile } from '../../types'
import { cn } from '../../lib/utils'

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (carpoolUserId: string | null) => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  loading?: boolean
  availableCarpoolUsers: Profile[]
  loadingCarpoolUsers: boolean
  selectedCarpoolUser: string | null
  onSelectCarpoolUser: (userId: string | null) => void
}

export default function BookingModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  loading = false,
  availableCarpoolUsers,
  loadingCarpoolUsers,
  selectedCarpoolUser,
  onSelectCarpoolUser,
}: BookingModalProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Limpiar búsqueda cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
    }
  }, [isOpen])

  // Filtrar usuarios según la búsqueda
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableCarpoolUsers
    }
    
    const query = searchQuery.toLowerCase().trim()
    return availableCarpoolUsers.filter(profile => {
      const fullName = (profile.full_name || '').toLowerCase()
      const email = (profile.email || '').toLowerCase()
      return fullName.includes(query) || email.includes(query)
    })
  }, [availableCarpoolUsers, searchQuery])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          disabled={loading}
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-2 pr-8">{title}</h2>
        <p className="text-gray-600 mb-4">{message}</p>

        {/* Selector de carpooling */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            <Users className="w-4 h-4 inline mr-1" strokeWidth={2.5} />
            ¿Vas en coche con alguien? (Opcional)
          </label>
          {loadingCarpoolUsers ? (
            <p className="text-sm text-gray-500">Cargando usuarios...</p>
          ) : (
            <>
              {/* Buscador */}
              {availableCarpoolUsers.length > 0 && (
                <div className="mb-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar por nombre o email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    onSelectCarpoolUser(null)
                    setSearchQuery('')
                  }}
                  className={cn(
                    "w-full p-3 rounded-[12px] border text-left transition-all",
                    !selectedCarpoolUser
                      ? "bg-orange-50 border-orange-300 text-orange-900"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <span className="font-medium">Solo yo</span>
                </button>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => onSelectCarpoolUser(profile.id)}
                      className={cn(
                        "w-full p-3 rounded-[12px] border text-left transition-all",
                        selectedCarpoolUser === profile.id
                          ? "bg-orange-50 border-orange-300 text-orange-900"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      <span className="font-medium">
                        {profile.full_name || profile.email?.split('@')[0] || 'Usuario'}
                      </span>
                      {profile.email && (
                        <span className="block text-xs text-gray-500 mt-0.5">
                          {profile.email}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  searchQuery && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No se encontraron usuarios
                    </p>
                  )
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setSearchQuery('')
              onClose()
            }}
            disabled={loading}
            className={cn(
              'flex-1 px-4 py-2 border border-gray-300 rounded-xl font-medium',
              'hover:bg-gray-50 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              if (!loading) {
                setSearchQuery('')
                onConfirm(selectedCarpoolUser)
              }
            }}
            disabled={loading}
            className={cn(
              'flex-1 px-4 py-2 text-white rounded-xl font-medium',
              'transition-opacity bg-[#FF9E1B] hover:bg-[#FF9E1B]/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {loading ? 'Cargando...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
