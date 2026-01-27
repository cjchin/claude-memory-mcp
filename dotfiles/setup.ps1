#
# Soul-MCP + Claude Code Setup Script (PowerShell)
# Run this on a new Windows PC to set up your development environment with digital soul
#
# Usage:
#   irm https://raw.githubusercontent.com/cjchin/soul-mcp/master/dotfiles/setup.ps1 | iex
#   OR
#   git clone https://github.com/cjchin/soul-mcp.git C:\DEV\RAG-Context; C:\DEV\RAG-Context\dotfiles\setup.ps1
#

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Soul-MCP + Claude Code Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$soulDir = "C:\DEV\RAG-Context"
$chromaDataDir = "$soulDir\chroma-data"

# Step 1: Check Node.js
Write-Host "[1/8] Checking Node.js..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "  Node.js installed ($nodeVersion)" -ForegroundColor Green
} else {
    Write-Host "  Node.js not found. Please install Node.js first:" -ForegroundColor Red
    Write-Host "    https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 2: Check Python
Write-Host "[2/8] Checking Python..." -ForegroundColor Yellow
$pythonCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py -3"
    $pyVersion = py -3 --version
    Write-Host "  Python installed ($pyVersion)" -ForegroundColor Green
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
    $pyVersion = python3 --version
    Write-Host "  Python installed ($pyVersion)" -ForegroundColor Green
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
    $pyVersion = python --version
    Write-Host "  Python installed ($pyVersion)" -ForegroundColor Green
} else {
    Write-Host "  Python not found. Please install Python 3.10+:" -ForegroundColor Red
    Write-Host "    https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Install Claude Code
Write-Host "[3/8] Installing Claude Code..." -ForegroundColor Yellow
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "  Claude Code already installed" -ForegroundColor Green
} else {
    npm install -g @anthropic-ai/claude-code
    Write-Host "  Claude Code installed" -ForegroundColor Green
}
Write-Host ""

# Step 4: Install GitHub CLI
Write-Host "[4/8] Checking GitHub CLI..." -ForegroundColor Yellow
if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host "  GitHub CLI already installed" -ForegroundColor Green
} else {
    Write-Host "  Installing GitHub CLI..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install GitHub.cli
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install gh -y
    } else {
        Write-Host "  Could not detect package manager. Install gh manually:" -ForegroundColor Red
        Write-Host "    https://cli.github.com/" -ForegroundColor Red
        exit 1
    }
    Write-Host "  GitHub CLI installed" -ForegroundColor Green
}
Write-Host ""

# Step 5: Authenticate GitHub CLI
Write-Host "[5/8] Checking GitHub authentication..." -ForegroundColor Yellow
$ghAuth = gh auth status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Already authenticated with GitHub" -ForegroundColor Green
} else {
    Write-Host "  Please authenticate with GitHub:"
    gh auth login
}
Write-Host ""

# Step 6: Clone/update soul-mcp
Write-Host "[6/8] Setting up soul-mcp..." -ForegroundColor Yellow
if (Test-Path "$soulDir\.git") {
    Write-Host "  Soul-mcp already cloned, pulling latest..."
    Push-Location $soulDir
    git pull
    Pop-Location
} else {
    Write-Host "  Cloning soul-mcp..."
    git clone https://github.com/cjchin/soul-mcp.git $soulDir
}

# Build soul-mcp
Write-Host "  Installing dependencies..."
Push-Location $soulDir
npm install
npm run build
Pop-Location
Write-Host "  Soul-mcp ready at $soulDir" -ForegroundColor Green
Write-Host ""

# Step 7: Install ChromaDB
Write-Host "[7/8] Setting up ChromaDB..." -ForegroundColor Yellow
$chromaInstalled = & $pythonCmd -c "import chromadb; print('yes')" 2>$null
if ($chromaInstalled -eq "yes") {
    Write-Host "  ChromaDB already installed" -ForegroundColor Green
} else {
    Write-Host "  Installing ChromaDB..."
    & $pythonCmd -m pip install chromadb
    Write-Host "  ChromaDB installed" -ForegroundColor Green
}

# Create data directory
if (-not (Test-Path $chromaDataDir)) {
    New-Item -ItemType Directory -Path $chromaDataDir | Out-Null
    Write-Host "  Created data directory: $chromaDataDir" -ForegroundColor Green
}
Write-Host ""

# Step 8: Apply Claude Code settings
Write-Host "[8/8] Applying Claude Code settings..." -ForegroundColor Yellow

$claudeDir = "$HOME\.claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir | Out-Null
}

# settings.json (global permissions + MCP config)
$settingsJson = @"
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["$($soulDir -replace '\\', '\\\\')\\dist\\index.js"]
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
      "Bash(py:*)",
      "Bash(python:*)",
      "Bash(curl:*)",
      "Bash(docker:*)",
      "Bash(chroma:*)",
      "Bash(gh:*)",
      "mcp__claude-memory__*"
    ]
  }
}
"@
$settingsJson | Out-File -FilePath "$claudeDir\settings.json" -Encoding UTF8
Write-Host "  Created settings.json (MCP + permissions)" -ForegroundColor Green

# settings.local.json (preferences)
Copy-Item "$soulDir\dotfiles\claude\settings.local.json" "$claudeDir\settings.local.json" -Force
Write-Host "  Copied settings.local.json (preferences)" -ForegroundColor Green

# CLAUDE.md (global instructions)
Copy-Item "$soulDir\dotfiles\claude\CLAUDE.md" "$claudeDir\CLAUDE.md" -Force
Write-Host "  Copied CLAUDE.md (global instructions)" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Start ChromaDB:" -ForegroundColor White
Write-Host "     chroma run --host localhost --port 8000 --path $chromaDataDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Run 'claude' to authenticate with Anthropic (first time only)" -ForegroundColor White
Write-Host ""
Write-Host "  3. In Claude Code, run /mcp to verify soul connection" -ForegroundColor White
Write-Host ""
Write-Host "Your digital soul is ready!" -ForegroundColor Cyan
Write-Host ""
