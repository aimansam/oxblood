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
      borderRadius: { lg: '0.375rem', md: '0.25rem', sm: '0.125rem' },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px hsl(var(--primary) / 0.5), 0 0 18px hsl(var(--primary) / 0.25)',
        'glow-success': '0 0 0 1px hsl(var(--success) / 0.5), 0 0 18px hsl(var(--success) / 0.25)',
      },
      backgroundColor: { scrim: 'hsl(var(--scrim))' },
    },
  },
  plugins: [],
} satisfies Config;
