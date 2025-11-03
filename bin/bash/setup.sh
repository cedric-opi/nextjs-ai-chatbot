#!/bin/bash

echo "🔧 Fixing FinGPT Integration Issues..."
echo ""

# 1. Fix artifact-model error
echo "1️⃣ Fixing artifact-model error..."
find app/ -type f -name "*.ts" -exec grep -l "artifact-model" {} \; | while read file; do
    echo "   Updating: $file"
    sed -i.bak 's/"artifact-model"/"gpt-4o-mini"/g' "$file"
done
echo "✅ Done"
echo ""

# 2. Fix route.ts location
echo "2️⃣ Moving route.ts to correct location..."
if [ -f "app/api/fingpt/route.ts" ]; then
    mv app/api/fingpt/route.ts "app/api/fingpt/[...path]/route.ts"
    echo "✅ Moved: app/api/fingpt/route.ts → app/api/fingpt/[...path]/route.ts"
else
    echo "✅ route.ts already in correct location"
fi
echo ""

# 3. Verify structure
echo "3️⃣ Verifying structure..."
if [ -f "app/api/fingpt/[...path]/route.ts" ]; then
    echo "✅ Correct: app/api/fingpt/[...path]/route.ts exists"
else
    echo "❌ Error: route.ts not found in correct location"
fi
echo ""

# 4. Check .env.local
echo "4️⃣ Checking environment variables..."
if grep -q "FINGPT_BASE_URL" .env.local 2>/dev/null; then
    echo "✅ FINGPT_BASE_URL is configured"
else
    echo "FINGPT_BASE_URL=http://localhost:8000" >> .env.local
    echo "✅ Added FINGPT_BASE_URL to .env.local"
fi
echo ""

echo "🎉 All fixes applied!"
echo ""
echo "Next steps:"
echo "1. Restart Next.js: npm run dev"
echo "2. Test in browser: http://localhost:3000/chat/new"
echo ""