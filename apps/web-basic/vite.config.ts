import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, searchForWorkspaceRoot } from "vite";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appRoot, "../..");

export default defineConfig({
  root: appRoot,
  publicDir: path.resolve(appRoot, "public"),
  server: {
    host: "0.0.0.0",
    port: 4173,
    fs: {
      allow: [searchForWorkspaceRoot(repoRoot)],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  build: {
    outDir: path.resolve(repoRoot, "dist-vite/web-basic"),
    emptyOutDir: true,
  },
});
