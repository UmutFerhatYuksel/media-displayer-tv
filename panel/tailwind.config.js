/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sıcak-turuncu tema (TV app markasıyla uyumlu). HSL token'lar üzerinden.
        bg: 'hsl(20 40% 6%)',
        surface: 'hsl(20 30% 10%)',
        'surface-2': 'hsl(20 24% 14%)',
        border: 'hsl(28 18% 20%)',
        'border-strong': 'hsl(28 20% 28%)',
        text: 'hsl(30 25% 96%)',
        muted: 'hsl(30 14% 64%)',
        primary: {
          DEFAULT: 'hsl(22 90% 56%)',
          fg: 'hsl(20 45% 8%)',
          hover: 'hsl(22 90% 60%)',
        },
        accent: 'hsl(35 92% 60%)',
        danger: 'hsl(0 72% 58%)',
        ok: 'hsl(150 60% 45%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 8px 30px -8px hsl(22 90% 56% / 0.35)',
        card: '0 1px 2px hsl(20 40% 2% / 0.4), 0 8px 24px -12px hsl(20 40% 2% / 0.6)',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
      },
    },
  },
  plugins: [],
};
