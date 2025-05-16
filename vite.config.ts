import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.ts",
      external: [
        "express",
        "fs",
        "path",
        "http",
        "url",
        "nanoid"
      ]
    },
    target: "node18",
    ssr: true,
    minify: false
  },
});
