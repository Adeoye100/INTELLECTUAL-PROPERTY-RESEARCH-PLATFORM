/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        heading: ['Bebas Neue', 'Impact', 'sans-serif'],
        special: ['ITC Garamond', 'Garamond', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: '#146575',
          hover: '#0F4A57',
        },
        // Brand — navy-to-teal gradient
        'forge-navy': {
          DEFAULT: '#0A1428',
          950: '#0A1428',   // deep navy, gradient start (top)
          800: '#0E2540',
        },
        'forge-teal': {
          100: '#D8EEF2',
          700: '#0F4A57',
          600: '#146575',   // teal, gradient end (bottom)
        },

        // Metallic accent
        'forge-silver': {
          100: '#E7EAEE',
          300: '#B9C1CA',
          400: '#AAB4C0',
          500: '#8B939E',
          600: '#75808D',
          700: '#5B6470',
          800: '#3C4652',
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
        'risk-low': '#166B46',
        'risk-medium': '#765400',
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
