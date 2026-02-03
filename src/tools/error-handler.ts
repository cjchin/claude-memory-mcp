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

// Re-export withRetry from the canonical location
export { withRetry } from "../errors.js";
