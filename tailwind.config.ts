import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0B0F",
        onyx: "#12121A",
        champagne: "#D8C07A",
        bone: "#F4F1EA",
        smoke: "#B8B6C5"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.25)"
      }
    },
  },
  plugins: [],
} satisfies Config;
