import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config
export default defineConfig(async ({ mode }) => {
  // Dynamic import for ESM-only package
  const react = await import("@vitejs/plugin-react");
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiUrl = env.VITE_API_URL || process.env.VITE_API_URL || "";

  return {
    plugins: [react.default()],
    envDir: process.cwd(),
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
    },
    resolve: {
      alias: {
        '@': '/src'
      }
    },
  };
});
