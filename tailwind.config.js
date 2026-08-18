/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pinkku: {
          50: '#fff1f6',
          100: '#ffe4ee',
          200: '#fecddf',
          300: '#fea3c5',
          400: '#fc6b9f',
          500: '#f43f7d',
          600: '#e11d62',
          700: '#be124e',
          800: '#9d1343',
          900: '#83143c',
          brand: '#FF2D85',
        }
      }
    },
  },
  plugins: [],
}
