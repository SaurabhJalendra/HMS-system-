const viteApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const packagedDefaultApiUrl = "http://13.235.103.44:3000/api";
const initialApiUrl =
  viteApiUrl && !(import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(viteApiUrl))
    ? viteApiUrl
    : import.meta.env.DEV
      ? viteApiUrl || "http://localhost:3000/api"
      : packagedDefaultApiUrl;

// Environment configuration
export const config = {
  // Packaged builds default to the clinic server. Runtime value is persisted
  // in Electron userData (see runtimeApiUrl.ts) so updates do not reset localhost.
  API_URL: initialApiUrl,
  
  // Application Configuration
  APP_NAME: import.meta.env.VITE_APP_NAME || 'HMS Desktop',
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  HOSPITAL_NAME: import.meta.env.VITE_HOSPITAL_NAME || 'Your Hospital Name',
  
  // Development Configuration
  DEBUG: import.meta.env.VITE_DEBUG === 'true',
  ENABLE_LOGGING: import.meta.env.VITE_ENABLE_LOGGING === 'true',
  
  // Feature Flags
  ENABLE_OFFLINE_MODE: import.meta.env.VITE_ENABLE_OFFLINE_MODE === 'true',
  ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  
  // API Timeout
  API_TIMEOUT: 30000, // 5 seconds - reduced for faster retries during backend restarts
  
  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};

export default config;
