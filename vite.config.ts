import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

function reactRefreshRuntimePlugin(): Plugin {
  return {
    name: "vite:react-refresh-runtime",
    resolveId(id) {
      if (id === "/@react-refresh") return id;
      return null;
    },
    load(id) {
      if (id === "/@react-refresh") {
        return `
          export function injectIntoGlobalHook(w) {}
          export function register() {}
          export function createSignatureFunctionForTransform() { return (type) => type; }
          export function registerExportsForReactRefresh() {}
          export function validateRefreshBoundaryAndEnqueueUpdate() {}
          export const __hmr_import = (m) => import(m);
          export default { injectIntoGlobalHook(w) {} };
        `;
      }
      return null;
    },
  };
}

export default defineConfig(({ command }) => ({
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    target: "es2022",
    cssMinify: true,
    reportCompressedSize: false,
  },
  plugins: [
    tailwindcss(),
    reactRefreshRuntimePlugin(),
    tanstackStart({
      server: { entry: "server" },
    }),
    command === "build" && nitro({ defaultPreset: "cloudflare-module" }),
  ].filter(Boolean),
}));
