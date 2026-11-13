/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--rgb-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--rgb-surface) / <alpha-value>)',
          elevated: 'rgb(var(--rgb-surface-elevated) / <alpha-value>)',
          secondary: 'var(--bg-surface-secondary)',
        },
        line: {
          DEFAULT: 'rgb(var(--rgb-border) / <alpha-value>)',
          strong: 'var(--border-strong)',
          glass: 'var(--border-glass)',
        },
        ink: {
          DEFAULT: 'rgb(var(--rgb-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--rgb-text-secondary) / <alpha-value>)',
          muted: 'var(--text-muted)',
        },
        amber: {
          DEFAULT: 'rgb(var(--rgb-amber) / <alpha-value>)',
          fg: 'var(--accent-amber-fg)',
          soft: 'var(--accent-amber-soft)',
        },
        terracotta: {
          DEFAULT: 'rgb(var(--rgb-terracotta) / <alpha-value>)',
          fg: 'var(--accent-terracotta-fg)',
          soft: 'var(--accent-terracotta-soft)',
        },
        sage: {
          DEFAULT: 'rgb(var(--rgb-sage) / <alpha-value>)',
          fg: 'var(--accent-sage-fg)',
          soft: 'var(--accent-sage-soft)',
        },
        beige: {
          DEFAULT: 'rgb(var(--rgb-beige) / <alpha-value>)',
          fg: 'var(--accent-beige-fg)',
          soft: 'var(--accent-beige-soft)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        serif: ['Literata', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.375rem',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        elevated: 'var(--shadow-elevated)',
        'amber-glow': 'var(--glow-amber)',
      },
      screens: {
        xs: '360px',
        desktop: '1024px',
        wide: '1440px',
      },
    },
  },
  plugins: [],
};
