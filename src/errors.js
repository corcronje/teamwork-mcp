/**
 * Custom error types for Teamwork MCP server
 * Maps to MCP error codes and provides structured error context
 */

/**
 * Base custom error class with MCP compliance
 */
export class MCPError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || "INTERNAL_ERROR";
    this.status = options.status || 500;
    this.context = options.context || {};
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;

    // Maintain proper prototype chain for instanceof checks. Must use new.target
    // (not MCPError.prototype), otherwise every subclass instance is downgraded to
    // a plain MCPError and `instanceof ValidationError` etc. silently fail.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert to MCP-compliant error response
   */
  toMCPError() {
    return {
      code: this.code,
      message: this.message,
      data: {
        status: this.status,
        context: this.context,
        retryable: this.retryable,
        ...(this.retryAfterMs && { retryAfterMs: this.retryAfterMs }),
      },
    };
  }
}

/**
 * Request validation error (400 Bad Request)
 * Returned when input validation fails
 */
export class ValidationError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "INVALID_REQUEST",
      status: 400,
      retryable: false,
      ...options,
    });
  }
}

/**
 * Authentication error (401 Unauthorized)
 * Returned when API credentials are invalid or missing
 */
export class AuthenticationError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "AUTHENTICATION_FAILED",
      status: 401,
      retryable: false,
      ...options,
    });
  }
}

/**
 * Authorization error (403 Forbidden)
 * Returned when user lacks permission for an operation
 */
export class AuthorizationError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "FORBIDDEN",
      status: 403,
      retryable: false,
      ...options,
    });
  }
}

/**
 * Not found error (404 Not Found)
 * Returned when a resource doesn't exist
 */
export class NotFoundError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "NOT_FOUND",
      status: 404,
      retryable: false,
      ...options,
    });
  }
}

/**
 * Server error (500+ Internal Server Error)
 * Returned for unexpected server-side failures
 */
export class ServerError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "INTERNAL_ERROR",
      status: 500,
      retryable: true,
      ...options,
    });
  }
}

/**
 * Timeout error
 * Returned when a request exceeds the timeout limit
 */
export class TimeoutError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "REQUEST_TIMEOUT",
      status: 504,
      retryable: true,
      retryAfterMs: options.retryAfterMs || 1000,
      ...options,
    });
  }
}

/**
 * Rate limit error (429 Too Many Requests)
 * Returned when API rate limits are exceeded
 */
export class RateLimitError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "RATE_LIMIT_EXCEEDED",
      status: 429,
      retryable: true,
      retryAfterMs: options.retryAfterMs || 60000,
      ...options,
    });
  }
}

/**
 * Parse Teamwork API error response and return appropriate MCPError
 * @param {Response} response - Fetch response object
 * @param {string|object} data - Parsed response body
 * @param {{method?: string}} [meta] - Request metadata (fetch Response has no .method)
 * @returns {MCPError}
 */
export function parseTeamworkError(response, data, { method } = {}) {
  const status = response.status;
  const message = extractErrorMessage(data);
  const baseContext = {
    status,
    url: response.url,
    method,
  };

  if (status === 401 || status === 403) {
    if (status === 401) {
      return new AuthenticationError(`Teamwork authentication failed: ${message}`, {
        context: baseContext,
      });
    }
    return new AuthorizationError(`Teamwork authorization failed: ${message}`, {
      context: baseContext,
    });
  }

  if (status === 404) {
    return new NotFoundError(`Teamwork resource not found: ${message}`, {
      context: baseContext,
    });
  }

  if (status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
    return new RateLimitError(`Teamwork rate limit exceeded: ${message}`, {
      context: baseContext,
      retryAfterMs,
    });
  }

  if (status >= 500) {
    return new ServerError(`Teamwork server error (${status}): ${message}`, {
      context: baseContext,
    });
  }

  if (status >= 400) {
    return new ValidationError(`Teamwork request error (${status}): ${message}`, {
      context: baseContext,
    });
  }

  return new ServerError(`Teamwork API error (${status}): ${message}`, {
    context: baseContext,
  });
}

/**
 * Extract human-readable error message from Teamwork API response
 * @param {string|object} data - Response body
 * @returns {string}
 */
function extractErrorMessage(data) {
  if (typeof data === "string") {
    return data.slice(0, 200); // Truncate very long messages
  }

  if (!data || typeof data !== "object") {
    return "Unknown error";
  }

  // Teamwork error shapes seen on a live site:
  //   v3: { errors: [{ title, detail }] }  |  { message }
  //   v1: { MESSAGE, STATUS: "Error" }     |  { content: { message } }
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors
      .map((e) => (e && typeof e === "object" ? [e.title, e.detail].filter(Boolean).join(": ") || JSON.stringify(e) : String(e)))
      .join("; ")
      .slice(0, 500);
  }
  if (data.error) return String(data.error).slice(0, 500);
  if (data.message) return String(data.message).slice(0, 500);
  if (data.MESSAGE) return String(data.MESSAGE).slice(0, 500);
  if (data.content && typeof data.content === "object" && data.content.message) {
    return String(data.content.message).slice(0, 500);
  }
  if (data.errorMessage) return String(data.errorMessage).slice(0, 500);
  if (data.raw) return String(data.raw).slice(0, 200);

  return "Unknown error";
}

/**
 * Format validation errors (e.g., from Zod) into readable error messages
 * @param {import('zod').ZodError} zodError - Zod validation error
 * @returns {string}
 */
export function formatValidationError(zodError) {
  if (!zodError.issues || !Array.isArray(zodError.issues)) {
    return "Validation failed";
  }

  const messages = zodError.issues.map((issue) => {
    const path = issue.path.join(".");
    const code = issue.code;
    let detail = issue.message;

    // Provide more specific guidance based on validation code
    if (code === "invalid_type") {
      detail = `expected ${issue.expected}, received ${issue.received}`;
    } else if (code === "too_small") {
      detail = `must be at least ${issue.minimum}`;
    } else if (code === "too_big") {
      detail = `must be at most ${issue.maximum}`;
    }

    return path ? `${path}: ${detail}` : detail;
  });

  return messages.join("; ");
}
