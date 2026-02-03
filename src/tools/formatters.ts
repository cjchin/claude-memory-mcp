/**
 * Formatters - Shared formatting utilities for MCP tool output
 *
 * Provides consistent formatting patterns for statistics, progress bars,
 * headers, and other common display elements across tools.
 */

/**
 * Format a bordered header box
 *
 * @param title - Header text
 * @param width - Box width (default: 62)
 * @returns Formatted header string
 *
 * @example
 * ```typescript
 * formatHeader("MEMORY STATISTICS")
 * // ╔══════════════════════════════════════════════════════════════╗
 * // ║                  MEMORY STATISTICS                          ║
 * // ╚══════════════════════════════════════════════════════════════╝
 * ```
 */
export function formatHeader(title: string, width: number = 62): string {
  const padding = Math.max(0, width - title.length - 2);
  const leftPad = Math.floor(padding / 2);
  const rightPad = Math.ceil(padding / 2);

  const top = `╔${"═".repeat(width)}╗`;
  const middle = `║${" ".repeat(leftPad)}${title}${" ".repeat(rightPad)}║`;
  const bottom = `╚${"═".repeat(width)}╝`;

  return `${top}\n${middle}\n${bottom}`;
}

/**
 * Format a statistics table
 *
 * @param stats - Record of stat names to values
 * @param title - Optional title for the stats section
 * @returns Formatted statistics string
 *
 * @example
 * ```typescript
 * formatStats({ total: 100, active: 50, idle: 30 }, "Memory Stats")
 * // Memory Stats:
 * //   total: 100
 * //   active: 50
 * //   idle: 30
 * ```
 */
export function formatStats(
  stats: Record<string, number | string>,
  title?: string
): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`${title}:`);
  }

  for (const [key, value] of Object.entries(stats)) {
    lines.push(`  ${key}: ${value}`);
  }

  return lines.join("\n");
}

/**
 * Format a progress bar
 *
 * @param current - Current value
 * @param max - Maximum value
 * @param width - Bar width in characters (default: 10)
 * @param filledChar - Character for filled portion (default: "█")
 * @param emptyChar - Character for empty portion (default: "░")
 * @returns Progress bar string
 *
 * @example
 * ```typescript
 * formatBar(7, 10)        // "███████░░░"
 * formatBar(0.75, 1, 20)  // "███████████████░░░░░"
 * ```
 */
export function formatBar(
  current: number,
  max: number,
  width: number = 10,
  filledChar: string = "█",
  emptyChar: string = "░"
): string {
  const filled = Math.round((current / max) * width);
  const empty = width - filled;
  return filledChar.repeat(filled) + emptyChar.repeat(empty);
}

/**
 * Format a percentage
 *
 * @param value - Value between 0 and 1
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted percentage string
 *
 * @example
 * ```typescript
 * formatPercent(0.75)      // "75%"
 * formatPercent(0.333, 1)  // "33.3%"
 * ```
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a bullet list
 *
 * @param items - Array of items to format
 * @param bullet - Bullet character (default: "•")
 * @param indent - Indentation spaces (default: 2)
 * @returns Formatted bullet list string
 *
 * @example
 * ```typescript
 * formatList(["Item 1", "Item 2", "Item 3"])
 * //   • Item 1
 * //   • Item 2
 * //   • Item 3
 * ```
 */
export function formatList(
  items: string[],
  bullet: string = "•",
  indent: number = 2
): string {
  const prefix = " ".repeat(indent);
  return items.map(item => `${prefix}${bullet} ${item}`).join("\n");
}

/**
 * Format a key-value table
 *
 * @param data - Record of keys to values
 * @param keyWidth - Width to pad keys to (default: auto)
 * @param separator - Separator between key and value (default: ": ")
 * @returns Formatted table string
 *
 * @example
 * ```typescript
 * formatTable({ Name: "John", Age: 30, City: "NYC" })
 * // Name: John
 * // Age : 30
 * // City: NYC
 * ```
 */
export function formatTable(
  data: Record<string, string | number | boolean>,
  keyWidth?: number,
  separator: string = ": "
): string {
  // Calculate max key width if not provided
  const maxKeyWidth = keyWidth || Math.max(...Object.keys(data).map(k => k.length));

  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const paddedKey = key.padEnd(maxKeyWidth);
    lines.push(`${paddedKey}${separator}${value}`);
  }

  return lines.join("\n");
}

/**
 * Format a divider line
 *
 * @param width - Width of the divider (default: 60)
 * @param char - Character to use (default: "─")
 * @returns Divider string
 *
 * @example
 * ```typescript
 * formatDivider()     // "────────────────────────────────────────────────────────────"
 * formatDivider(20, "=") // "===================="
 * ```
 */
export function formatDivider(width: number = 60, char: string = "─"): string {
  return char.repeat(width);
}

/**
 * Truncate text with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length including ellipsis
 * @param ellipsis - Ellipsis string (default: "...")
 * @returns Truncated text
 *
 * @example
 * ```typescript
 * truncate("This is a long text", 10)  // "This is..."
 * ```
 */
export function truncate(
  text: string,
  maxLength: number,
  ellipsis: string = "..."
): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Format a count with emoji indicator
 *
 * @param count - Number to format
 * @param emoji - Emoji to use
 * @param label - Optional label
 * @returns Formatted count string
 *
 * @example
 * ```typescript
 * formatCount(5, "✅", "completed")  // "✅ 5 completed"
 * formatCount(0, "❌")               // "❌ 0"
 * ```
 */
export function formatCount(
  count: number,
  emoji: string,
  label?: string
): string {
  return `${emoji} ${count}${label ? ` ${label}` : ""}`;
}
