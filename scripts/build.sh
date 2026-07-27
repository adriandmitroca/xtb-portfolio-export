#!/usr/bin/env bash
# Package the extension into dist/xtb-portfolio-export-<version>.zip
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ext="$root/extension"
ver="$(node -e "process.stdout.write(require('$ext/manifest.json').version)")"
out="$root/dist"
zipfile="$out/xtb-portfolio-export-$ver.zip"

mkdir -p "$out"
rm -f "$zipfile"

# Zip the contents of extension/ (manifest.json at the archive root).
( cd "$ext" && zip -r -X "$zipfile" . -x '*.DS_Store' >/dev/null )

echo "built $zipfile"
unzip -l "$zipfile" | tail -n +2
