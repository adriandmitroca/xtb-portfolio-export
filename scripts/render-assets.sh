#!/usr/bin/env bash
# Renders every store asset from its HTML template with headless Chrome.
# Run: scripts/render-assets.sh
#
# Three traps this works around: headless Chrome does not exit after writing
# --screenshot, so each shot is killed once its file lands; parallel shots need
# their own profile dir or Chrome serialises them behind one lock; and Chrome
# clamps the window to ~500px wide, which cropped the 440px promo tile. So the
# templates use a fixed-size canvas centred in the window, and every shot renders
# at 2x, is cropped back to that canvas, then scaled down -- which also
# supersamples the hairlines and the ledger rules.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome not found. Set CHROME=/path/to/chrome" >&2; exit 1; }

DIR="$(cd "$(dirname "$0")/../store-assets" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shot() { # shot <out> <WxH> <url>
  local w="${2%x*}" h="${2#*x}"
  local win_w=$w
  [ "$win_w" -lt 500 ] && win_w=500 # Chrome will not open a narrower window
  rm -f "$DIR/$1"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --user-data-dir="$TMP/$1" \
    --virtual-time-budget=1200 --window-size="$win_w,$h" \
    --screenshot="$DIR/$1" "$3" >/dev/null 2>&1 &
  local pid=$! n=0
  while [ ! -s "$DIR/$1" ] && [ $n -lt 300 ]; do sleep 0.2; n=$((n + 1)); done
  sleep 0.4
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  [ -s "$DIR/$1" ] || { echo "FAILED $1" >&2; return 1; }
  sips -c "$((h * 2))" "$((w * 2))" "$DIR/$1" >/dev/null
  sips -z "$h" "$w" "$DIR/$1" >/dev/null
  echo "wrote store-assets/$1 (${w}x${h})"
}

for n in 1 2 3; do
  shot "screenshot-$n.png"    1280x800 "file://$DIR/screenshots.html#s$n" &
  shot "screenshot-pl-$n.png" 1280x800 "file://$DIR/screenshots-pl.html#s$n" &
done
shot "promo-440x280.png"    440x280   "file://$DIR/promo.html" &
shot "marquee-1400x560.png" 1400x560  "file://$DIR/marquee.html" &
wait
