#!/usr/bin/env node

/**
 * CLI tool for managing Claude memories outside of MCP
 * Usage: npx ts-node src/cli.ts <command> [options]
 */

import { initEmbeddings } from "./embeddings.js";
import {
  initDb,
  saveMemory,
  searchMemories,
  getMemory,
  deleteMemory,
  updateMemory,
  listMemories,
  getMemoryStats,
  listProjects,
  setProject,
  findSimilarMemories,
  consolidateMemories,
  supersedeMemory,
  getAllMemoriesWithEmbeddings,
  addMemoryLink,
} from "./db.js";
import {
  analyzeGraphEnrichment,
  proposedLinkToMemoryLink,
  type ProposedLink,
} from "./graph-enrichment.js";
import { config, updateConfig } from "./config.js";
import type { Memory, MemoryType, DreamOperation } from "./types.js";
import {
  runDreamCycle,
  runDreamCycleWithMutations,
  parseFoundingMemories,
  createFoundationalMemory,
  DEFAULT_DECAY_CONFIG,
  type DreamDbOperations,
} from "./dream.js";
import { writeFileSync, readFileSync, existsSync } from "fs";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  await initEmbeddings();
  await initDb();

  switch (command) {
    case "search":
    case "recall":
      await cmdSearch(args.slice(1).join(" "));
      break;

    case "list":
      await cmdList(args[1] ? parseInt(args[1]) : 20);
      break;

    case "stats":
      await cmdStats();
      break;

    case "get":
      await cmdGet(args[1]);
      break;

    case "delete":
    case "forget":
      await cmdDelete(args[1]);
      break;

    case "add":
    case "remember":
      await cmdAdd(args.slice(1).join(" "));
      break;

    case "export":
      await cmdExport(args[1] || "memories-export.json");
      break;

    case "import":
      await cmdImport(args[1]);
      break;

    case "projects":
      await cmdProjects();
      break;

    case "set-project":
      await cmdSetProject(args[1]);
      break;

    case "config":
      cmdConfig();
      break;

    case "consolidate":
      await cmdConsolidate(args[1] === "--dry-run");
      break;

    case "daemon":
      await cmdDaemon();
      break;

    case "report":
      await cmdReport();
      break;

    case "dream":
      await cmdDream(args.slice(1));
      break;

    case "inject-founding":
      await cmdInjectFounding(args[1]);
      break;

    case "enrich":
    case "link":
      await cmdEnrich(args.slice(1));
      break;

    case "help":
    default:
      printHelp();
  }
}

async function cmdSearch(query: string) {
  if (!query) {
    console.error("Usage: search <query>");
    process.exit(1);
  }

  console.log(`Searching for: "${query}"\n`);

  const results = await searchMemories(query, { limit: 10 });

  if (results.length === 0) {
    console.log("No memories found.");
    return;
  }

  for (const m of results) {
    console.log(`[${m.id}] ${m.type.toUpperCase()} (${Math.round(m.score * 100)}% match)`);
    console.log(`  Tags: ${m.tags.join(", ") || "none"}`);
    console.log(`  ${m.content.slice(0, 150)}${m.content.length > 150 ? "..." : ""}`);
    console.log();
  }
}

async function cmdList(limit: number) {
  const memories = await listMemories({ limit, sortBy: "recent" });

  if (memories.length === 0) {
    console.log("No memories found.");
    return;
  }

  console.log(`Recent memories (${memories.length}):\n`);

  for (const m of memories) {
    const date = new Date(m.timestamp).toLocaleDateString();
    console.log(`[${m.id}] ${m.type} | ${date} | imp:${m.importance}`);
    console.log(`  ${m.content.slice(0, 100)}${m.content.length > 100 ? "..." : ""}`);
    console.log();
  }
}

async function cmdStats() {
  const stats = await getMemoryStats();

  console.log("Memory Statistics");
  console.log("=================\n");
  console.log(`Total memories: ${stats.total}`);
  console.log(`Added this week: ${stats.recentCount}\n`);

  console.log("By type:");
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log("\nBy project:");
  for (const [project, count] of Object.entries(stats.byProject)) {
    console.log(`  ${project || "unassigned"}: ${count}`);
  }
}

