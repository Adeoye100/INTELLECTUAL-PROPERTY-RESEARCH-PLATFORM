/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand — navy-to-teal gradient
        'forge-navy': {
          950: '#0A1428',   // deep navy, gradient start (top)
          800: '#0E2540',
        },
        'forge-teal': {
          700: '#0F4A57',
          600: '#146575',   // teal, gradient end (bottom)
        },

        // Metallic accent
        'forge-silver': {
          100: '#E7EAEE',
          300: '#B9C1CA',
          500: '#8B939E',
          700: '#5B6470',
        },

        // Text on dark brand surfaces
        'forge-text-onDark': '#FFFFFF',
        'forge-subtext-onDark': '#9FC2D4',

        // Working-surface neutrals
        'surface-base': '#F8FAFC',
        'surface-card': '#FFFFFF',
        'text-primary': '#0E2540',
        'text-secondary': '#5B6470',

        // Risk semantics
        'risk-low': '#1E8A5B',
        'risk-medium': '#B8860B',
        'risk-high': '#B3261E',
      },
      backgroundImage: {
        'forge-gradient': 'linear-gradient(180deg, #0A1428 0%, #146575 100%)',
      },
      spacing: {
        'grid': '8px',
      },
    },
  },
  plugins: [],
}
