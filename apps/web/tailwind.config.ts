import type { Config } from 'tailwindcss';

// "Verstak" (workbench): ink on cool paper, the repair-bench mat for the loud surfaces,
// one signal orange (`brand`) for the single main action. Status colours always sit next to a word.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0C1615', soft: '#2B3836' },
        mat: { DEFAULT: '#0F2E2C', soft: '#173D3A' },
        brand: { DEFAULT: '#FF6A2B', strong: '#F25418', soft: '#FFF0E8' },
        paper: '#EEF2F1',
        line: '#DCE3E1',
        mute: '#5A6866',
        border: '#DCE3E1',
        ring: '#0C1615',
        tick: '#D5DDDB',
        st: {
          qabul: '#7A8A87', 'qabul-ink': '#4E5D5B',
          tamir: '#2F62F5', 'tamir-ink': '#2350D6',
          tayyor: '#13A15B', 'tayyor-ink': '#0C7A43',
          kutish: '#F08C00', 'kutish-ink': '#9A5300',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { xl: '1.125rem', lg: '0.875rem', md: '0.625rem', sm: '0.5rem' },
    },
  },
  plugins: [],
};

export default config;
