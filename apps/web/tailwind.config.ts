import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0c0f",
        surface: "#121317",
        "surface-2": "#17191f",
        line: "#24262e",
        fg: "#e8eaf0",
        muted: "#9aa1ad",
        brand: "#7c5cff",
        pink: "#ff5c8a",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
export default config;
