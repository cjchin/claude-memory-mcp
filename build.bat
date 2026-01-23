@echo off
echo Setting up Claude Memory MCP...
echo.

set PATH=C:\Program Files\nodejs;%PATH%

echo Node version:
node --version
echo.

echo npm version:
npm --version
echo.

cd /d C:\DEV\RAG-Context

echo Cleaning node_modules...
if exist node_modules rmdir /s /q node_modules

echo.
echo Running npm install...
call npm install

echo.
echo Running npm build...
call npm run build

echo.
echo ========================================
echo BUILD COMPLETE
echo ========================================
echo.
echo Now you can:
echo 1. Start ChromaDB: docker run -p 8000:8000 chromadb/chroma
echo 2. In Claude Code, run /mcp to connect
echo.
pause
