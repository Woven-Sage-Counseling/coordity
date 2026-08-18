/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#F7F4EE' },
        sage: {
          DEFAULT: '#788F75',
          light: '#96A693',
          dark: '#535F51',
        },
        accent: { DEFAULT: '#B9B5AE' },
        charcoal: { DEFAULT: '#3A3A38' },
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
