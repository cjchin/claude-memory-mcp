/**
 * Error Handler - Unified error handling for MCP tools
 *
 * Provides consistent error handling patterns across all tool implementations.
 * Standardizes error messages, logging, and user-facing error responses.
 */

/**
 * Standard MCP tool response format
 */
interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

/**
 * Wrap a tool handler with error handling
 *
 * Catches any errors thrown by the handler and returns a user-friendly error response.
 * Logs errors to console for debugging.
 *
 * @param handler - Async function to wrap
 * @param context - Context string for error messages (e.g., "creating memory link")
 * @returns Wrapped handler that never throws
 *
 * @example
 * ```typescript
 * server.tool("my_tool", schema,
 *   toolSafeWrapper(
 *     async (params) => {
 *       // Your tool logic here
 *       return { content: [{ type: "text", text: "Success!" }] };
 *     },
 *     "executing my_tool"
 *   )
 * );
 * ```
 */
export function toolSafeWrapper<T extends any[]>(
  handler: (...args: T) => Promise<ToolResponse>,
  context: string
): (...args: T) => Promise<ToolResponse> {
  return async (...args: T): Promise<ToolResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      // Log to console for server-side debugging
      console.error(`Error ${context}:`, error);

      // Return user-friendly error message
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed ${context}: ${errorMessage}`
        }]
      };
    }
  };
}

/**
 * Format an error message for display
 *
 * @param error - Error object or message
 * @returns Formatted error string
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    // Include stack trace for debugging (first 3 lines)
    const stackLines = error.stack?.split("\n").slice(0, 3).join("\n") || "";
    return `${error.message}${stackLines ? `\n\n${stackLines}` : ""}`;
  }
  return String(error);
}

/**
 * Create a standardized error response
 *
 * @param context - Context string (e.g., "saving memory")
 * @param error - Error object or message
 * @returns MCP tool response object
 */
export function errorResponse(context: string, error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : String(error);

  return {
    content: [{
      type: "text" as const,
      text: `❌ Failed ${context}: ${message}`
    }]
  };
}

/**
 * Retry a function with exponential backoff
 *
 * Useful for transient failures (network issues, database locks, etc.)
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in ms (default: 100)
 * @returns Result of successful function call
 * @throws Last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await chromaClient.query(...),
 *   3,
 *   100
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  throw lastError;
}
