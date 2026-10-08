import { defineConfig } from "vite";

// base relativa: funciona em https://<usuario>.github.io/<repositorio>/ e em domínio próprio
export default defineConfig({
  base: "./",
  build: { outDir: "dist", assetsInlineLimit: 0, target: "es2020" },
});
