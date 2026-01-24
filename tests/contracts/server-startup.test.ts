/**
 * Server Startup Contract Tests
 * 
 * These tests validate that the MCP server can start without errors.
 * This catches issues like duplicate tool registrations that only
 * manifest at runtime when all tools are registered.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Server Startup Contracts", () => {
  describe("Tool Registration Validation", () => {
    let indexContent: string;
    let toolRegistrations: { name: string; line: number }[];

    beforeAll(() => {
      // Read the source file to analyze tool registrations
      const indexPath = path.join(process.cwd(), "src", "index.ts");
      indexContent = fs.readFileSync(indexPath, "utf-8");
      
      // Extract all server.tool("name", ...) registrations
      const lines = indexContent.split("\n");
      toolRegistrations = [];
      
      // Match patterns like: server.tool(\n  "toolname",
      // or server.tool("toolname",
      const toolPattern = /server\.tool\(\s*["']([^"']+)["']/g;
      
      let match;
      while ((match = toolPattern.exec(indexContent)) !== null) {
        // Find line number
        const beforeMatch = indexContent.slice(0, match.index);
        const lineNumber = beforeMatch.split("\n").length;
        toolRegistrations.push({ name: match[1], line: lineNumber });
      }
    });

    it("should have no duplicate tool names", () => {
      const toolNames = toolRegistrations.map((t) => t.name);
      const uniqueNames = new Set(toolNames);
      
      if (toolNames.length !== uniqueNames.size) {
        // Find duplicates and report with line numbers
        const seen = new Map<string, number>();
        const duplicates: string[] = [];
        
        for (const reg of toolRegistrations) {
          if (seen.has(reg.name)) {
            duplicates.push(
              `Tool "${reg.name}" registered at lines ${seen.get(reg.name)} and ${reg.line}`
            );
          } else {
            seen.set(reg.name, reg.line);
          }
        }
        
        throw new Error(
          `Duplicate tool registrations found:\n${duplicates.join("\n")}`
        );
      }
      
      expect(toolNames.length).toBe(uniqueNames.size);
    });

    it("should register expected core tools", () => {
      const toolNames = new Set(toolRegistrations.map((t) => t.name));
      
      // Core tools that must always exist
      const requiredTools = [
        "remember",
        "recall",
        "forget",
        "prime",
        "introspect",
        "align",
        "memory_stats",
        "start_session",
        "end_session",
      ];
      
      for (const tool of requiredTools) {
        expect(toolNames.has(tool), `Missing required tool: ${tool}`).toBe(true);
      }
    });

    it("should have valid tool name format", () => {
      const invalidNames: string[] = [];
      
      for (const reg of toolRegistrations) {
        // Tool names should be lowercase, alphanumeric with underscores
        if (!/^[a-z][a-z0-9_]*$/.test(reg.name)) {
          invalidNames.push(`"${reg.name}" at line ${reg.line}`);
        }
      }
      
      expect(
        invalidNames,
        `Invalid tool names (should be lowercase snake_case): ${invalidNames.join(", ")}`
      ).toHaveLength(0);
    });

    it("should have reasonable number of tools", () => {
      // Sanity check - catch accidental mass duplication
      expect(toolRegistrations.length).toBeGreaterThan(10);
      expect(toolRegistrations.length).toBeLessThan(50);
    });
  });

  describe("Resource Registration Validation", () => {
    it("should have no duplicate resource URIs", () => {
      const indexPath = path.join(process.cwd(), "src", "index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");
      
      // Match resource registrations
      const resourcePattern = /server\.resource\(\s*["']([^"']+)["']/g;
      const resources: { uri: string; line: number }[] = [];
      
      let match;
      while ((match = resourcePattern.exec(content)) !== null) {
        const beforeMatch = content.slice(0, match.index);
        const lineNumber = beforeMatch.split("\n").length;
        resources.push({ uri: match[1], line: lineNumber });
      }
      
      const uris = resources.map((r) => r.uri);
      const uniqueUris = new Set(uris);
      
      if (uris.length !== uniqueUris.size) {
        const seen = new Map<string, number>();
        const duplicates: string[] = [];
        
        for (const res of resources) {
          if (seen.has(res.uri)) {
            duplicates.push(
              `Resource "${res.uri}" registered at lines ${seen.get(res.uri)} and ${res.line}`
            );
          } else {
            seen.set(res.uri, res.line);
          }
        }
        
        throw new Error(
          `Duplicate resource registrations found:\n${duplicates.join("\n")}`
        );
      }
      
      expect(uris.length).toBe(uniqueUris.size);
    });
  });

  describe("Section Organization", () => {
    it("should have properly organized sections", () => {
      const indexPath = path.join(process.cwd(), "src", "index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");
      
      // Check for section headers
      const sectionPattern = /\/\/ ============ ([A-Z][A-Z0-9 -]+) ============/g;
      const sections: string[] = [];
      
      let match;
      while ((match = sectionPattern.exec(content)) !== null) {
        sections.push(match[1]);
      }
      
      // Should have organized sections
      expect(sections.length).toBeGreaterThan(5);
      
      // Check for expected sections
      const expectedSections = [
        "MEMORY TOOLS",
        "SESSION TOOLS",
        "UTILITY TOOLS",
      ];
      
      for (const section of expectedSections) {
        expect(
          sections.some((s) => s.includes(section)),
          `Missing section: ${section}`
        ).toBe(true);
      }
      
      // Check for duplicate sections (which caused our bug)
      const uniqueSections = new Set(sections);
      if (sections.length !== uniqueSections.size) {
        const counts = new Map<string, number>();
        for (const s of sections) {
          counts.set(s, (counts.get(s) || 0) + 1);
        }
        const duplicates = [...counts.entries()]
          .filter(([, count]) => count > 1)
          .map(([name, count]) => `"${name}" appears ${count} times`);
        
        throw new Error(
          `Duplicate section headers found:\n${duplicates.join("\n")}`
        );
      }
    });
  });
});
