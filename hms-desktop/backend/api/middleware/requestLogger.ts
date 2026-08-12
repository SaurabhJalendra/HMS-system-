import { Request, Response, NextFunction } from 'express';
import logger, { logAction } from '../utils/logger';

const SKIP_PATHS = (process.env.LOG_SKIP_PATHS || '/health,/api/version')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const isSkippedPath = (path: string) =>
  SKIP_PATHS.some((skip) => path === skip || path.startsWith(`${skip}/`));

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  if (!isSkippedPath(req.path)) {
    logger.info(`📥 ${req.method} ${req.path}`, {
      context: 'HTTP',
      direction: 'in',
      method: req.method,
      path: req.path,
      url: req.originalUrl || req.url,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      username: (req as any).user?.username,
      userId: (req as any).user?.id,
      role: (req as any).user?.role,
    });
  }

  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusColor = statusCode >= 500 ? '🔴' : statusCode >= 400 ? '🟡' : '🟢';
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    if (!isSkippedPath(req.path)) {
      const payload = {
        context: 'HTTP',
        direction: 'out',
        method: req.method,
        path: req.path,
        statusCode,
        duration: `${duration}ms`,
        durationMs: duration,
        username: (req as any).user?.username,
        userId: (req as any).user?.id,
        role: (req as any).user?.role,
        ip: req.ip,
      };

      logger[logLevel](`📤 ${statusColor} ${req.method} ${req.path} - ${statusCode}`, payload);

      // Explicit action trail for mutating API calls (create/update/delete)
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && statusCode < 500) {
        logAction(`${req.method} ${req.path} → ${statusCode}`, {
          ...payload,
          actionType: 'api_mutation',
        });
      }
    }

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};
