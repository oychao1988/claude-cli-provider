#!/bin/bash

# Integration Test Runner
# Runs integration tests against a running server

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${TEST_BASE_URL:-http://localhost:3912}"
API_KEY="${TEST_API_KEY:-}"

echo -e "${GREEN}=== Claude CLI Provider Integration Tests ===${NC}"
echo -e "Base URL: ${BASE_URL}"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if ! curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}Error: Server is not running at ${BASE_URL}${NC}"
    echo "Start the server with: npm start"
    exit 1
fi

echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Run health check
echo -e "${YELLOW}Testing health endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s "${BASE_URL}/health")
echo "Response: ${HEALTH_RESPONSE}"
echo ""

# Test OpenAI mode (non-streaming)
echo -e "${YELLOW}Testing OpenAI mode (non-streaming)...${NC}"
if [ -n "$API_KEY" ]; then
    AUTH_HEADER="-H \"Authorization: Bearer ${API_KEY}\""
else
    AUTH_HEADER=""
fi

curl -s -X POST "${BASE_URL}/v1/chat/completions" \
    -H "Content-Type: application/json" \
    ${AUTH_HEADER} \
    -d '{"model":"sonnet","messages":[{"role":"user","content":"Say Hello"}],"stream":false}' \
    | jq '.'

echo ""
echo -e "${GREEN}=== Integration Tests Complete ===${NC}"
