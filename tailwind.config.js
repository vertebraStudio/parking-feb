/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
      theme: {
        extend: {
          colors: {
            primary: {
              DEFAULT: '#111C4E', // Azul oscuro principal
            },
            accent: {
              DEFAULT: '#FF9E1B', // Naranja acento principal
            },
            success: {
              DEFAULT: '#10b981', // Verde esmeralda para plazas libres
            },
            danger: {
              DEFAULT: '#ef4444', // Rojo para ocupación
            },
            surface: {
              DEFAULT: '#f8fafc', // Gris muy claro para fondos
            },
          },
      borderRadius: {
        'xl': '1rem',      // 16px - más redondeado
        '2xl': '1.5rem',   // 24px - muy redondeado
        '3xl': '2rem',     // 32px - extremadamente redondeado
      },
    },
  },
  plugins: [],
}
