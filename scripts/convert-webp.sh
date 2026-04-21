#!/bin/bash
# Convert all JPG/PNG images to WebP using macOS sips
# Keeps originals, creates .webp alongside them
# Then updates all HTML files to reference .webp versions
#
# Usage:
#   bash scripts/convert-webp.sh          # Convert + update HTML
#   bash scripts/convert-webp.sh --dry-run # Show what would be converted

set -e
cd "$(dirname "$0")/.."

DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
fi

echo "=== WebP Image Conversion ==="
echo ""

# Count originals
TOTAL=$(find ./images -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) -not -path "*/brand-source/*" | wc -l | tr -d ' ')
echo "Found $TOTAL images to convert"

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would convert:"
  find ./images -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) -not -path "*/brand-source/*" | while read img; do
    webp="${img%.*}.webp"
    echo "  $img → $webp"
  done
  exit 0
fi

# Convert each image
CONVERTED=0
SAVED_BYTES=0

find ./images -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) -not -path "*/brand-source/*" | while read img; do
  webp="${img%.*}.webp"

  # Skip if WebP already exists and is newer
  if [ -f "$webp" ] && [ "$webp" -nt "$img" ]; then
    echo "  SKIP: $webp (already exists)"
    continue
  fi

  # Convert using sips (macOS built-in)
  sips -s format webp -s formatOptions 80 "$img" --out "$webp" >/dev/null 2>&1

  if [ -f "$webp" ]; then
    orig_size=$(stat -f%z "$img")
    webp_size=$(stat -f%z "$webp")
    saved=$((orig_size - webp_size))
    pct=$((saved * 100 / orig_size))
    echo "  OK: $(basename "$img") → $(basename "$webp") (${pct}% smaller)"
  else
    echo "  FAIL: $img"
  fi
done

echo ""
echo "=== Updating HTML References ==="

# Update all HTML files: replace .jpg/.jpeg/.png with .webp in img src and og:image
# Only touch files in the project, not archive
find . -name "*.html" -not -path "./.git/*" -not -path "./archive/*" -not -path "./node_modules/*" | while read html; do
  # Check if file references any images we converted
  if grep -qE 'src="[^"]*\.(jpg|jpeg|png)"' "$html" 2>/dev/null || grep -qE 'content="[^"]*\.(jpg|jpeg|png)"' "$html" 2>/dev/null; then
    # Replace in img src attributes
    sed -i '' -E 's|(src="[^"]*)\.(jpg|jpeg|png)"|\1.webp"|g' "$html"
    # Replace in og:image and twitter:image content attributes
    sed -i '' -E 's|(content="https://www\.frameroofingutah\.com/images/[^"]*)\.(jpg|jpeg|png)"|\1.webp"|g' "$html"
    echo "  Updated: $html"
  fi
done

echo ""
echo "=== Summary ==="
WEBP_COUNT=$(find ./images -name "*.webp" -not -path "*/brand-source/*" | wc -l | tr -d ' ')
WEBP_SIZE=$(du -sh ./images/*.webp ./images/**/*.webp 2>/dev/null | tail -1 | awk '{print $1}')
echo "WebP files created: $WEBP_COUNT"
echo ""
echo "Done. Review changes with: git diff --stat"
echo "Don't forget to also submit new URLs to IndexNow after deploying."
