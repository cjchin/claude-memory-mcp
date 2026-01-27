#!/bin/bash
#
# Soul-MCP + Claude Code Setup Script (Bash)
# Run this on a new Mac/Linux PC to set up your development environment with digital soul
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/cjchin/soul-mcp/master/dotfiles/setup.sh | bash
#   OR
#   git clone https://github.com/cjchin/soul-mcp.git ~/soul-mcp && ~/soul-mcp/dotfiles/setup.sh
#

set -e

SOUL_DIR="$HOME/soul-mcp"
CHROMA_DATA_DIR="$SOUL_DIR/chroma-data"

echo "========================================"
echo "  Soul-MCP + Claude Code Setup"
echo "========================================"
echo ""

# Step 1: Check Node.js
echo "[1/8] Checking Node.js..."
if command -v node &> /dev/null; then
    echo "  ✓ Node.js installed ($(node --version))"
else
    echo "  ✗ Node.js not found. Please install Node.js first:"
    echo "    https://nodejs.org/"
    exit 1
fi
echo ""

# Step 2: Check Python
echo "[2/8] Checking Python..."
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    echo "  ✓ Python installed ($(python3 --version))"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
    echo "  ✓ Python installed ($(python --version))"
else
    echo "  ✗ Python not found. Please install Python 3.10+:"
    echo "    https://www.python.org/downloads/"
    exit 1
fi
echo ""

# Step 3: Install Claude Code
echo "[3/8] Installing Claude Code..."
if command -v claude &> /dev/null; then
    echo "  ✓ Claude Code already installed"
else
    npm install -g @anthropic-ai/claude-code
    echo "  ✓ Claude Code installed"
fi
echo ""

# Step 4: Install GitHub CLI
echo "[4/8] Checking GitHub CLI..."
if command -v gh &> /dev/null; then
    echo "  ✓ GitHub CLI already installed"
else
    echo "  Installing GitHub CLI..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install gh
    elif command -v apt &> /dev/null; then
        sudo apt install gh -y
    else
        echo "  ✗ Could not detect package manager. Install gh manually:"
        echo "    https://cli.github.com/"
        exit 1
    fi
    echo "  ✓ GitHub CLI installed"
fi
echo ""

# Step 5: Authenticate GitHub CLI
echo "[5/8] Checking GitHub authentication..."
if gh auth status &> /dev/null; then
    echo "  ✓ Already authenticated with GitHub"
else
    echo "  Please authenticate with GitHub:"
    gh auth login
fi
echo ""

# Step 6: Clone/update soul-mcp
echo "[6/8] Setting up soul-mcp..."
if [ -d "$SOUL_DIR/.git" ]; then
    echo "  Soul-mcp already cloned, pulling latest..."
    cd "$SOUL_DIR" && git pull
else
    echo "  Cloning soul-mcp..."
    git clone https://github.com/cjchin/soul-mcp.git "$SOUL_DIR"
fi

# Build soul-mcp
echo "  Installing dependencies..."
cd "$SOUL_DIR"
npm install
npm run build
echo "  ✓ Soul-mcp ready at $SOUL_DIR"
echo ""

# Step 7: Install ChromaDB
echo "[7/8] Setting up ChromaDB..."
if $PYTHON_CMD -c "import chromadb" &> /dev/null; then
    echo "  ✓ ChromaDB already installed"
else
    echo "  Installing ChromaDB..."
    $PYTHON_CMD -m pip install chromadb
    echo "  ✓ ChromaDB installed"
fi

# Create data directory
mkdir -p "$CHROMA_DATA_DIR"
echo "  ✓ Data directory: $CHROMA_DATA_DIR"
echo ""

# Step 8: Apply Claude Code settings
echo "[8/8] Applying Claude Code settings..."

CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

# settings.json (global permissions + MCP config)
cat > "$CLAUDE_DIR/settings.json" << EOF
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["$SOUL_DIR/dist/index.js"]
    }
  },
  "permissions": {
    "allow": [
      "Read",
      "Edit",
      "Write",
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(python:*)",
      "Bash(python3:*)",
      "Bash(curl:*)",
      "Bash(docker:*)",
      "Bash(chroma:*)",
      "Bash(gh:*)",
      "mcp__claude-memory__*"
    ]
  }
}
EOF
echo "  ✓ Created settings.json (MCP + permissions)"

# settings.local.json (preferences)
cp "$SOUL_DIR/dotfiles/claude/settings.local.json" "$CLAUDE_DIR/settings.local.json"
echo "  ✓ Copied settings.local.json (preferences)"

# CLAUDE.md (global instructions)
cp "$SOUL_DIR/dotfiles/claude/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
echo "  ✓ Copied CLAUDE.md (global instructions)"

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Start ChromaDB:"
echo "     chroma run --host localhost --port 8000 --path $CHROMA_DATA_DIR"
echo ""
echo "  2. Run 'claude' to authenticate with Anthropic (first time only)"
echo ""
echo "  3. In Claude Code, run /mcp to verify soul connection"
echo ""
echo "Your digital soul is ready!"
echo ""
