#!/usr/bin/env bash
# Optional: copy three.js (r170) into ./vendor so the site works without the CDN.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
(cd "$tmp" && npm init -y >/dev/null && npm i three@0.170.0 --no-audit --no-fund >/dev/null)
mkdir -p vendor/addons/controls vendor/addons/environments
cp "$tmp/node_modules/three/build/three.module.js" vendor/three.module.js
cp "$tmp/node_modules/three/examples/jsm/controls/OrbitControls.js" vendor/addons/controls/
cp "$tmp/node_modules/three/examples/jsm/environments/RoomEnvironment.js" vendor/addons/environments/
rm -rf "$tmp"
cat <<MSG
Done. Now replace the import map in index.html with:

  "imports": {
    "three": "./vendor/three.module.js",
    "three/addons/": "./vendor/addons/"
  }
MSG
