import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FAF6F0",
          100: "#F5ECE1",
          200: "#EBDDCB",
          300: "#DFCAB1",
          400: "#CFB494",
          500: "#BC9B75",
        },
        wood: {
          50: "#F6F1ED",
          100: "#EADDCF",
          200: "#D3B99F",
          300: "#B89270",
          400: "#9C7047",
          500: "#7E5431",
          600: "#654124",
          700: "#4F311A",
          800: "#3B2211",
          900: "#2B170B",
          950: "#1A0C05",
        },
      },
    },
  },
  plugins: [],
};
export default config;
