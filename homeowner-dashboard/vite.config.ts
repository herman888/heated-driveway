import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";

/** Matches {@code HTTP_PORT} in {@code HeatingDrivewayFirmata.java} (default 8080). */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const elevenKey = env.VITE_ELEVENLABS_API_KEY?.trim();

  const proxy: Record<string, ProxyOptions> = {};

  /** Dev-only: forward TTS to ElevenLabs with server-injected `xi-api-key` (avoids browser CORS). */
  if (elevenKey) {
    proxy["/api-elevenlabs"] = {
      target: "https://api.elevenlabs.io",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api-elevenlabs/, ""),
      configure: (p) => {
        p.on("proxyReq", (proxyReq) => {
          proxyReq.setHeader("xi-api-key", elevenKey);
        });
      },
    };
  }

  proxy["/api"] = {
    target: "http://127.0.0.1:8080",
    changeOrigin: true,
  };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy,
    },
  };
});