async function cmdGet(id: string) {
  if (!id) {
    console.error("Usage: get <memory-id>");
    process.exit(1);
  }

  const memory = await getMemory(id);

  if (!memory) {
    console.error(`Memory ${id} not found.`);
    process.exit(1);
  }

  console.log(`Memory: ${memory.id}`);
  console.log(`Type: ${memory.type}`);
  console.log(`Tags: ${memory.tags.join(", ")}`);
  console.log(`Importance: ${memory.importance}/5`);
  console.log(`Project: ${memory.project || "unassigned"}`);
  console.log(`Created: ${memory.timestamp}`);
  console.log(`Accessed: ${memory.access_count} times`);
  console.log(`\nContent:\n${memory.content}`);
}

async function cmdDelete(id: string) {
  if (!id) {
    console.error("Usage: delete <memory-id>");
    process.exit(1);
  }

  await deleteMemory(id);
  console.log(`Deleted memory: ${id}`);
}

async function cmdAdd(content: string) {
  if (!content) {
    console.error("Usage: add <content>");
    process.exit(1);
  }

  const id = await saveMemory({
    content,
    type: "context",
    tags: [],
    importance: 3,
    project: config.current_project,
    timestamp: new Date().toISOString(),
  });

  console.log(`Saved memory: ${id}`);
}

interface ExportData {
  version: string;
  exported_at: string;
  memories: Memory[];
}

async function cmdExport(filename: string) {
  const memories = await listMemories({ limit: 10000 });

  const exportData: ExportData = {
    version: "1.0.0",
    exported_at: new Date().toISOString(),
    memories,
  };

  writeFileSync(filename, JSON.stringify(exportData, null, 2));
  console.log(`Exported ${memories.length} memories to ${filename}`);
}

