import type { Config } from 'tailwindcss';

/**
 * Tokens portados 1:1 de plataforma.html / site.html / entregador.html.
 * As variÃ¡veis CSS originais (--orange, --gray-*, --radius-*, --shadow-*)
 * continuam existindo em globals.css; aqui elas viram utilitÃ¡rios Tailwind
 * para que os componentes React reproduzam o mesmo visual sem reinventar
 * escala de cor ou espaÃ§amento.
 */
const config: Config = {
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#F15A24',
          dark: '#D44914',
          light: '#FFF3EE',
          soft: '#FFEDE5',
        },
        ink: {
          DEFAULT: '#0D0D0D',
          900: '#1A1A1A',
          800: '#2A2A2A',
          700: '#444444',
          600: '#555555',
          500: '#777777',
          400: '#999999',
          300: '#C5C5C5',
          200: '#E5E5E5',
          100: '#F5F5F5',
          50: '#FAFAFA',
        },
        success: { DEFAULT: '#10B981', bg: '#ECFDF5' },
        danger: { DEFAULT: '#EF4444', bg: '#FEF2F2' },
        info: { DEFAULT: '#3B82F6', bg: '#EFF6FF' },
        warn: { DEFAULT: '#F59E0B', bg: '#FFFBEB' },
        accent: { DEFAULT: '#8B5CF6', bg: '#F5F3FF' },
        teal: { DEFAULT: '#14B8A6', bg: '#F0FDFA' },
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '14px',
        lg: '20px',
        xl: '28px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0,0,0,0.04)',
        sm: '0 2px 8px rgba(0,0,0,0.06)',
        md: '0 8px 24px rgba(0,0,0,0.08)',
        lg: '0 16px 48px rgba(0,0,0,0.10)',
        xl: '0 24px 64px rgba(0,0,0,0.12)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(.25,.1,.25,1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-in': 'fade-in .28s cubic-bezier(.25,.1,.25,1)',
        'slide-in-right': 'slide-in-right .3s cubic-bezier(.25,.1,.25,1)',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;

