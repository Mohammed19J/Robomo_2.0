/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  darkMode: "class", // or 'media' or false
  theme: {
    extend: {
      gridAutoRows: {
        max: "max-content",
      },
      backgroundImage: {
        map: "url('Assets/Map/mapWhite_square.png')",
        mapDark: "url('Assets/Map/mapDark.png')",
      },
      animation: {
        shake: "shake 0.3s ease-in-out",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%, 75%": { transform: "translateX(-4px)" },
          "50%": { transform: "translateX(4px)" },
        },
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
