import winston from 'winston';
import path from 'path';
import fs from 'fs';

// backend/logs — works from api/utils (dev) and dist/utils (PM2 production)
const backendRoot = path.join(__dirname, '../..');
const logsDir = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.join(backendRoot, 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const maxSize = parseInt(process.env.LOG_MAX_SIZE || '10485760', 10); // 10MB default
const maxFiles = parseInt(process.env.LOG_MAX_FILES || '10', 10);
const enableDebugFile = process.env.LOG_ENABLE_DEBUG_FILE !== 'false';
const legacyLogFile = process.env.LOG_FILE_PATH
  ? path.resolve(process.env.LOG_FILE_PATH.startsWith('.') ? path.join(backendRoot, process.env.LOG_FILE_PATH) : process.env.LOG_FILE_PATH)
  : path.join(logsDir, 'hms.log');

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, context, ...metadata }) => {
    let msg = `[${timestamp}] ${level}`;
    if (context) {
      msg += ` [${context}]`;
    }
    msg += `: ${message}`;

    if (Object.keys(metadata).length > 0 && metadata.constructor === Object) {
      const filteredMeta = { ...metadata };
      delete filteredMeta.service;
      if (Object.keys(filteredMeta).length > 0) {
        const metaStr = JSON.stringify(filteredMeta);
        if (metaStr !== '{}') {
          msg += ` ${metaStr}`;
        }
      }
    }
    return msg;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/** Only pass through entries matching a single winston level. */
const levelFilter = (level: string) =>
  winston.format((info) => (info.level === level ? info : false))();

const fileTransportDefaults = {
  maxsize: maxSize,
  maxFiles,
  tailable: true,
};

const createCombinedFileTransport = () =>
  new winston.transports.File({
    ...fileTransportDefaults,
    filename: path.join(logsDir, 'combined.log'),
  });

const categoryTransports: winston.transport[] = [
  createCombinedFileTransport(),
  new winston.transports.File({
    ...fileTransportDefaults,
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
  }),
  new winston.transports.File({
    ...fileTransportDefaults,
    filename: path.join(logsDir, 'warn.log'),
    level: 'warn',
  }),
  // Legacy alias — same JSON stream as combined.log for tools expecting hms.log
  new winston.transports.File({
    ...fileTransportDefaults,
    filename: legacyLogFile,
  }),
];

if (enableDebugFile) {
  categoryTransports.push(
    new winston.transports.File({
      ...fileTransportDefaults,
      filename: path.join(logsDir, 'debug.log'),
      format: winston.format.combine(fileFormat, levelFilter('debug')),
    })
  );
}

const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat,
  defaultMeta: { service: 'hms-backend' },
  transports: categoryTransports,
  exceptionHandlers: [
    new winston.transports.File({
      ...fileTransportDefaults,
      filename: path.join(logsDir, 'exceptions.log'),
    }),
    createCombinedFileTransport(),
    new winston.transports.Console({ format: consoleFormat }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      ...fileTransportDefaults,
      filename: path.join(logsDir, 'rejections.log'),
    }),
    createCombinedFileTransport(),
    new winston.transports.Console({ format: consoleFormat }),
  ],
});

logger.add(
  new winston.transports.Console({
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true,
    silent: false,
  })
);

export const loggerWithContext = (context: string) => ({
  debug: (message: string, meta?: any) => logger.debug(message, { context, ...meta }),
  info: (message: string, meta?: any) => logger.info(message, { context, ...meta }),
  warn: (message: string, meta?: any) => logger.warn(message, { context, ...meta }),
  error: (message: string, error?: Error | any, meta?: any) => {
    if (error instanceof Error) {
      logger.error(message, {
        context,
        error: error.message,
        stack: error.stack,
        ...meta,
      });
    } else {
      logger.error(message, { context, ...error, ...meta });
    }
  },
});

/** Structured log for user / audit actions — always info so it lands in combined.log */
export const logAction = (
  action: string,
  meta: Record<string, unknown> = {}
) => {
  logger.info(action, { context: 'Action', ...meta });
};

export const getLogsDirectory = () => logsDir;

export default logger;