async function cmdImport(filename: string) {
  if (!filename || !existsSync(filename)) {
    console.error("Usage: import <filename>");
    console.error("File not found:", filename);
    process.exit(1);
  }

  const data: ExportData = JSON.parse(readFileSync(filename, "utf-8"));

  console.log(`Importing ${data.memories.length} memories from ${filename}...`);

  let imported = 0;
  let skipped = 0;

  for (const m of data.memories) {
    try {
      await saveMemory({
        content: m.content,
        type: m.type,
        tags: m.tags,
        importance: m.importance,
        project: m.project,
        timestamp: m.timestamp,
        related_memories: m.related_memories,
      });
      imported++;
    } catch (error) {
      skipped++;
      console.error(`  Skipped: ${m.id} - ${error}`);
    }
  }

  console.log(`\nImported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
}

async function cmdProjects() {
  const projects = await listProjects();

  if (projects.length === 0) {
    console.log("No projects defined.");
    return;
  }

  console.log("Projects:\n");

  for (const p of projects) {
    const current = p.name === config.current_project ? " (current)" : "";
    console.log(`${p.name}${current}`);
    console.log(`  Description: ${p.description || "None"}`);
    console.log(`  Tech stack: ${p.tech_stack?.join(", ") || "Not specified"}`);
    console.log(`  Last active: ${p.last_active}`);
    console.log();
  }
}

async function cmdSetProject(name: string) {
  if (!name) {
    console.error("Usage: set-project <name>");
    process.exit(1);
  }

  await setProject(name);
  updateConfig({ current_project: name });
  console.log(`Set current project to: ${name}`);
}

function cmdConfig() {
  console.log("Current configuration:\n");
  console.log(JSON.stringify(config, null, 2));
  console.log(`\nConfig file: ~/.claude-memory/config.json`);
}

// ============ CONSOLIDATION & MAINTENANCE ============

async function cmdConsolidate(dryRun: boolean = false) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║            SOUL CONSOLIDATION - Memory Maintenance           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (dryRun) {
    console.log("DRY RUN MODE - No changes will be made\n");
  }

  const stats = await getMemoryStats();
  console.log(`Total memories: ${stats.total}\n`);

  // Phase 1: Find duplicate/similar memories
  console.log("Phase 1: Scanning for similar memories...");
  const memories = await listMemories({ limit: 1000, sortBy: "recent" });

  const similarGroups: { ids: string[]; contents: string[] }[] = [];
  const processed = new Set<string>();

  for (const memory of memories) {
    if (processed.has(memory.id)) continue;

    const similar = await findSimilarMemories(memory.content, 0.8);
    const otherSimilar = similar.filter((s) => s.id !== memory.id && !processed.has(s.id));

    if (otherSimilar.length > 0) {
      const group = {
        ids: [memory.id, ...otherSimilar.map((s) => s.id)],
        contents: [memory.content, ...otherSimilar.map((s) => s.content)],
      };
      similarGroups.push(group);

      // Mark all as processed
      group.ids.forEach((id) => processed.add(id));
    }
  }

  console.log(`  Found ${similarGroups.length} groups of similar memories\n`);

  if (similarGroups.length > 0) {
    console.log("Similar memory groups:");
    for (let i = 0; i < Math.min(similarGroups.length, 10); i++) {
      const group = similarGroups[i];
      console.log(`\n  Group ${i + 1} (${group.ids.length} memories):`);
      for (let j = 0; j < group.ids.length; j++) {
        console.log(`    [${group.ids[j]}] ${group.contents[j].slice(0, 60)}...`);
      }
    }

    if (!dryRun) {
      console.log("\n  [Note: Auto-merge not implemented yet - review manually]");
    }
  }

  // Phase 2: Identify stale memories (old, low importance, never accessed)
  console.log("\nPhase 2: Identifying stale memories...");

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleMemories = memories.filter((m) => {
    const age = Date.now() - new Date(m.timestamp).getTime();
    return (
      age > thirtyDaysAgo &&
      m.importance <= 2 &&
      m.access_count === 0
    );
  });

  console.log(`  Found ${staleMemories.length} stale memories (old, low importance, never accessed)`);

  if (staleMemories.length > 0 && staleMemories.length <= 10) {
    console.log("\n  Stale memories:");
    for (const m of staleMemories) {
      console.log(`    [${m.id}] ${m.type} - ${m.content.slice(0, 50)}...`);
    }
  }

  // Phase 3: Statistics by type
  console.log("\nPhase 3: Memory health report...");
  console.log("\n  By type:");
  for (const [type, count] of Object.entries(stats.byType)) {
    const percent = ((count / stats.total) * 100).toFixed(1);
    console.log(`    ${type.padEnd(12)} ${String(count).padStart(4)} (${percent}%)`);
  }

  // Summary
  console.log("\n" + "─".repeat(60));
  console.log("CONSOLIDATION SUMMARY:");
  console.log(`  Similar groups found: ${similarGroups.length}`);
  console.log(`  Stale memories: ${staleMemories.length}`);
  console.log(`  Total memories: ${stats.total}`);

  if (dryRun) {
    console.log("\nRun without --dry-run to apply changes.");
  }
}

async function cmdDaemon() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              SOUL DAEMON - Background Service                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("Starting soul maintenance daemon...");
  console.log("Press Ctrl+C to stop.\n");

  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  const runMaintenance = async () => {
    const now = new Date().toISOString();
    console.log(`\n[${now}] Running maintenance cycle...`);

    try {
      // Get stats
      const stats = await getMemoryStats();
      console.log(`  Total memories: ${stats.total}`);
      console.log(`  Recent (7 days): ${stats.recentCount}`);

      // Check for consolidation opportunities
      const memories = await listMemories({ limit: 100, sortBy: "recent" });
      let duplicateCount = 0;

      for (const memory of memories.slice(0, 20)) {
        const similar = await findSimilarMemories(memory.content, 0.9);
        if (similar.length > 1) {
          duplicateCount++;
        }
      }

      if (duplicateCount > 0) {
        console.log(`  ⚠ Found ${duplicateCount} potential duplicates - run 'consolidate' for details`);
      } else {
        console.log(`  ✓ No duplicates detected in recent memories`);
      }

      console.log(`  ✓ Maintenance cycle complete`);
    } catch (error) {
      console.error(`  ✗ Error:`, error);
    }
  };

  // Run immediately
  await runMaintenance();

  // Then periodically
  setInterval(runMaintenance, INTERVAL_MS);

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\n\nDaemon stopped.");
    process.exit(0);
  });

  // Keep running
  await new Promise(() => {}); // Never resolves
}

async function cmdReport() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                  SOUL HEALTH REPORT                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const stats = await getMemoryStats();
  const memories = await listMemories({ limit: 1000 });

  // Basic stats
  console.log("📊 OVERVIEW");
  console.log("─".repeat(40));
  console.log(`Total memories: ${stats.total}`);
  console.log(`Added this week: ${stats.recentCount}`);
  console.log(`Current project: ${config.current_project || "none"}\n`);

  // Type distribution
  console.log("📁 MEMORY TYPES");
  console.log("─".repeat(40));
  const typeOrder: MemoryType[] = ["decision", "pattern", "learning", "context", "preference", "todo", "reference", "summary"];

  for (const type of typeOrder) {
    const count = stats.byType[type] || 0;
    const bar = "█".repeat(Math.ceil((count / stats.total) * 20));
    const percent = ((count / stats.total) * 100).toFixed(1);
    console.log(`${type.padEnd(12)} ${bar.padEnd(20)} ${String(count).padStart(4)} (${percent}%)`);
  }

  // Access patterns
  console.log("\n🔥 MOST ACCESSED");
  console.log("─".repeat(40));
  const byAccess = [...memories].sort((a, b) => b.access_count - a.access_count).slice(0, 5);
  for (const m of byAccess) {
    if (m.access_count > 0) {
      console.log(`[${m.access_count}x] ${m.content.slice(0, 50)}...`);
    }
  }

  // High importance
  console.log("\n⭐ HIGH IMPORTANCE (4-5)");
  console.log("─".repeat(40));
  const highImportance = memories.filter((m) => m.importance >= 4).slice(0, 5);
  for (const m of highImportance) {
    console.log(`[${m.importance}★] ${m.type}: ${m.content.slice(0, 45)}...`);
  }

  // Pending TODOs
  const todos = memories.filter((m) => m.type === "todo");
  if (todos.length > 0) {
    console.log(`\n📋 PENDING TODOS (${todos.length})`);
    console.log("─".repeat(40));
    for (const t of todos.slice(0, 5)) {
      console.log(`□ ${t.content.slice(0, 55)}...`);
    }
  }

  // Health score
  console.log("\n💚 SOUL HEALTH SCORE");
  console.log("─".repeat(40));

  let healthScore = 100;
  const issues: string[] = [];

  // Check for imbalance
  const decisionCount = stats.byType["decision"] || 0;
  const learningCount = stats.byType["learning"] || 0;

  if (decisionCount === 0) {
    healthScore -= 20;
    issues.push("No decisions recorded - consider documenting key choices");
  }
  if (learningCount === 0) {
    healthScore -= 15;
    issues.push("No learnings recorded - capture insights as you work");
  }
  if (stats.recentCount === 0) {
    healthScore -= 10;
    issues.push("No recent activity - soul may be dormant");
  }

  const staleCount = memories.filter((m) => {
    const age = Date.now() - new Date(m.timestamp).getTime();
    return age > 30 * 24 * 60 * 60 * 1000 && m.access_count === 0 && m.importance <= 2;
  }).length;

  if (staleCount > 10) {
    healthScore -= 10;
    issues.push(`${staleCount} stale memories - run 'consolidate' to review`);
  }

  const scoreBar = "█".repeat(Math.ceil(healthScore / 5));
  console.log(`Score: ${healthScore}/100 ${scoreBar}`);

  if (issues.length > 0) {
    console.log("\nRecommendations:");
    for (const issue of issues) {
      console.log(`  • ${issue}`);
    }
  } else {
    console.log("\n✓ Soul is healthy!");
  }

  console.log("\n" + "═".repeat(60));
  console.log(`Report generated: ${new Date().toISOString()}`);
}

// ============================================================================
// Dream State Commands
// ============================================================================

async function cmdDream(args: string[]) {
  const mode = args[0] || "full";
  const dryRun = args.includes("--dry-run");
  const isDryRun = dryRun || mode === "--dry-run";
  
  const validModes = ["consolidate", "contradiction", "decay", "full"];
  if (!validModes.includes(mode) && mode !== "--dry-run") {
    console.error(`Invalid mode: ${mode}`);
    console.log(`Valid modes: ${validModes.join(", ")}`);
    process.exit(1);
  }
  
  const operations: DreamOperation[] = mode === "full" || mode === "--dry-run"
    ? ["contradiction", "consolidate", "decay"]
    : [mode as DreamOperation];
  
  console.log(`🌙 Entering dream state...`);
  console.log(`   Mode: ${mode === "--dry-run" ? "full" : mode}`);
  console.log(`   Dry run: ${isDryRun}\n`);
  
  // Fetch all memories
  const memories = await listMemories({ limit: 10000, sortBy: "recent" });
  console.log(`   Processing ${memories.length} memories...\n`);
  
  // Database operations adapter
  const dbOps: DreamDbOperations = {
    updateMemory,
    deleteMemory,
    saveMemory,
    supersedeMemory,
  };
  
  // Run dream cycle (with mutations if not dry-run)
  const report = isDryRun
    ? runDreamCycle(memories, {
        operations,
        dryRun: true,
        decayConfig: DEFAULT_DECAY_CONFIG,
        consolidationThreshold: 0.85,
      })
    : await runDreamCycleWithMutations(memories, {
        operations,
        dryRun: false,
        decayConfig: DEFAULT_DECAY_CONFIG,
        consolidationThreshold: 0.85,
      }, dbOps);
  
  // Print report
  console.log("═".repeat(50));
  console.log("DREAM REPORT");
  console.log("═".repeat(50));
  console.log(`Started:  ${report.started_at}`);
  console.log(`Finished: ${report.completed_at}`);
  console.log(`Memories: ${report.memories_processed}\n`);
  
  if (operations.includes("contradiction")) {
    console.log(`CONTRADICTIONS FOUND: ${report.contradictions_found.length}`);
    for (const c of report.contradictions_found) {
      console.log(`  • [${c.conflict_type}] ${c.memory_a} ↔ ${c.memory_b}`);
      console.log(`    ${c.explanation}`);
    }
    if (!isDryRun && report.contradictions_found.length > 0) {
      console.log(`  ✓ Temporal contradictions resolved via supersession`);
    }
    console.log();
  }
  
  if (operations.includes("consolidate")) {
    console.log(`CONSOLIDATION CANDIDATES: ${report.consolidations}`);
    if (!isDryRun && report.summaries_created.length > 0) {
      console.log(`  ✓ Created ${report.summaries_created.length} consolidated memories`);
    } else if (report.consolidations > 0 && isDryRun) {
      console.log(`  Run without --dry-run to merge similar memories`);
    }
    console.log();
  }
  
  if (operations.includes("decay")) {
    console.log(`IMPORTANCE DECAYED: ${report.memories_decayed} memories`);
    if (!isDryRun && report.memories_decayed > 0) {
      console.log(`  ✓ Importance values updated in database`);
    }
    console.log();
  }
  
  if (isDryRun) {
    console.log("💡 This was a dry run. No changes were made.");
  } else {
    console.log("✅ Dream cycle completed. Database updated.");
  }
  
  console.log("\n🌅 Waking from dream state.");
}

async function cmdInjectFounding(file: string) {
  const filePath = file || "founding-memories.md";
  
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.log(`Create a founding-memories.md file with your foundational memories.`);
    console.log(`See SOUL.md for format specification.`);
    process.exit(1);
  }
  
  console.log(`📜 Loading foundational memories from: ${filePath}\n`);
  
  const content = readFileSync(filePath, "utf-8");
  const parsed = parseFoundingMemories(content);
  
  if (parsed.length === 0) {
    console.log("No memories found in file. Check the format.");
    console.log("Expected: ## Category headers with - bullet points");
    process.exit(1);
  }
  
  console.log(`Found ${parsed.length} foundational memories:\n`);
  
  const byCategory = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const list = byCategory.get(p.category) || [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  
  for (const [cat, items] of byCategory) {
    console.log(`  ${cat.toUpperCase()} (${items.length})`);
    for (const item of items.slice(0, 3)) {
      console.log(`    • ${item.content.slice(0, 60)}...`);
    }
    if (items.length > 3) console.log(`    ... and ${items.length - 3} more`);
  }
  
  console.log(`\nInjecting into ${config.current_project || "default"} project...`);
  
  let saved = 0;
  for (const p of parsed) {
    const memory = createFoundationalMemory(p, config.current_project);
    
    // Check for duplicates
    const similar = await findSimilarMemories(memory.content, 0.9);
    if (similar.length > 0) {
      console.log(`  ⏭ Skipping (duplicate): ${memory.content.slice(0, 40)}...`);
      continue;
    }
    
    await saveMemory(memory);
    saved++;
  }
  
  console.log(`\n✅ Injected ${saved} foundational memories.`);
  if (saved < parsed.length) {
    console.log(`   (${parsed.length - saved} duplicates skipped)`);
  }
}

// ============================================================================
// Graph Enrichment Commands
// ============================================================================

async function cmdEnrich(args: string[]) {
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  const minSim = args.find(a => a.startsWith("--min-similarity="));
  const maxLinks = args.find(a => a.startsWith("--max-links="));

  const minSimilarity = minSim ? parseFloat(minSim.split("=")[1]) : 0.5;
  const maxLinksPerMemory = maxLinks ? parseInt(maxLinks.split("=")[1]) : 5;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              GRAPH ENRICHMENT - Thought Topology              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("Loading memories with embeddings...");
  const memories = await getAllMemoriesWithEmbeddings();

  if (memories.length === 0) {
    console.log("No memories found.");
    return;
  }

  console.log(`Found ${memories.length} memories. Analyzing graph structure...\n`);

  const result = analyzeGraphEnrichment(memories, {
    minSimilarity,
    maxLinksPerMemory,
  });

  // Display cluster analysis
  console.log("🏘️  LOCALITIES (Semantic Clusters)");
  console.log("─".repeat(60));
  console.log(`Found ${result.clustersFound} clusters\n`);

  // Sort clusters by size
  const sortedClusters = Array.from(result.clusters.entries())
    .sort((a, b) => b[1].length - a[1].length);

  for (const [clusterId, memberIds] of sortedClusters.slice(0, 10)) {
    const members = memberIds.map(id => memories.find(m => m.id === id)!).filter(Boolean);
    if (members.length === 0) continue;

    // Get dominant type in cluster
    const typeCounts: Record<string, number> = {};
    for (const m of members) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    }
    const dominantType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0][0];

    console.log(`  Cluster ${clusterId} (${members.length} memories, mostly ${dominantType})`);

    // Show sample content
    for (const m of members.slice(0, 2)) {
      const preview = m.content.slice(0, 50).replace(/\n/g, " ");
      console.log(`    • [${m.type}] ${preview}...`);
    }
    if (members.length > 2) {
      console.log(`    ... and ${members.length - 2} more`);
    }
    console.log();
  }

  // Display highway nodes
  console.log("🛣️  HIGHWAYS (Bridge Nodes)");
  console.log("─".repeat(60));
  console.log(`Identified ${result.highwaysIdentified} highway memories\n`);

  for (const highwayId of result.highways.slice(0, 5)) {
    const memory = memories.find(m => m.id === highwayId);
    if (!memory) continue;

    const preview = memory.content.slice(0, 60).replace(/\n/g, " ");
    console.log(`  🔗 [${memory.type}] ${preview}...`);
  }

  // Display proposed links
  console.log("\n\n📊 PROPOSED LINKS");
  console.log("─".repeat(60));
  console.log(`Total links to create: ${result.linksProposed}`);
  console.log(`  Cross-cluster bridges: ${result.crossClusterLinks}`);
  console.log(`  Highway connections: ${result.highwayLinks}\n`);

  // Group links by type
  const byType: Record<string, ProposedLink[]> = {};
  for (const link of result.proposedLinks) {
    byType[link.type] = byType[link.type] || [];
    byType[link.type].push(link);
  }

  console.log("Link types:");
  for (const [type, links] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${type}: ${links.length}`);
  }

  // Show sample links
  console.log("\nSample proposed links:");
  for (const link of result.proposedLinks.slice(0, 10)) {
    const source = memories.find(m => m.id === link.sourceId);
    const target = memories.find(m => m.id === link.targetId);
    if (!source || !target) continue;

    const sourcePreview = source.content.slice(0, 30).replace(/\n/g, " ");
    const targetPreview = target.content.slice(0, 30).replace(/\n/g, " ");
    const icon = link.isCrossCluster ? "🌉" : link.isHighwayConnection ? "🛣️" : "→";

    console.log(`  ${sourcePreview}...`);
    console.log(`    ${icon} --[${link.type}]--> ${targetPreview}...`);
    console.log(`       (similarity: ${(link.similarity * 100).toFixed(1)}%, strength: ${(link.strength * 100).toFixed(1)}%)`);
    console.log();
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("ENRICHMENT SUMMARY");
  console.log(`  Current link density: ${((memories.filter(m => m.related_memories && m.related_memories.length > 0).length / memories.length) * 100).toFixed(1)}%`);
  console.log(`  Proposed new links: ${result.linksProposed}`);
  console.log(`  Estimated new link density: ${(((memories.length + result.linksProposed) / memories.length / memories.length) * 100).toFixed(1)}%`);

  if (dryRun && !apply) {
    console.log("\n⚠️  DRY RUN - No changes made.");
    console.log("   Run with --apply to create the links.");
    return;
  }

  if (apply) {
    console.log("\n🔨 APPLYING LINKS...");
    let created = 0;
    let errors = 0;

    for (const proposed of result.proposedLinks) {
      try {
        await addMemoryLink(proposed.sourceId, {
          targetId: proposed.targetId,
          type: proposed.type,
          reason: proposed.reason,
          strength: proposed.strength,
          createdBy: "graph-enrichment",
        });
        created++;

        if (created % 50 === 0) {
          console.log(`  Created ${created} links...`);
        }
      } catch (error) {
        errors++;
      }
    }

    console.log(`\n✅ Created ${created} links.`);
    if (errors > 0) {
      console.log(`⚠️  ${errors} errors encountered.`);
    }
  } else {
    console.log("\nRun with --dry-run to preview or --apply to create links.");
  }
}

