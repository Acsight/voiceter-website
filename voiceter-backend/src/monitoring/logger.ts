import winston from 'winston';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogData {
  sessionId?: string;
  event?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  sessionId?: string;
  event?: string;
  message?: string;
  data?: LogData;
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private winstonLogger: winston.Logger;
  private logLevel: LogLevel;

  constructor(logLevel: LogLevel = 'INFO') {
    this.logLevel = logLevel;

    // Create Winston logger with JSON format
    this.winstonLogger = winston.createLogger({
      level: this.mapLogLevel(logLevel),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(this.formatConsoleOutput)
          ),
        }),
        // Always write to combined.log for debugging
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.json(),
        }),
      ],
    });

    // Add error-only file transport in production
    if (process.env.NODE_ENV === 'production') {
      this.winstonLogger.add(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.json(),
        })
      );
    }
  }

  private mapLogLevel(level: LogLevel): string {
    const levelMap: Record<LogLevel, string> = {
      DEBUG: 'debug',
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
    };
    return levelMap[level];
  }

  private formatConsoleOutput(info: any): string {
    const { timestamp, level, message, sessionId, event, ...rest } = info;
    let output = `${timestamp} [${level}]`;
    
    if (sessionId) {
      output += ` [${sessionId}]`;
    }
    
    if (event) {
      output += ` ${event}`;
    }
    
    if (message) {
      output += `: ${message}`;
    }
    
    if (Object.keys(rest).length > 0) {
      output += ` ${JSON.stringify(rest)}`;
    }
    
    return output;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    data?: LogData,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
    };

    if (data?.sessionId) {
      entry.sessionId = data.sessionId;
    }

    if (data?.event) {
      entry.event = data.event;
    }

    if (message) {
      entry.message = message;
    }

    if (data) {
      const { sessionId, event, ...rest } = data;
      if (Object.keys(rest).length > 0) {
        entry.data = rest;
      }
    }

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
      };
      
      // Include error code if available
      if ('code' in error) {
        entry.error.code = (error as any).code;
      }
    }

    return entry;
  }

  debug(message: string, data?: LogData): void {
    const entry = this.createLogEntry('DEBUG', message, data);
    this.winstonLogger.debug(entry);
  }

  info(message: string, data?: LogData): void {
    const entry = this.createLogEntry('INFO', message, data);
    this.winstonLogger.info(entry);
  }

  warn(message: string, data?: LogData): void {
    const entry = this.createLogEntry('WARN', message, data);
    this.winstonLogger.warn(entry);
  }

  error(message: string, dataOrError?: LogData | Error, error?: Error): void {
    let logData: LogData | undefined;
    let logError: Error | undefined;

    // Handle overloaded parameters
    if (dataOrError instanceof Error) {
      logError = dataOrError;
    } else {
      logData = dataOrError;
      logError = error;
    }

    const entry = this.createLogEntry('ERROR', message, logData, logError);
    this.winstonLogger.error(entry);
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.winstonLogger.level = this.mapLogLevel(level);
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }
}

// Create singleton instance
let loggerInstance: Logger | null = null;

export function createLogger(logLevel?: LogLevel): Logger {
  if (!loggerInstance) {
    // Read log level from environment if not provided
    const envLogLevel = process.env.LOG_LEVEL as LogLevel;
    const effectiveLogLevel = logLevel || envLogLevel || 'INFO';
    loggerInstance = new Logger(effectiveLogLevel);
  }
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    // Read log level from environment
    const envLogLevel = process.env.LOG_LEVEL as LogLevel;
    loggerInstance = new Logger(envLogLevel || 'INFO');
  }
  return loggerInstance;
}

export { Logger };
export default Logger;
