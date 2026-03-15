import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [".onrender.com"],
    hmr: {
      overlay: false,
    },
    proxy: {
      "/ext-api/bigtournament": {
        target: "https://bigtournament-1.onrender.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ext-api\/bigtournament/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean,
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ms: path.resolve(__dirname, "./src/shims/ms.js"),
    },
  },
}));
