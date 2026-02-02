/**
 * Autonomous Tools
 *
 * Context loading, synthesis, and bi-directional analysis:
 * - prime: Central nervous system activation / context loading
 * - conclude: End-of-turn checkpoint
 * - synthesize: Extract and save key points from text
 * - align: Load context for a topic
 * - detect_intent: Detect implicit triggers in a message
 * - assimilate: Integrate new info with existing memories
 * - analyze_turn: Bi-directional analysis of user message and Claude response
 * - analyze_conversation: Full conversation analysis with alignment engine
 * - reflect: Extract insights from Claude's own response
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { saveMemory, searchMemories, getMemory, listMemories, getMemoryStats, getCurrentSessionId, addMemoryToSession } from "../db.js";
import { config } from "../config.js";
import { detectMemoryType, detectTags, estimateImportance } from "../intelligence.js";
import { detectTrigger, extractMemorablePoints, detectClaudeInsights, analyzeConversationTurn, detectSemanticSignal } from "../autonomous.js";
import { SmartAlignmentEngine } from "../alignment.js";
import type { MemoryType } from "../types.js";
import { listActiveShadows, getShadowEntry, checkPromotionThresholds, getRecentlyPromoted, finalizeShadow, getActiveMinutes, formatShadowForClaude, getSessionShadows } from "../shadow-log.js";
import { recordToolActivity } from "./shadow-tools.js";
import { checkDuplicates } from "../dedupe.js";

const alignmentEngine = new SmartAlignmentEngine({ autoSaveEnabled: true, userTriggerThreshold: 0.7, claudeInsightThreshold: 0.75 });

export function registerAutonomousTools(server: McpServer): void {
  server.tool("prime", { topic: z.string().optional().describe("Optional topic to focus context loading on"), depth: z.enum(["quick", "normal", "deep"]).optional().default("normal") },
    async ({ topic, depth }) => {
      const stats = await getMemoryStats(); const sessionId = getCurrentSessionId(); const project = config.current_project; const sections: string[] = [];
      if (config.shadow_enabled && topic) { const ps = getShadowEntry(sessionId); if (ps && ps.topic !== topic && ps.topic !== "general") { finalizeShadow(ps.id); } }
      sections.push(`\u2554${"\u2550".repeat(62)}\u2557\n\u2551              DIGITAL SOUL - CONTEXT PRIMED                  \u2551\n\u255a${"\u2550".repeat(62)}\u255d\n`);
      sections.push(`Session: ${sessionId}\nProject: ${project || "none"}\nMemories: ${stats.total} total, ${stats.recentCount} this week\n`);
      if (config.shadow_enabled) {
        const shadows = listActiveShadows(); const rp = getRecentlyPromoted(); const pc = checkPromotionThresholds();
        if (shadows.length > 0) { sections.push(`\n\u{1f441}\u{fe0f} RECENT SHADOWS (active working memory):`); for (const s of shadows.slice(0, 3)) { const il = s.session_id === sessionId; const sl = il ? "(this)" : "(other)"; const am = Math.round(getActiveMinutes(s)); sections.push(`  \u250c\u2500 ${s.topic} ${sl} ${"\u2500".repeat(39)}\n  \u2502 Activity: ${s.activities.length} items, ${am}min active\n  \u2502 Density: ${s.tokens} tokens\n  \u2514${"\u2500".repeat(60)}`); } if (shadows.length > 3) { sections.push(`  ... and ${shadows.length - 3} more shadows`); } }
        if (rp.length > 0) { sections.push(`\n\u2728 RECENTLY PROMOTED:`); for (const p of rp.slice(-3)) { sections.push(`  \u2022 [shadow\u2192memory] "${p.topic}" (${p.memory_id})`); } }
        if (config.shadow_surface_in_prime && pc.length > 0) {
          sections.push(`\n\u{1f441}\u{fe0f} SHADOW PROMOTION CANDIDATES (${pc.length}):\n`);
          for (const c of pc.slice(0, 3)) {
            const tokenPct = Math.round((c.tokens / config.shadow_token_threshold) * 100);
            const timePct = Math.round((getActiveMinutes(c) / config.shadow_time_threshold_min) * 100);
            sections.push(formatShadowForClaude(c));
            sections.push(`  Progress: ${Math.max(tokenPct, timePct)}% to threshold\n`);
          }
          sections.push(`\u{1f4a1} Reflect on these activities and use 'remember' to save insights.`);
        } else if (pc.length > 0) {
          sections.push(`\n\u26a1 PROMOTION CANDIDATES (${pc.length}):`);
          for (const c of pc.slice(0, 2)) { sections.push(`  \u2022 "${c.topic}" - ${c.tokens} tokens (use promote_shadow to convert)`); }
        }
      }
      const limits = { quick: 3, normal: 5, deep: 10 }; const limit = limits[depth];
      const todos = await listMemories({ limit, project: project || undefined, type: "todo", sortBy: "importance" });
      if (todos.length > 0) { sections.push(`\n\u{1f4cb} PENDING TODOS (${todos.length}):\n${todos.map((t) => `  \u25a1 [${t.importance}\u2605] ${t.content.slice(0, 100)}${t.content.length > 100 ? "..." : ""}`).join("\n")}`); }
      const decs = await listMemories({ limit, project: project || undefined, type: "decision", sortBy: "recent" });
      if (decs.length > 0) { sections.push(`\n\u{1f3af} RECENT DECISIONS (${decs.length}):\n${decs.map((d) => `  \u2022 ${d.content.slice(0, 120)}${d.content.length > 120 ? "..." : ""}`).join("\n")}`); }
      const pats = await listMemories({ limit: Math.max(3, limit - 2), project: project || undefined, type: "pattern", sortBy: "importance" });
      if (pats.length > 0) { sections.push(`\n\u{1f504} ACTIVE PATTERNS (${pats.length}):\n${pats.map((p) => `  \u2022 ${p.content.slice(0, 100)}${p.content.length > 100 ? "..." : ""}`).join("\n")}`); }
      if (topic) { const tm = await searchMemories(topic, { limit, project: project || undefined }); if (tm.length > 0) { sections.push(`\n\u{1f3af} CONTEXT FOR "${topic}" (${tm.length}):\n${tm.map((m) => `  [${m.type}] ${m.content.slice(0, 100)}${m.content.length > 100 ? "..." : ""} (${Math.round(m.score * 100)}%)`).join("\n")}`); } }
      const lrn = await listMemories({ limit: Math.max(2, limit - 3), project: project || undefined, type: "learning", sortBy: "recent" });
      if (lrn.length > 0) { sections.push(`\n\u{1f4da} RECENT LEARNINGS (${lrn.length}):\n${lrn.map((l) => `  \u{1f4a1} ${l.content.slice(0, 100)}${l.content.length > 100 ? "..." : ""}`).join("\n")}`); }
      sections.push(`\n${"\u2500".repeat(60)}\nSoul is primed and ready. Context loaded at ${depth} depth.\nUse 'align' for deeper topic focus, 'recall' to search memories.`);
      return { content: [{ type: "text" as const, text: sections.join("\n") }] };
    }
  );

  server.tool("conclude", { summary: z.string().describe("Brief summary of what was accomplished"), insights: z.array(z.string()).optional().describe("Key insights to remember"), next_steps: z.array(z.string()).optional().describe("TODOs or next steps identified"), auto_save: z.boolean().optional().default(true) },
    async ({ summary, insights, next_steps, auto_save }) => {
      const results: string[] = []; const sessionId = getCurrentSessionId();
      results.push(`\u2554${"\u2550".repeat(62)}\u2557\n\u2551                    CHECKPOINT SAVED                         \u2551\n\u255a${"\u2550".repeat(62)}\u255d\n`);
      if (auto_save && summary) { const sid = await saveMemory({ content: `Session checkpoint: ${summary}`, type: "context", tags: ["checkpoint", "session-progress"], importance: 3, project: config.current_project, session_id: sessionId, timestamp: new Date().toISOString() }); await addMemoryToSession(sid); results.push(`\u{1f4cd} Checkpoint: ${summary}`); results.push(`   Saved as: ${sid}\n`); }
      if (auto_save && insights?.length) {
        results.push(`\u{1f4a1} Insights saved:`);
        for (const insight of insights) { const sim = await checkDuplicates(insight, "STANDARD"); if (sim.length > 0) { results.push(`   [SKIP] Already exists: "${insight.slice(0, 40)}..."`); continue; } const id = await saveMemory({ content: insight, type: "learning", tags: detectTags(insight), importance: estimateImportance(insight), project: config.current_project, session_id: sessionId, timestamp: new Date().toISOString() }); await addMemoryToSession(id); results.push(`   \u2022 ${insight.slice(0, 50)}... \u2192 ${id}`); }
        results.push("");
      }
      if (auto_save && next_steps?.length) {
        results.push(`\u{1f4cb} TODOs added:`);
        for (const step of next_steps) { const sim = await checkDuplicates(step, "STANDARD"); if (sim.length > 0) { results.push(`   [SKIP] Already exists: "${step.slice(0, 40)}..."`); continue; } const id = await saveMemory({ content: step, type: "todo", tags: detectTags(step), importance: 4, project: config.current_project, session_id: sessionId, timestamp: new Date().toISOString() }); await addMemoryToSession(id); results.push(`   \u25a1 ${step.slice(0, 50)}... \u2192 ${id}`); }
        results.push("");
      }
      // Surface session shadows for Claude's reflection
      if (config.shadow_enabled && config.shadow_surface_in_conclude) {
        const sessionShadows = getSessionShadows(sessionId);
        const threshold = config.shadow_token_threshold * config.shadow_surface_threshold;
        const substantialShadows = sessionShadows.filter(s =>
          (s.status === "active" || s.status === "idle") &&
          s.tokens >= threshold
        );
        if (substantialShadows.length > 0) {
          results.push(`\n\u{1f441}\u{fe0f} SHADOW MEMORY (Working memory from this session):\n`);
          for (const shadow of substantialShadows.slice(0, 3)) {
            results.push(formatShadowForClaude(shadow));
            const tokenPct = Math.round((shadow.tokens / config.shadow_token_threshold) * 100);
            results.push(`  Progress: ${tokenPct}% to promotion threshold\n`);
          }
          results.push(`\u{1f4ad} Reflect: What did you learn from this exploration?`);
          results.push(`   \u2192 Use 'remember' to save key insights before ending session\n`);
        }
      }
      results.push(`Session: ${sessionId}`); results.push(`Project: ${config.current_project || "none"}`); results.push(`\n\u2713 Checkpoint complete. Soul updated.`);
      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    }
  );

  server.tool("synthesize", { content: z.string().describe("The conversation or text to synthesize into memories"), auto_save: z.boolean().optional().default(true).describe("Automatically save extracted points") },
    async ({ content, auto_save }) => {
      const points = extractMemorablePoints(content);
      if (points.length === 0) { return { content: [{ type: "text" as const, text: "No memorable points detected in the provided content." }] }; }
      const results: string[] = [];
      for (const point of points) {
        if (auto_save) { const sim = await checkDuplicates(point.content, "STANDARD"); if (sim.length > 0) { results.push(`[SKIP] Already exists: "${point.content.slice(0, 50)}..."`); continue; } const id = await saveMemory({ content: point.content, type: point.type, tags: point.tags, importance: point.importance, project: config.current_project, session_id: getCurrentSessionId(), timestamp: new Date().toISOString() }); await addMemoryToSession(id); results.push(`[SAVED] ${point.type.toUpperCase()}: "${point.content.slice(0, 50)}..." \u2192 ${id}`);
        } else { results.push(`[DETECTED] ${point.type.toUpperCase()} (imp: ${point.importance}): "${point.content.slice(0, 80)}..."`); }
      }
      return { content: [{ type: "text" as const, text: `Synthesis Complete\n==================\n\nExtracted ${points.length} memorable points:\n\n` + results.join("\n") }] };
    }
  );

  server.tool("align", { topic: z.string().describe("The topic or area to align with"), depth: z.enum(["shallow", "normal", "deep"]).optional().default("normal") },
    async ({ topic, depth }) => {
      const limits = { shallow: 3, normal: 7, deep: 15 }; const limit = limits[depth];
      const memories = await searchMemories(topic, { limit, project: config.current_project });
      if (memories.length === 0) { return { content: [{ type: "text" as const, text: `No memories found for topic: "${topic}"\n\nStarting fresh on this topic.` }] }; }
      const byType: Record<string, typeof memories> = {}; for (const m of memories) { if (!byType[m.type]) byType[m.type] = []; byType[m.type].push(m); }
      const sections: string[] = []; const typeOrder: MemoryType[] = ["decision", "pattern", "context", "learning", "preference", "todo", "reference"];
      for (const type of typeOrder) { const items = byType[type]; if (items?.length) { const fmt = items.map((m) => `  \u2022 ${m.content.slice(0, 150)}${m.content.length > 150 ? "..." : ""}`).join("\n"); sections.push(`${type.toUpperCase()}S:\n${fmt}`); } }
      return { content: [{ type: "text" as const, text: `Soul Alignment: "${topic}"\n${"=".repeat(20 + topic.length)}\n\nFound ${memories.length} relevant memories:\n\n` + sections.join("\n\n") + `\n\n---\nAligned and ready to continue work on "${topic}".` }] };
    }
  );

  server.tool("detect_intent", { message: z.string().describe("The user message to analyze for implicit memory triggers") },
    async ({ message }) => {
      const trigger = detectTrigger(message);
      if (!trigger) { return { content: [{ type: "text" as const, text: "No implicit memory triggers detected." }] }; }
      let suggestion = "";
      switch (trigger.type) {
        case "save": suggestion = `Detected SAVE trigger (${trigger.memoryType}, ${Math.round(trigger.confidence * 100)}% confidence)\nContent: "${trigger.extractedContent?.slice(0, 100)}..."\nSuggested tags: ${trigger.suggestedTags?.join(", ") || "none"}\n\n\u2192 Recommend: Call 'remember' tool with this content`; break;
        case "recall": suggestion = `Detected RECALL trigger (${Math.round(trigger.confidence * 100)}% confidence)\nQuery: "${trigger.extractedContent}"\n\n\u2192 Recommend: Call 'recall' tool with this query`; break;
        case "synthesize": suggestion = `Detected SYNTHESIZE trigger (${Math.round(trigger.confidence * 100)}% confidence)\n\n\u2192 Recommend: Call 'synthesize' tool on recent conversation`; break;
        case "align": suggestion = `Detected ALIGN trigger (${Math.round(trigger.confidence * 100)}% confidence)\nTopic: "${trigger.extractedContent}"\n\n\u2192 Recommend: Call 'align' tool with this topic`; break;
      }
      return { content: [{ type: "text" as const, text: suggestion }] };
    }
  );

  server.tool("assimilate", { content: z.string().describe("New information to assimilate"), merge_threshold: z.number().min(0).max(1).optional().default(0.7) },
    async ({ content, merge_threshold }) => {
      const similar = await searchMemories(content, { limit: 5 }); const closeMatches = similar.filter((m) => m.score >= merge_threshold);
      if (closeMatches.length === 0) {
        const type = detectMemoryType(content); const tags = detectTags(content); const importance = estimateImportance(content);
        const id = await saveMemory({ content, type, tags, importance, project: config.current_project, session_id: getCurrentSessionId(), timestamp: new Date().toISOString() });
        return { content: [{ type: "text" as const, text: `Assimilated as NEW memory: ${id}\nType: ${type}\nTags: ${tags.join(", ")}` }] };
      }
      const matchReport = closeMatches.map((m) => `  [${m.id}] (${Math.round(m.score * 100)}% similar)\n    "${m.content.slice(0, 100)}..."`).join("\n\n");
      return { content: [{ type: "text" as const, text: `Found ${closeMatches.length} similar memories:\n\n${matchReport}\n\nOptions:\n1. Use 'update_memory' to update an existing memory\n2. Use 'merge_memories' to consolidate\n3. Use 'remember' with different phrasing to save as distinct` }] };
    }
  );

  server.tool("analyze_turn", { user_message: z.string().describe("The user message"), claude_response: z.string().describe("Claude response to analyze"), auto_save: z.boolean().optional().default(false).describe("Automatically save detected insights") },
    async ({ user_message, claude_response, auto_save }) => {
      const analysis = analyzeConversationTurn(user_message, claude_response); const results: string[] = [];
      if (analysis.userTrigger) { const ut = analysis.userTrigger; results.push(`USER TRIGGER DETECTED:\n  Type: ${ut.type} \u2192 ${ut.memoryType || "N/A"}\n  Confidence: ${Math.round(ut.confidence * 100)}%\n  Content: "${ut.extractedContent?.slice(0, 80)}..."`);
        if (auto_save && ut.type === "save" && ut.confidence >= 0.7) { const id = await saveMemory({ content: ut.extractedContent || user_message, type: ut.memoryType || "context", tags: ut.suggestedTags || [], importance: estimateImportance(ut.extractedContent || user_message), project: config.current_project, session_id: getCurrentSessionId(), timestamp: new Date().toISOString() }); results.push(`  \u2192 AUTO-SAVED as ${id}`); } }
      if (analysis.claudeInsights.length > 0) { results.push(`\nCLAUDE INSIGHTS DETECTED (${analysis.claudeInsights.length}):`);
        for (const insight of analysis.claudeInsights) { results.push(`  \u2022 ${insight.memoryType?.toUpperCase()}: "${insight.extractedContent?.slice(0, 60)}..."\n    Confidence: ${Math.round(insight.confidence * 100)}%`);
          if (auto_save && insight.confidence >= 0.75) { const id = await saveMemory({ content: insight.extractedContent || "", type: insight.memoryType || "learning", tags: insight.suggestedTags || [], importance: estimateImportance(insight.extractedContent || ""), project: config.current_project, session_id: getCurrentSessionId(), timestamp: new Date().toISOString() }); results.push(`    \u2192 AUTO-SAVED as ${id}`); } } }
      results.push(`\nSEMANTIC SIGNAL: ${analysis.semanticSignal.signal.toUpperCase()}\n  Reason: ${analysis.semanticSignal.reason}\n  Importance boost: +${analysis.semanticSignal.boost}`);
      results.push(`\n${"\u2500".repeat(40)}\nSUMMARY:\n  Should auto-save: ${analysis.shouldAutoSave ? "YES" : "NO"}\n  Total memorable items: ${analysis.totalMemorableItems}`);
      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    }
  );

  server.tool("analyze_conversation", { user_message: z.string().describe("The user message in the conversation"), claude_response: z.string().describe("Claude response to analyze for insights"), auto_save: z.boolean().optional().describe("Automatically save detected memories (default: false)") },
    async ({ user_message, claude_response, auto_save = false }) => {
      const result = alignmentEngine.analyze(user_message, claude_response); let savedIds: string[] = [];
      if (auto_save && result.memoriesToCreate.length > 0) { for (const candidate of result.memoriesToCreate) { const sim = await checkDuplicates(candidate.content, "STRICT"); if (sim.length > 0) continue; const id = await saveMemory({ content: candidate.content, type: candidate.type, tags: candidate.tags, importance: candidate.importance, project: config.current_project, session_id: getCurrentSessionId(), timestamp: new Date().toISOString(), valid_from: new Date().toISOString(), source: candidate.source === 'claude' ? 'inferred' : 'human', confidence: candidate.confidence }); savedIds.push(id); await addMemoryToSession(id); } }
      const ms = result.memoriesToCreate.map((m, i) => `${i + 1}. [${m.type}] ${m.content.slice(0, 80)}... (conf: ${Math.round(m.confidence * 100)}%, src: ${m.source})`).join('\n');
      const rs = result.recallQueries.length > 0 ? `\nRecall queries: ${result.recallQueries.join(', ')}` : '';
      const ss = savedIds.length > 0 ? `\n\nAuto-saved ${savedIds.length} memories: ${savedIds.join(', ')}` : '';
      return { content: [{ type: "text" as const, text: `Analysis: ${result.explanation}\n\nMemories detected (${result.memoriesToCreate.length}):\n${ms || 'None'}` + rs + (result.needsAlignment ? `\n\nAlignment needed for: ${result.alignmentTopic}` : '') + ss }] };
    }
  );

  server.tool("reflect", { response: z.string().describe("Claude response to analyze for self-insights"), auto_save: z.boolean().optional().default(true) },
    async ({ response, auto_save }) => {
      const insights = detectClaudeInsights(response); const signal = detectSemanticSignal(response);
      if (insights.length === 0) { return { content: [{ type: "text" as const, text: `No notable insights detected in response.\nSemantic signal: ${signal.signal}` }] }; }
      const results: string[] = [`Detected ${insights.length} insights from Claude's response:\n`];
      for (const insight of insights) { const bi = estimateImportance(insight.extractedContent || ""); const boosted = Math.min(5, bi + signal.boost);
        if (auto_save && insight.confidence >= 0.7) { const id = await saveMemory({ content: insight.extractedContent || "", type: insight.memoryType || "learning", tags: [...(insight.suggestedTags || []), "claude-insight"], importance: boosted, project: config.current_project, session_id: getCurrentSessionId(), timestamp: new Date().toISOString(), metadata: { source: "claude-reflection", signal: signal.signal } }); results.push(`[SAVED] ${insight.memoryType?.toUpperCase()} \u2192 ${id}\n  "${insight.extractedContent?.slice(0, 80)}..."\n  Importance: ${boosted}/5 (boosted by ${signal.signal} signal)`);
        } else { results.push(`[DETECTED] ${insight.memoryType?.toUpperCase()} (${Math.round(insight.confidence * 100)}%)\n  "${insight.extractedContent?.slice(0, 80)}..."`); } }
      return { content: [{ type: "text" as const, text: results.join("\n\n") }] };
    }
  );
}
