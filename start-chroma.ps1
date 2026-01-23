# Start ChromaDB with persistent storage
# Requires: pip install chromadb

$chromaDataPath = Join-Path $PSScriptRoot "chroma-data"

if (-not (Test-Path $chromaDataPath)) {
    New-Item -ItemType Directory -Path $chromaDataPath | Out-Null
}

Write-Host "Starting ChromaDB on http://localhost:8000"
Write-Host "Data stored in: $chromaDataPath"
Write-Host "Press Ctrl+C to stop"
Write-Host ""

chroma run --host localhost --port 8000 --path $chromaDataPath
