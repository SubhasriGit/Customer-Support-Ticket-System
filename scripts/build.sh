#!/bin/bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

echo "=== CSTS Build Script ==="
echo "Root: $ROOT"

# Build frontend
echo ""
echo "[1/4] Installing frontend dependencies..."
cd "$ROOT/frontend"
npm install --legacy-peer-deps --silent

echo "[2/4] Building React frontend..."
npm run build
echo "  ✅ Frontend build complete: frontend/build/"

# Backend
echo ""
echo "[3/4] Installing backend production dependencies..."
cd "$ROOT/backend"
npm install --production --silent
echo "  ✅ Backend ready"

# Package artifact
echo ""
echo "[4/4] Packaging artifact..."
rm -rf "$DIST"
mkdir -p "$DIST/public" "$DIST/server"

cp -r "$ROOT/frontend/build/." "$DIST/public/"
rsync -a --exclude='node_modules' --exclude='.env' --exclude='*.sqlite' "$ROOT/backend/" "$DIST/server/"
cd "$DIST/server" && npm install --production --silent && cd "$ROOT"

echo ""
echo "=== Build complete ==="
echo "  Artifact: $DIST"
echo "  Start:    NODE_ENV=production node dist/server/server.js"
echo "  Serve UI: dist/public/ via Express static or CDN"
echo ""
ls -lh "$DIST/public/index.html" "$DIST/server/server.js" 2>/dev/null || true
