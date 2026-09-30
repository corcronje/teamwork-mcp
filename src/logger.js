/**
 * Structured JSON logger for Teamwork MCP server
 * Logs to stderr to avoid polluting MCP protocol output on stdout
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL_NAMES = Object.keys(LOG_LEVELS);

export class Logger {
  constructor(options = {}) {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() || "info";
    this.level = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
    this.name = options.name || "teamwork-mcp";
  }

  _shouldLog(levelName) {
    return LOG_LEVELS[levelName] >= this.level;
  }

  _log(levelName, message, context = {}) {
    if (!this._shouldLog(levelName)) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      name: this.name,
      message,
      ...context,
    };

    // Add stack trace for errors
    if (context.error instanceof Error) {
      logEntry.stack = context.error.stack;
      logEntry.errorMessage = context.error.message;
      // Remove the error object from logged context to avoid circular references
      delete logEntry.error;
    }

    // Log to stderr to keep stdout clean for MCP protocol
    console.error(JSON.stringify(logEntry));
  }

  debug(message, context = {}) {
    this._log("debug", message, context);
  }

  info(message, context = {}) {
    this._log("info", message, context);
  }

  warn(message, context = {}) {
    this._log("warn", message, context);
  }

  error(message, context = {}) {
    this._log("error", message, context);
  }

  /**
   * Log an API request
   */
  logRequest(method, url, { status, duration, error } = {}) {
    if (error) {
      this.error(`API request failed: ${method} ${url}`, {
        method,
        url,
        status,
        durationMs: duration,
        error,
      });
    } else {
      this.debug(`API request: ${method} ${url}`, {
        method,
        url,
        status,
        durationMs: duration,
      });
    }
  }

  /**
   * Log a tool call
   */
  logToolCall(toolName, args, { status, duration, error } = {}) {
    if (error) {
      this.warn(`Tool call failed: ${toolName}`, {
        tool: toolName,
        durationMs: duration,
        error,
      });
    } else {
      this.debug(`Tool call: ${toolName}`, {
        tool: toolName,
        argsKeys: Object.keys(args).join(", "),
        durationMs: duration,
      });
    }
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();
