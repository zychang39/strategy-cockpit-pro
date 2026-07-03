import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// base "./" → GitHub Pages 子路徑與本機 http.server 都能跑
export default defineConfig({
  base: "./",
  plugins: [preact()],
  build: { outDir: "dist", target: "es2020" },
});
