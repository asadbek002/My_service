import type { Config } from 'tailwindcss';

// Brand (spec §67): ink on paper, hairline rules; status colours mean status.
// One signal colour, `brand` orange, marks the main action (Yangi qabul), the active place and today's figure.
// It is always a fill with ink on it, never text on white (3:1 fails), so it can't be confused with amber debt text.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#111113', soft: '#3A3A3D' },
        brand: { DEFAULT: '#FF6A2B', strong: '#F25418', soft: '#FFF0E8' },
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
      borderRadius: { xl: '1rem', lg: '0.75rem', md: '0.625rem', sm: '0.5rem' },
    },
  },
  plugins: [],
};

export default config;
