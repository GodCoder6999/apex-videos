/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primeBg: '#00050D',
        primeHover: '#333333',
        primeBlue: '#00a8e1'
      }
    },
  },
  plugins: [],
}
