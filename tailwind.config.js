/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-red': '#FF0000',
      },
      boxShadow: {
        'neon-red': '0 0 5px #FF0000, 0 0 10px #FF0000, 0 0 20px #FF0000',
      },
      animation: {
        'glow': 'glow 4s ease-in-out infinite alternate',
        'hex-scroll': 'hex-scroll 60s linear infinite',
      },
      keyframes: {
        glow: {
          'from': { 
            borderColor: 'rgba(255, 0, 0, 0.5)',
            boxShadow: '0 0 5px #FF0000, 0 0 10px #FF0000' 
          },
          'to': { 
            borderColor: 'rgba(255, 0, 0, 0.8)',
            boxShadow: '0 0 15px #FF0000, 0 0 25px #FF0000' 
          },
        },
        'hex-scroll': {
          '0%': { 'background-position': '0 0' },
          '100%': { 'background-position': '-200px -200px' },
        },
      }
    },
  },
  plugins: [],
}