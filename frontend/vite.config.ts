import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 4000,
    allowedHosts: ["feuille.temps.globalti.ngrok.app"],
    proxy: {
      "/api": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
    },
    hmr: {
        overlay: false
    }
  },
  optimizeDeps: {
    force: true // Force dependency pre-bundling
  }
});