function printHelp() {
  console.log(`
Claude Memory CLI - Digital Soul Management
============================================

BASIC COMMANDS:
  search <query>     Search memories semantically
  list [limit]       List recent memories (default: 20)
  stats              Show memory statistics
  get <id>           Get full memory by ID
  delete <id>        Delete a memory
  add <content>      Add a quick memory

DATA MANAGEMENT:
  export [file]      Export all memories to JSON
  import <file>      Import memories from JSON

PROJECT MANAGEMENT:
  projects           List all projects
  set-project <name> Set current project
  config             Show current configuration

MAINTENANCE (Soul CNS):
  consolidate        Find and merge similar memories (--dry-run for preview)
  daemon             Run background maintenance service
  report             Generate soul health report

DREAM STATE (Soul Reorganization):
  dream [mode]       Run dream cycle to reorganize memories
                     Modes: consolidate, contradiction, decay, full (default)
                     Add --dry-run to preview changes
  inject-founding    Load foundational memories from founding-memories.md
                     These define identity, goals, values, constraints

GRAPH ENRICHMENT (Thought Topology):
  enrich [options]   Analyze and create links between memories
                     --dry-run    Preview without making changes
                     --apply      Create the proposed links
                     --min-similarity=0.5   Minimum similarity threshold
                     --max-links=5          Max links per memory

  help               Show this help

EXAMPLES:
  npx ts-node src/cli.ts search "authentication decisions"
  npx ts-node src/cli.ts list 10
  npx ts-node src/cli.ts consolidate --dry-run
  npx ts-node src/cli.ts report
  npx ts-node src/cli.ts daemon
  npx ts-node src/cli.ts dream --dry-run
  npx ts-node src/cli.ts dream contradiction
  npx ts-node src/cli.ts inject-founding founding-memories.md
`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
