import type { Config } from 'tailwindcss';

// Colors are CSS variables (src/index.css) so a light theme or a re-skin only
// changes tokens, never components.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        info: 'hsl(var(--info))',
      },
      borderRadius: { lg: '1rem', md: '0.75rem', sm: '0.5rem' },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px hsl(240 25% 8% / 0.05), 0 8px 24px -8px hsl(240 25% 8% / 0.12)',
        glow: '0 8px 20px -6px hsl(var(--primary) / 0.55)',
      },
      backgroundColor: { scrim: 'hsl(var(--scrim))' },
    },
  },
  plugins: [],
} satisfies Config;
