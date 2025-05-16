import { defineConfig } from "vite";

export default defineConfig({
  // Add your Vite config options here
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.ts"
    },
    target: "node18",
    ssr: true,
    minify: false
  },
  // You can add more config as needed
});
