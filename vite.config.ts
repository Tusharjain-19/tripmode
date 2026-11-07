import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  resolve: {
    dedupe: ["react", "react-dom"],
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  build: {
    target: "es2022",
    cssMinify: true,
    reportCompressedSize: false,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    command === "build" && nitro({ defaultPreset: "cloudflare-module" }),
  ].filter(Boolean),
}));
