# Claude Memory MCP - Setup Script
# Run this once after cloning to set up everything

param(
    [switch]$SkipChroma,
    [switch]$UseDocker
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Claude Memory MCP Setup ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  Found Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# 2. Install dependencies
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "  Dependencies installed" -ForegroundColor Green

# 3. Build TypeScript
Write-Host "[3/5] Building TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "  Build complete" -ForegroundColor Green

# 4. Setup ChromaDB
if (-not $SkipChroma) {
    Write-Host "[4/5] Setting up ChromaDB..." -ForegroundColor Yellow

    if ($UseDocker) {
        Write-Host "  Using Docker..." -ForegroundColor Gray
        docker run -d --name claude-memory-chroma -p 8000:8000 -v claude-memory-data:/chroma/chroma chromadb/chroma
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ChromaDB container started" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: Docker failed. Install ChromaDB manually." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Installing ChromaDB via pip..." -ForegroundColor Gray
        pip install chromadb
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  WARNING: pip install failed. Install ChromaDB manually." -ForegroundColor Yellow
        } else {
            Write-Host "  ChromaDB installed" -ForegroundColor Green
        }
    }
} else {
    Write-Host "[4/5] Skipping ChromaDB setup" -ForegroundColor Gray
}

# 5. Create config directory
Write-Host "[5/5] Creating config directory..." -ForegroundColor Yellow
$configDir = Join-Path $env:USERPROFILE ".claude-memory"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}
Write-Host "  Config directory: $configDir" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Start ChromaDB:" -ForegroundColor Gray
if ($UseDocker) {
    Write-Host "     docker start claude-memory-chroma" -ForegroundColor Gray
} else {
    Write-Host "     .\start-chroma.ps1" -ForegroundColor Gray
}
Write-Host "  2. Add to Claude Code settings (~/.claude/settings.json):" -ForegroundColor Gray
Write-Host ""
$serverPath = Join-Path $ProjectRoot "dist\index.js"
Write-Host @"
     {
       "mcpServers": {
         "memory": {
           "command": "node",
           "args": ["$($serverPath -replace '\\','\\')"]
         }
       }
     }
"@ -ForegroundColor DarkGray
Write-Host ""
Write-Host "  3. Restart Claude Code or run /mcp to connect" -ForegroundColor Gray
