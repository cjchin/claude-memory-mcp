/**
 * Tool Registration Barrel
 *
 * Central export for all tool registration functions.
 * Import this file and call the individual register functions with the MCP server.
 */

export { registerShadowTools, recordToolActivity } from "./shadow-tools.js";
export { registerSessionTools } from "./session-tools.js";
export { registerProjectTools } from "./project-tools.js";
export { registerUtilityTools } from "./utility-tools.js";
export { registerCoreTools } from "./core-tools.js";
export { registerIntrospectTools } from "./introspect-tools.js";
export { registerLlmTools } from "./llm-tools.js";
export { registerGraphTools } from "./graph-tools.js";
export { registerPolicyTools, policyEngine } from "./policy-tools.js";
export { registerDreamTools } from "./dream-tools.js";
export { registerAutonomousTools } from "./autonomous-tools.js";
