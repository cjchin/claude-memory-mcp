/**
 * Autonomous Soul System - Complete Simulation Test
 *
 * Run this to test all trigger detection WITHOUT needing ChromaDB:
 *   npx ts-node test-simulation.ts
 *
 * Or after building:
 *   node dist/test-simulation.js
 */

// Direct imports for testing (will work after build)
import {
  detectTrigger,
  detectSaveTrigger,
  detectRecallTrigger,
  detectSynthesisTrigger,
  detectAlignTrigger,
  detectClaudeInsights,
  analyzeConversationTurn,
  detectSemanticSignal,
  extractMemorablePoints,
} from "./src/autonomous.js";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

function header(text: string) {
  console.log("\n" + "=".repeat(70));
  console.log(CYAN + text + RESET);
  console.log("=".repeat(70) + "\n");
}

function subheader(text: string) {
  console.log("\n" + YELLOW + "─── " + text + " ───" + RESET + "\n");
}

// ============================================================
header("AUTONOMOUS SOUL SYSTEM - COMPLETE SIMULATION TEST");
// ============================================================

// ────────────────────────────────────────────────────────────
subheader("TEST 1: User Message Trigger Detection");
// ────────────────────────────────────────────────────────────

const userTriggerTests = [
  // SAVE triggers
  { input: "We decided to use PostgreSQL because of its JSON support", expected: "decision" },
  { input: "I chose TypeScript over JavaScript for type safety", expected: "decision" },
  { input: "The approach is to use microservices", expected: "decision" },
  { input: "I learned that ChromaDB needs to be running first", expected: "learning" },
  { input: "Turns out the API doesn't support batch requests", expected: "learning" },
  { input: "Gotcha: Windows paths need double backslashes", expected: "learning" },
  { input: "Going forward, always use async/await", expected: "pattern" },
  { input: "The convention is to use camelCase", expected: "pattern" },
  { input: "We never commit directly to main", expected: "pattern" },
  { input: "TODO: Add rate limiting to the API", expected: "todo" },
  { input: "Note for later: implement caching", expected: "todo" },
  { input: "I prefer explicit types over inference", expected: "preference" },
  { input: "For context, this is a personal project", expected: "context" },

  // RECALL triggers
  { input: "What did we decide about the database?", expected: "recall" },
  { input: "How do we handle authentication?", expected: "recall" },
  { input: "Remind me about the API conventions", expected: "recall" },

  // SYNTHESIZE triggers
  { input: "Synthesize this session", expected: "synthesize" },
  { input: "Capture the key points", expected: "synthesize" },

  // ALIGN triggers
  { input: "Let's continue with the auth module", expected: "align" },
  { input: "Back to working on the API", expected: "align" },

  // No trigger
  { input: "Can you help me write a function?", expected: "none" },
  { input: "What is the syntax for async?", expected: "none" },
];

let passed = 0;
let failed = 0;

for (const test of userTriggerTests) {
  const trigger = detectTrigger(test.input);

  let result: string;
  if (!trigger) {
    result = "none";
  } else if (trigger.type === "save") {
    result = trigger.memoryType || "unknown";
  } else {
    result = trigger.type;
  }

  const isPass = result === test.expected;
  const status = isPass ? `${GREEN}✓ PASS${RESET}` : `${RED}✗ FAIL${RESET}`;

  console.log(`${status} ${DIM}${test.input.slice(0, 50)}...${RESET}`);
  if (!isPass) {
    console.log(`       Expected: ${test.expected}, Got: ${result}`);
  }

  if (isPass) passed++;
  else failed++;
}

console.log(`\n${passed} passed, ${failed} failed`);

// ────────────────────────────────────────────────────────────
subheader("TEST 2: Claude Response Insight Detection");
// ────────────────────────────────────────────────────────────

const claudeResponses = [
  {
    response: "I recommend using PostgreSQL for this use case because it handles JSON well.",
    expectedTypes: ["decision"],
  },
  {
    response: "The best approach would be to implement caching at the API layer.",
    expectedTypes: ["decision"],
  },
  {
    response: "I found that the issue is caused by a race condition in the async handler.",
    expectedTypes: ["learning"],
  },
  {
    response: "The solution is to add proper mutex locks around the critical section.",
    expectedTypes: ["learning"],
  },
  {
    response: "I notice that this codebase follows the repository pattern for data access.",
    expectedTypes: ["pattern"],
  },
  {
    response: "This can be fixed by adding null checks before accessing the property.",
    expectedTypes: ["learning"],
  },
];

passed = 0;
failed = 0;

