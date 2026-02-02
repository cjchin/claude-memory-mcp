/**
 * Policy Engine Tools
 *
 * Graduated autonomy and project management:
 * - policy_status: View and manage the policy engine
 * - assign_project: Assign a memory to a project
 * - bulk_assign_projects: Analyze and assign projects in bulk
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getMemory,
  updateMemory,
  getMemoryStats,
  listMemories,
  listProjects,
} from "../db.js";
import type { Memory } from "../types.js";
import {
  createPersistentPolicyEngine,
  savePolicyEngine,
  ACTION_METADATA,
  type WalkerAction,
} from "../policy.js";

// Initialize policy engine
const policyEngine = createPersistentPolicyEngine();

export { policyEngine };

export function registerPolicyTools(server: McpServer): void {
  server.tool(
    "policy_status",
    {
      action: z.enum(["status", "trust_details", "reset_trust"])
        .describe("status: overview. trust_details: per-action scores. reset_trust: reset one action."),
      walker_action: z.string().optional()
        .describe("For reset_trust: which action to reset (e.g., 'link_memories')"),
    },
    async ({ action, walker_action }) => {
      const sections: string[] = [];

      switch (action) {
        case "status": {
          const status = policyEngine.getStatus();
          sections.push(`⚖️ POLICY ENGINE STATUS\n${"═".repeat(40)}\n`);
          sections.push(`Enabled: ${status.enabled}`);
          sections.push(`Total proposals processed: ${status.totalProposals}`);
          sections.push(`Approval rate: ${(status.approvalRate * 100).toFixed(1)}%`);
          sections.push(`Human review rate: ${(status.humanReviewRate * 100).toFixed(1)}%`);
          sections.push(`\nActions with trust scores: ${status.trustScores.length}`);

          const highTrust = status.trustScores.filter(t => t.score >= 0.7);
          const medTrust = status.trustScores.filter(t => t.score >= 0.4 && t.score < 0.7);
          const lowTrust = status.trustScores.filter(t => t.score < 0.4);

          sections.push(`  High trust (≥70%): ${highTrust.length} actions`);
          sections.push(`  Medium trust (40-70%): ${medTrust.length} actions`);
          sections.push(`  Low trust (<40%): ${lowTrust.length} actions`);
          sections.push(`\n💡 Use policy_status({ action: "trust_details" }) for per-action breakdown.`);
          break;
        }

        case "trust_details": {
          const status = policyEngine.getStatus();
          sections.push(`📊 TRUST SCORES BY ACTION\n${"═".repeat(40)}\n`);

          const allActions = Object.keys(ACTION_METADATA) as WalkerAction[];

          for (const act of allActions) {
            const meta = ACTION_METADATA[act];
            const trust = status.trustScores.find(t => t.action === act);
            const score = trust?.score ?? 0;
            const bar = "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));

            sections.push(`${act}:`);
            sections.push(`  Trust: [${bar}] ${(score * 100).toFixed(0)}%`);
            sections.push(`  Risk: ${meta.risk} | Default: ${meta.defaultDecision} | Min for auto: ${(meta.minTrustForAuto * 100).toFixed(0)}%`);
            if (trust) {
              sections.push(`  History: ${trust.approved} approved, ${trust.rejected} rejected, ${trust.autoApproved} auto`);
            }
            sections.push("");
          }
          break;
        }

        case "reset_trust": {
          if (!walker_action) {
            return { content: [{ type: "text" as const, text: "❌ walker_action required for reset_trust" }] };
          }

          if (!ACTION_METADATA[walker_action as WalkerAction]) {
            const validActions = Object.keys(ACTION_METADATA).join(", ");
            return { content: [{ type: "text" as const, text: `❌ Unknown action: ${walker_action}\nValid actions: ${validActions}` }] };
          }

          policyEngine.setTrustScore({
            action: walker_action as WalkerAction,
            score: 0,
            totalProposals: 0,
            approved: 0,
            rejected: 0,
            autoApproved: 0,
            lastUpdated: new Date().toISOString(),
          });
          savePolicyEngine(policyEngine);

          sections.push(`✅ Reset trust for "${walker_action}" to 0%`);
          sections.push(`The system will now require review for this action until trust is rebuilt.`);
          break;
        }
      }

      return { content: [{ type: "text" as const, text: sections.join("\n") }] };
    }
  );

  server.tool(
    "assign_project",
    {
      memory_id: z.string().describe("Memory ID to assign"),
      project: z.string().describe("Project name to assign to"),
    },
    async ({ memory_id, project }) => {
      const memory = await getMemory(memory_id);
      if (!memory) {
        return { content: [{ type: "text" as const, text: `❌ Memory not found: ${memory_id}` }] };
      }

      const oldProject = memory.project || "unassigned";
      await updateMemory(memory_id, { project });

      return {
        content: [{
          type: "text" as const,
          text: `✅ Moved memory from "${oldProject}" to "${project}"\n   "${memory.content.slice(0, 60)}..."`,
        }],
      };
    }
  );

  server.tool(
    "bulk_assign_projects",
    {
      action: z.enum(["analyze", "suggest", "apply"])
        .describe("analyze: show stats. suggest: propose assignments. apply: execute assignments."),
      assignments: z.array(z.object({
        memory_id: z.string(),
        project: z.string(),
      })).optional().describe("For apply: the assignments to execute"),
      limit: z.number().optional().default(20).describe("Max suggestions to generate"),
    },
    async ({ action, assignments, limit }) => {
      const sections: string[] = [];

      switch (action) {
        case "analyze": {
          const stats = await getMemoryStats();
          const unassigned = stats.byProject["unassigned"] || stats.byProject[""] || 0;
          const projects = await listProjects();

          sections.push(`📊 PROJECT ASSIGNMENT ANALYSIS\n${"═".repeat(40)}\n`);
          sections.push(`Total memories: ${stats.total}`);
          sections.push(`Unassigned: ${unassigned} (${stats.total > 0 ? ((unassigned / stats.total) * 100).toFixed(1) : 0}%)`);
          sections.push(`\nExisting projects (${projects.length}):`);

          for (const p of projects) {
            const count = stats.byProject[p.name] || 0;
            sections.push(`  • ${p.name}: ${count} memories`);
          }

          sections.push(`\n💡 Use bulk_assign_projects({ action: "suggest" }) to get assignment proposals.`);
          break;
        }

        case "suggest": {
          const allMemories = await listMemories({ limit: 500 });
          const unassigned = allMemories.filter(m => !m.project || m.project === "");

          if (unassigned.length === 0) {
            return { content: [{ type: "text" as const, text: "✅ All memories are assigned to projects!" }] };
          }

          const projects = await listProjects();
          const projectMemories: Record<string, Memory[]> = {};

          for (const p of projects) {
            projectMemories[p.name] = allMemories.filter(m => m.project === p.name);
          }

          sections.push(`📋 SUGGESTED ASSIGNMENTS (${Math.min(unassigned.length, limit)} of ${unassigned.length})\n`);

          const suggestions: Array<{ memory_id: string; project: string; reason: string }> = [];

          for (const mem of unassigned.slice(0, limit)) {
            let bestProject = "";
            let bestScore = 0;
            let bestReason = "";

            for (const [projName, projMems] of Object.entries(projectMemories)) {
              if (projMems.length === 0) continue;

              const projTags = new Set(projMems.flatMap(m => m.tags));
              const memTags = new Set(mem.tags);
              const overlap = [...memTags].filter(t => projTags.has(t));
              const score = overlap.length / Math.max(memTags.size, 1);

              if (score > bestScore) {
                bestScore = score;
                bestProject = projName;
                bestReason = overlap.length > 0 ? `Tags: ${overlap.slice(0, 3).join(", ")}` : "Best semantic match";
              }
            }

            if (bestProject && bestScore > 0.2) {
              suggestions.push({ memory_id: mem.id, project: bestProject, reason: bestReason });
              sections.push(`• "${mem.content.slice(0, 50)}..."`);
              sections.push(`  → ${bestProject} (${bestReason})`);
              sections.push("");
            }
          }

          if (suggestions.length > 0) {
            sections.push(`\n💡 To apply these suggestions:`);
            sections.push(`bulk_assign_projects({`);
            sections.push(`  action: "apply",`);
            sections.push(`  assignments: [`);
            for (const s of suggestions.slice(0, 5)) {
              sections.push(`    { memory_id: "${s.memory_id}", project: "${s.project}" },`);
            }
            if (suggestions.length > 5) sections.push(`    // ... ${suggestions.length - 5} more`);
            sections.push(`  ]`);
            sections.push(`})`);
          } else {
            sections.push(`No confident project assignments found.`);
            sections.push(`Consider creating projects first or manually assigning memories.`);
          }
          break;
        }

        case "apply": {
          if (!assignments || assignments.length === 0) {
            return { content: [{ type: "text" as const, text: "❌ No assignments provided" }] };
          }

          let success = 0;
          let failed = 0;

          for (const { memory_id, project } of assignments) {
            try {
              await updateMemory(memory_id, { project });
              success++;
            } catch (e) {
              failed++;
            }
          }

          sections.push(`✅ Applied ${success} assignments`);
          if (failed > 0) sections.push(`❌ Failed: ${failed}`);
          break;
        }
      }

      return { content: [{ type: "text" as const, text: sections.join("\n") }] };
    }
  );
}
