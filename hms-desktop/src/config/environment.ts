// Environment configuration
export const config = {
  // API Configuration
  // Base URL must end with /api (Express mounts REST under /api/...). Override with VITE_API_URL at build time.
  API_URL: import.meta.env.VITE_API_URL || 'http://13.207.41.110:3000/api',
  
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
