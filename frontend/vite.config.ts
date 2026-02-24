import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 4000,
    allowedHosts: "all",
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

