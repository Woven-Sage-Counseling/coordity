/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: 'rgb(var(--portal-cream) / <alpha-value>)' },
        sage: {
          DEFAULT: 'rgb(var(--portal-sage) / <alpha-value>)',
          light: 'rgb(var(--portal-sage-light) / <alpha-value>)',
          dark: 'rgb(var(--portal-sage-dark) / <alpha-value>)',
        },
        accent: { DEFAULT: 'rgb(var(--portal-accent) / <alpha-value>)' },
        charcoal: { DEFAULT: 'rgb(var(--portal-charcoal) / <alpha-value>)' },
        surface: { DEFAULT: 'rgb(var(--portal-surface) / <alpha-value>)' },
        muted: { DEFAULT: 'rgb(var(--portal-muted) / <alpha-value>)' },
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
