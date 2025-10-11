#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

EDITION_DATE="${1:-$(date +%F)}"
PORT=55917
MAX_WAIT=10
SERVER_PID=""
SHOULD_CLEANUP=false

# Check if server is already running
if curl -s http://127.0.0.1:$PORT/health > /dev/null 2>&1; then
  echo -e "${YELLOW}ℹ OpenCode server already running on port ${PORT}${NC}"
else
  echo -e "${BLUE}▸ Starting OpenCode server on port ${PORT}...${NC}"

  # Start OpenCode server in background
  opencode serve --port $PORT > /tmp/opencode-server.log 2>&1 &
  SERVER_PID=$!
  SHOULD_CLEANUP=true

  # Wait for server to be ready
  echo -e "${BLUE}⏱ Waiting for server to be ready...${NC}"
  for i in $(seq 1 $MAX_WAIT); do
    if curl -s http://127.0.0.1:$PORT/health > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Server is ready!${NC}"
      break
    fi
    if [ $i -eq $MAX_WAIT ]; then
      echo -e "${RED}✗ Server failed to start within ${MAX_WAIT} seconds${NC}"
      kill $SERVER_PID 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
fi

# Trap to ensure cleanup on exit (only if we started the server)
cleanup() {
  if [ "$SHOULD_CLEANUP" = true ]; then
    echo -e "${BLUE}▸ Shutting down OpenCode server...${NC}"
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Generate edition
echo -e "${BLUE}◆ Generating edition for ${EDITION_DATE}...${NC}"
echo -e "${YELLOW}Using OpenCode URL: http://127.0.0.1:${PORT}${NC}"
export OPENCODE_BASE_URL="http://127.0.0.1:${PORT}"
tsx scripts/build-edition.ts "$EDITION_DATE"

echo -e "${GREEN}✓ Done!${NC}"
