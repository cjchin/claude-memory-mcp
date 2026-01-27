# Soul-MCP Dotfiles

Claude Code configuration files for the digital soul system.

## Quick Setup (New PC)

### One-Liner

**Windows (PowerShell as Admin):**
```powershell
irm https://raw.githubusercontent.com/cjchin/soul-mcp/master/dotfiles/setup.ps1 | iex
```

**Mac/Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/cjchin/soul-mcp/master/dotfiles/setup.sh | bash
```

The script will:
1. Check for Node.js and Python
2. Install Claude Code and GitHub CLI
3. Clone soul-mcp repository
4. Build the MCP server
5. Install ChromaDB
6. Apply Claude Code settings

## What's Included

### `claude/CLAUDE.md`
Global instructions for Claude - memory hierarchy, startup protocol, autonomous behaviors.

### `claude/settings.json`
Global permissions template:
- File operations (Read, Edit, Write)
- Common CLI tools (git, npm, node, python, docker, etc.)
- Soul MCP tools (`mcp__claude-memory__*`)

### `claude/settings.local.json`
Personal preferences:
- `defaultMode: acceptEdits` - auto-approve file edits
- `alwaysThinkingEnabled` - extended thinking mode

## After Setup

1. **Start ChromaDB:**
   ```bash
   chroma run --host localhost --port 8000 --path /path/to/soul-mcp/chroma-data
   ```

2. **Run Claude Code:**
   ```bash
   claude
   ```

3. **Verify soul connection:**
   ```
   /mcp
   ```

4. **Prime your context:**
   Just say "prime" and Claude will load your memories.

## Updating Settings

Changes to `~/.claude/` settings are local to that machine. To sync:

```bash
# Copy to dotfiles
cp ~/.claude/CLAUDE.md /path/to/soul-mcp/dotfiles/claude/
cp ~/.claude/settings.json /path/to/soul-mcp/dotfiles/claude/

# Commit
cd /path/to/soul-mcp
git add dotfiles/
git commit -m "Update dotfiles"
git push
```

## Migrating Soul Data

To move your memories to a new machine:

```bash
# On old machine: export
node dist/cli.js export --output soul-backup.json

# On new machine: import
node dist/cli.js import --input soul-backup.json
```
