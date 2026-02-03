/**
 * Error Types for Soul-MCP
 *
 * Provides categorized errors for better error handling and debugging.
 */

/**
 * Base error class for all soul-mcp errors
 */
export class SoulError extends Error {
  constructor(message: string, public code: string, public category: ErrorCategory) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error categories for different failure types
 */
export type ErrorCategory = "database" | "parsing" | "validation" | "notFound" | "conflict";

/**
 * Database connection or operation errors (transient or permanent)
 */
export class DatabaseError extends SoulError {
  constructor(message: string, public isTransient: boolean = false) {
    super(message, "DB_ERROR", "database");
    this.isTransient = isTransient;
  }
}

/**
 * Data parsing errors (JSON, metadata, etc.)
 */
export class ParsingError extends SoulError {
  constructor(
    message: string,
    public fieldName: string,
    public rawValue: unknown
  ) {
    super(message, "PARSE_ERROR", "parsing");
  }
}

/**
 * Input validation errors
 */
export class ValidationError extends SoulError {
  constructor(message: string, public fieldName?: string) {
    super(message, "VALIDATION_ERROR", "validation");
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends SoulError {
  constructor(message: string, public resourceType: string, public resourceId: string) {
    super(message, "NOT_FOUND", "notFound");
  }
}

/**
 * Conflict errors (duplicate, constraint violation, etc.)
 */
export class ConflictError extends SoulError {
  constructor(message: string, public conflictType: string) {
    super(message, "CONFLICT", "conflict");
  }
}

/**
 * Helper to determine if an error is transient (should retry)
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof DatabaseError) {
    return error.isTransient;
  }

  // Check for common transient error patterns
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection refused") ||
    message.includes("econnrefused") ||
    message.includes("503") ||
    message.includes("502")
  );
}

/**
 * Retry with exponential backoff for transient errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    shouldRetry = isTransientError,
  } = options;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt or if error is not retryable
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 0.3 * delay;
      const actualDelay = Math.min(delay + jitter, maxDelayMs);

      console.error(
        `Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(actualDelay)}ms:`,
        error
      );

      await new Promise((resolve) => setTimeout(resolve, actualDelay));
      delay *= 2; // Exponential backoff
    }
  }

  throw lastError;
}
