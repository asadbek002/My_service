import type { Config } from 'tailwindcss';

// Brand (spec §67): ink on paper, hairline rules; colour is reserved for order status.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#111113', soft: '#3A3A3D' },
        paper: '#FAFAF9',
        line: '#E6E6E3',
        mute: '#6B6B67',
        border: '#E6E6E3',
        ring: '#111113',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      borderRadius: { lg: '0.75rem', md: '0.625rem', sm: '0.5rem' },
    },
  },
  plugins: [],
};

export default config;
