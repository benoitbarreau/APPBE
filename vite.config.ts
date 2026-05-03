import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? "/",
  server: {
    port: 5173,
    host: true,
    watch: {
      // Polling so file changes from outside Vite (e.g. git pull on
      // Windows) are detected reliably.
      usePolling: true,
      interval: 300,
    },
  },
});
