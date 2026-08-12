/**
 * PM2 process definition for the HMS / ZenHosp API.
 * Prisma + Express expect cwd = this folder so dotenv loads ./.env
 *
 * Usage (after build): pm2 start ecosystem.config.cjs
 * @see docs/PM2-Backend-Service-Guide.md
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'zenhosp-api',
      cwd: __dirname,
      script: 'dist/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 15,
      min_uptime: '10s',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        LOG_ENABLE_DEBUG_FILE: 'true',
        LOG_DIR: path.join(__dirname, 'logs'),
        LOG_FILE_PATH: path.join(__dirname, 'logs', 'hms.log'),
      },
      // PM2 process stdout/stderr (Winston also writes to backend/logs/*.log)
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      error_file: path.join(__dirname, 'logs', 'pm2-error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
