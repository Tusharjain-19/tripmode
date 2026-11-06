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
          const RefreshRuntime = {
            injectIntoGlobalHook(w) {},
            register(type, id) {},
            createSignatureFunctionForTransform() { return (type) => type; },
            registerExportsForReactRefresh() {},
            validateRefreshBoundaryAndEnqueueUpdate() {},
            performReactRefresh() {},
            isLikelyComponentType(type) { return true; },
            collectCustomHooksForSignature() {},
            setSignature() {},
            getFamilyByID() { return undefined; },
            getFamilyByType() { return undefined; },
            hasUnrecoverableErrors() { return false; },
            _getMountedRootCount() { return 0; },
          };
          export function injectIntoGlobalHook(w) {}
          export function register(type, id) {}
          export function createSignatureFunctionForTransform() { return (type) => type; }
          export function registerExportsForReactRefresh() {}
          export function validateRefreshBoundaryAndEnqueueUpdate() {}
          export function performReactRefresh() {}
          export function isLikelyComponentType(type) { return true; }
          export function collectCustomHooksForSignature() {}
          export function setSignature() {}
          export function getFamilyByID() { return undefined; }
          export function getFamilyByType() { return undefined; }
          export function hasUnrecoverableErrors() { return false; }
          export function _getMountedRootCount() { return 0; }
          export const __hmr_import = (m) => import(m);
          export default RefreshRuntime;
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
