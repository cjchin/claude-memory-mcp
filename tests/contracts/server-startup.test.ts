/**
 * Server Startup Contract Tests
 *
 * These tests validate that the MCP server can start without errors.
 * This catches issues like duplicate tool registrations that only
 * manifest at runtime when all tools are registered.
 *
 * Updated to work with modular architecture where tools are defined
 * in src/tools/*.ts files instead of inline in src/index.ts.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Server Startup Contracts", () => {
  describe("Tool Registration Validation", () => {
    let toolRegistrations: { name: string; file: string; line: number }[];

    beforeAll(() => {
      toolRegistrations = [];

      // Scan all tool files in src/tools/
      const toolsDir = path.join(process.cwd(), "src", "tools");
      const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith(".ts") && f !== "index.ts");

      for (const file of toolFiles) {
        const filePath = path.join(toolsDir, file);
        const content = fs.readFileSync(filePath, "utf-8");

        // Match patterns like: server.tool(\n  "toolname",
        // or server.tool("toolname",
        const toolPattern = /server\.tool\(\s*["']([^"']+)["']/g;

        let match;
        while ((match = toolPattern.exec(content)) !== null) {
          // Find line number
          const beforeMatch = content.slice(0, match.index);
          const lineNumber = beforeMatch.split("\n").length;
          toolRegistrations.push({
            name: match[1],
            file: file,
            line: lineNumber
          });
        }
      }
    });

    it("should have no duplicate tool names", () => {
      const toolNames = toolRegistrations.map((t) => t.name);
      const uniqueNames = new Set(toolNames);

      if (toolNames.length !== uniqueNames.size) {
        // Find duplicates and report with file and line numbers
        const seen = new Map<string, { file: string; line: number }>();
        const duplicates: string[] = [];

        for (const reg of toolRegistrations) {
          if (seen.has(reg.name)) {
            const first = seen.get(reg.name)!;
            duplicates.push(
              `Tool "${reg.name}" registered in ${first.file}:${first.line} and ${reg.file}:${reg.line}`
            );
          } else {
            seen.set(reg.name, { file: reg.file, line: reg.line });
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
          invalidNames.push(`"${reg.name}" in ${reg.file}:${reg.line}`);
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
      expect(toolRegistrations.length).toBeLessThan(70);  // Increased for v3.0 Phase 1+2 (emotional + narrative intelligence)
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

  describe("Modular Organization", () => {
    it("should have properly organized tool modules", () => {
      const toolsDir = path.join(process.cwd(), "src", "tools");

      // Check that tools directory exists
      expect(fs.existsSync(toolsDir)).toBe(true);

      // Check for expected tool module files
      const expectedModules = [
        "core-tools.ts",
        "autonomous-tools.ts",
        "session-tools.ts",
        "project-tools.ts",
        "utility-tools.ts",
        "shadow-tools.ts",
        "introspect-tools.ts",
        "llm-tools.ts",
        "graph-tools.ts",
        "policy-tools.ts",
        "dream-tools.ts",
        "emotional-tools.ts",      // v3.0 Phase 1
        "narrative-tools.ts",      // v3.0 Phase 2
        "index.ts",
      ];

      for (const module of expectedModules) {
        const modulePath = path.join(toolsDir, module);
        expect(
          fs.existsSync(modulePath),
          `Missing tool module: ${module}`
        ).toBe(true);
      }
    });

    it("should have index.ts exporting all register functions", () => {
      const indexPath = path.join(process.cwd(), "src", "tools", "index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      // Check for expected exports
      const expectedExports = [
        "registerCoreTools",
        "registerAutonomousTools",
        "registerSessionTools",
        "registerProjectTools",
        "registerUtilityTools",
        "registerShadowTools",
        "registerIntrospectTools",
        "registerLlmTools",
        "registerGraphTools",
        "registerPolicyTools",
        "registerDreamTools",
        "registerEmotionalTools",      // v3.0 Phase 1
        "registerNarrativeTools",      // v3.0 Phase 2
      ];

      for (const exportName of expectedExports) {
        expect(
          content.includes(exportName),
          `Missing export: ${exportName}`
        ).toBe(true);
      }
    });
  });
});