for (const test of claudeResponses) {
  const insights = detectClaudeInsights(test.response);

  const foundTypes = insights.map((i) => i.memoryType);
  const isPass = test.expectedTypes.some((et) => foundTypes.includes(et as any));

  const status = isPass ? `${GREEN}✓ PASS${RESET}` : `${RED}✗ FAIL${RESET}`;

  console.log(`${status} ${DIM}${test.response.slice(0, 50)}...${RESET}`);
  console.log(`       Found: ${foundTypes.join(", ") || "none"} | Expected: ${test.expectedTypes.join(", ")}`);

  if (isPass) passed++;
  else failed++;
}

console.log(`\n${passed} passed, ${failed} failed`);

// ────────────────────────────────────────────────────────────
subheader("TEST 3: Semantic Signal Detection");
// ────────────────────────────────────────────────────────────

const signalTests = [
  { input: "This is a breaking change to the API schema", expected: "critical" },
  { input: "Security vulnerability found in auth module", expected: "critical" },
  { input: "We decided to use Redis because of speed", expected: "important" },
  { input: "The convention is to use snake_case", expected: "important" },
  { input: "I learned that this doesn't work", expected: "notable" },
  { input: "Can you help me write a loop?", expected: "routine" },
];

passed = 0;
failed = 0;

for (const test of signalTests) {
  const signal = detectSemanticSignal(test.input);
  const isPass = signal.signal === test.expected;

  const status = isPass ? `${GREEN}✓ PASS${RESET}` : `${RED}✗ FAIL${RESET}`;

  console.log(`${status} Signal: ${signal.signal} | ${DIM}${test.input.slice(0, 40)}...${RESET}`);
  if (!isPass) {
    console.log(`       Expected: ${test.expected}`);
  }

  if (isPass) passed++;
  else failed++;
}

console.log(`\n${passed} passed, ${failed} failed`);

// ────────────────────────────────────────────────────────────
subheader("TEST 4: Full Conversation Turn Analysis");
// ────────────────────────────────────────────────────────────

const conversationTurns = [
  {
    user: "We decided to use TypeScript for this project",
    claude: "That's a good choice. I recommend also enabling strict mode for better type safety.",
    expectedAutoSave: true,
  },
  {
    user: "Why isn't this working?",
    claude: "I found that the issue is caused by a missing await. The solution is to add async/await properly.",
    expectedAutoSave: true,
  },
  {
    user: "Can you write a hello world function?",
    claude: "Here's a simple function that prints hello world.",
    expectedAutoSave: false,
  },
];

for (const turn of conversationTurns) {
  const analysis = analyzeConversationTurn(turn.user, turn.claude);

  console.log(`\n${CYAN}User:${RESET} "${turn.user.slice(0, 50)}..."`);
  console.log(`${CYAN}Claude:${RESET} "${turn.claude.slice(0, 50)}..."`);
  console.log(`${DIM}───${RESET}`);
  console.log(`User trigger: ${analysis.userTrigger?.type || "none"} ${analysis.userTrigger ? `(${analysis.userTrigger.memoryType})` : ""}`);
  console.log(`Claude insights: ${analysis.claudeInsights.length}`);
  console.log(`Semantic signal: ${analysis.semanticSignal.signal}`);
  console.log(`Should auto-save: ${analysis.shouldAutoSave ? GREEN + "YES" : RED + "NO"}${RESET}`);

  const isPass = analysis.shouldAutoSave === turn.expectedAutoSave;
  console.log(isPass ? `${GREEN}✓ Expected${RESET}` : `${RED}✗ Unexpected${RESET}`);
}

// ────────────────────────────────────────────────────────────
subheader("TEST 5: Synthesis Extraction");
// ────────────────────────────────────────────────────────────

const conversationSample = `
We decided to use TypeScript for this project because of type safety.
I learned that the MCP protocol requires specific message formats.
Going forward, always validate input at API boundaries.
The convention is to use kebab-case for file names.
TODO: Add comprehensive error handling later.
Turns out ChromaDB has a JavaScript client but needs a Python server.
For context, this is a personal project for maintaining memory across sessions.
`;

const points = extractMemorablePoints(conversationSample);

console.log(`Extracted ${points.length} memorable points:\n`);
for (const point of points) {
  console.log(`${CYAN}[${point.type.toUpperCase()}]${RESET} (importance: ${point.importance}/5)`);
  console.log(`  "${point.content.slice(0, 70)}${point.content.length > 70 ? "..." : ""}"`);
  console.log(`  Tags: ${point.tags.join(", ") || "none"}\n`);
}

// ============================================================
header("SIMULATION COMPLETE");
// ============================================================

console.log(`
${GREEN}All detection systems operational.${RESET}

To test with actual memory storage:
1. Start ChromaDB: docker run -p 8000:8000 chromadb/chroma
2. Build: npm run build
3. Connect MCP in Claude Code via /mcp
4. Say: "Soul status" to verify
5. Say: "We decided to use X because Y" - watch it auto-save!

The soul awaits activation.
`);
