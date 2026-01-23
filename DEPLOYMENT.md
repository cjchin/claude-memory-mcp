# Deployment Guide

How to deploy the Claude Memory MCP to another machine.

## Option 1: Clone from Private Repo (Recommended)

### On the new machine:

```bash
# 1. Clone your private repo
git clone https://github.com/YOUR_USERNAME/claude-memory-mcp.git
cd claude-memory-mcp

# 2. Run setup
.\scripts\setup.ps1

# 3. Start ChromaDB
.\start-chroma.ps1

# 4. Configure Claude Code
# Add to ~/.claude/settings.json (see below)
```

### Claude Code Configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/claude-memory-mcp/dist/index.js"]
    }
  }
}
```

### Migrate Soul Data

On the old machine:
```bash
node dist/cli.js export soul-backup.json
```

Copy `soul-backup.json` to the new machine.

On the new machine:
```bash
node dist/cli.js import soul-backup.json
```

---

## Option 2: Install from npm (Future)

If you publish to npm:

```bash
npm install -g claude-memory-mcp
```

---

## Option 3: Install Directly from Git

```bash
npm install -g git+https://github.com/YOUR_USERNAME/claude-memory-mcp.git
```

---

## Data Locations

| What | Location | Portable? |
|------|----------|-----------|
| Config | `~/.claude-memory/config.json` | Yes, copy it |
| Memories | ChromaDB (./chroma-data or Docker volume) | Export/import via CLI |
| Embedding model | `~/.cache/huggingface/` | Auto-downloads |

---

## Multi-Machine Sync (Advanced)

For syncing soul data across machines, options:

### A. Manual Export/Import
- Run `export` before leaving a machine
- Run `import` on the other machine

### B. Shared ChromaDB Server
- Host ChromaDB on a server
- Point all machines to `chroma_host` in config

### C. Cloud ChromaDB
- Use Chroma Cloud (when available)
- Or self-host on a VPS

---

## Vessel vs Soul Summary

```
VESSEL (Code) - Portable, Shareable
├── Clone repo to new machine
├── npm install && npm run build
└── Same code everywhere

SOUL (Data) - Private, Personal
├── Export as JSON backup
├── Import on new machine
└── Never commit to repo
```

---

## Quick Checklist for New Machine

- [ ] Node.js 18+ installed
- [ ] Git clone the repo
- [ ] Run `npm install && npm run build`
- [ ] ChromaDB running (Docker or Python)
- [ ] Claude Code settings updated
- [ ] Import soul backup (if migrating)
- [ ] Run `/mcp` in Claude Code to connect
- [ ] Test with `soul_status`
