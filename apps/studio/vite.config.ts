import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, searchForWorkspaceRoot } from "vite";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appRoot, "../..");

export default defineConfig({
  root: appRoot,
  publicDir: path.resolve(repoRoot, "apps/web-basic/public"),
  server: {
    host: "0.0.0.0",
    port: 4175,
    fs: {
      allow: [searchForWorkspaceRoot(repoRoot)],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4175,
  },
  build: {
    outDir: path.resolve(repoRoot, "dist-vite/studio"),
    emptyOutDir: true,
  },
});
