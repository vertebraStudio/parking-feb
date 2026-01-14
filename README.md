# Parking App - PWA

Aplicación PWA Mobile First para la gestión de parking de empresa.

## Stack Tecnológico

- **Frontend**: React 18 + TypeScript + Vite
- **Estilos**: Tailwind CSS
- **Backend**: Supabase (Auth + Database)
- **Routing**: React Router DOM
- **PWA**: Vite Plugin PWA
- **Iconos**: Lucide React

## Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Configurar variables de entorno:
```bash
cp .env.example .env
```

Edita el archivo `.env` y añade tus credenciales de Supabase:
- `VITE_SUPABASE_URL`: URL de tu proyecto Supabase
- `VITE_SUPABASE_ANON_KEY`: Clave anónima de tu proyecto Supabase

3. Ejecutar en desarrollo:
```bash
npm run dev
```

4. Construir para producción:
```bash
npm run build
```

## Estructura del Proyecto

```
src/
├── components/        # Componentes reutilizables
│   ├── ui/           # Componentes UI base
│   └── Layout.tsx    # Layout principal con navegación
├── pages/            # Páginas de la aplicación
├── hooks/            # Custom hooks
├── lib/              # Utilidades y configuraciones
│   ├── supabase.ts   # Cliente de Supabase
│   └── utils.ts      # Utilidades generales
└── types/            # Tipos TypeScript
```

## Características

- ✅ PWA con manifest configurado
- ✅ Diseño Mobile First
- ✅ Navegación inferior (Bottom Nav)
- ✅ Integración con Supabase
- ✅ TypeScript para type safety
- ✅ Tailwind CSS para estilos

## Próximos Pasos

1. Configurar autenticación con Supabase
2. Implementar vista de mapa de plazas
3. Implementar gestión de reservas
4. Implementar panel de administración
