#!/bin/bash

echo "🔧 Setting up Cloudflare KV namespace..."

# Check if account ID is already set
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "📋 Fetching available Cloudflare accounts..."

  # Get account list and let user choose
  ACCOUNTS=$(npx wrangler kv:namespace list 2>&1 | grep "Available accounts" -A 100)

  if echo "$ACCOUNTS" | grep -q "Available accounts"; then
    echo ""
    ACCOUNT_LINES=$(echo "$ACCOUNTS" | grep "`.*`:")
    ACCOUNT_COUNT=$(echo "$ACCOUNT_LINES" | wc -l | tr -d ' ')

    echo "$ACCOUNT_LINES" | nl -v 1
    echo ""
    read -p "Please select an account number (1-${ACCOUNT_COUNT}): " ACCOUNT_NUM

    # Extract the account ID based on selection
    CLOUDFLARE_ACCOUNT_ID=$(echo "$ACCOUNT_LINES" | sed -n "${ACCOUNT_NUM}p" | grep -o '`[^`]*`$' | tr -d '`')

    if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
      echo "❌ Invalid selection"
      exit 1
    fi

    echo "✅ Selected account ID: $CLOUDFLARE_ACCOUNT_ID"
    export CLOUDFLARE_ACCOUNT_ID
  fi
fi

# Create KV namespace
echo "📦 Creating KV namespace..."
OUTPUT=$(npx wrangler kv:namespace create PMBOT_KV 2>&1)
echo "$OUTPUT"

# Extract the ID from output
KV_ID=$(echo "$OUTPUT" | grep -o 'id = "[^"]*"' | head -1 | sed 's/id = "\(.*\)"/\1/')

if [ -z "$KV_ID" ]; then
  echo "❌ Failed to create KV namespace"
  echo "You may need to create it manually with: npx wrangler kv:namespace create PMBOT_KV"
  exit 1
fi

echo "✅ KV namespace created with ID: $KV_ID"

# Update wrangler.toml
echo "📝 Updating wrangler.toml..."

cat > wrangler.toml << EOF
name = "telegram-pm-bot"
main = "dist/worker.js"
compatibility_date = "2024-11-13"

[[kv_namespaces]]
binding = "PMBOT_KV"
id = "$KV_ID"
EOF

echo "✅ wrangler.toml updated successfully!"
echo ""
echo "🎉 KV namespace is ready! (ID: $KV_ID)"
echo ""
echo "Next steps:"
echo "  npm run build && npm run deploy"
