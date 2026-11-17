import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    rolldownOptions: {
      input: {
        storefront: "index.html",
        admin: "admin.html",
      },
    },
  },
});
