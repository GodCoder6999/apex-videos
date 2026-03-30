/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primeBg: '#0f171e',
        primeHover: '#1a242f',
        primeBlue: '#00a8e1'
      }
    },
  },
  plugins: [],
}