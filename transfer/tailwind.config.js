/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          'apple-gray': '#F5F5F7',
          'apple-blue': '#007AFF',
          'apple-blue-hover': '#0062CC',
          'glass-border': 'rgba(255, 255, 255, 0.5)',
        },
        backdropBlur: {
          'xs': '2px',
        },
        fontFamily: {
          sans: [
            '-apple-system',
            'BlinkMacSystemFont',
            '"SF Pro Text"',
            '"Helvetica Neue"',
            'Arial',
            'sans-serif',
          ],
        },
        animation: {
          'fade-in': 'fadeIn 0.5s ease-out',
          'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        },
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0' },
            '100%': { opacity: '1' },
          },
          slideUp: {
            '0%': { transform: 'translateY(20px)', opacity: '0' },
            '100%': { transform: 'translateY(0)', opacity: '1' },
          },
        },
      },
    },
    plugins: [],
  }