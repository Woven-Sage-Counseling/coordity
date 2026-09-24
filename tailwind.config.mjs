/** @type {import('tailwindcss').Config} */
const portal = (name) =>
  `rgb(var(--portal-${name}) / calc(var(--portal-${name}-a, 1) * <alpha-value>))`;

export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: portal('cream') },
        sage: {
          DEFAULT: portal('sage'),
          light: portal('sage-light'),
          dark: portal('sage-dark'),
        },
        accent: { DEFAULT: portal('accent') },
        brand: { DEFAULT: portal('primary') },
        onbrand: { DEFAULT: portal('on-primary') },
        onaccent: { DEFAULT: portal('on-accent') },
        charcoal: { DEFAULT: portal('charcoal') },
        surface: { DEFAULT: portal('surface') },
        muted: { DEFAULT: 'rgb(var(--portal-muted) / <alpha-value>)' },
        coordity: {
          blue: 'rgb(var(--coordity-blue) / <alpha-value>)',
          bright: 'rgb(var(--coordity-blue-bright) / <alpha-value>)',
          yellow: 'rgb(var(--coordity-yellow) / <alpha-value>)',
          soft: 'rgb(var(--coordity-yellow-soft) / <alpha-value>)',
        },
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
