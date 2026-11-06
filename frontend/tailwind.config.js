/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#ECE4D4', light: '#F5F0E6', dark: '#E2D8C4' },
        brick: { DEFAULT: '#B42F27', dark: '#8E241E', tint: '#E0BFB1', soft: '#F0DCD4' },
        ink: { DEFAULT: '#212121', 2: '#5A5550', 3: '#8A837A' },
        line: '#D8CDB8',
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
}
