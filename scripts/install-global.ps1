# Install Claude Memory MCP globally from this repo
# This allows running from anywhere

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Installing claude-memory-mcp globally..." -ForegroundColor Cyan

Set-Location $ProjectRoot

# Build first
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

# Link globally
npm link
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "Installed globally!" -ForegroundColor Green
Write-Host "You can now use: claude-memory <command>" -ForegroundColor Gray
Write-Host ""
Write-Host "Commands:" -ForegroundColor White
Write-Host "  claude-memory search <query>" -ForegroundColor Gray
Write-Host "  claude-memory list" -ForegroundColor Gray
Write-Host "  claude-memory stats" -ForegroundColor Gray
Write-Host "  claude-memory export backup.json" -ForegroundColor Gray
