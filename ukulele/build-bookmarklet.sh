#!/usr/bin/env bash
# Minifie bookmarklet.js en lien javascript: et l'injecte dans index.html (entre les marqueurs BOOKMARKLET).
set -euo pipefail
cd "$(dirname "$0")"
APP="${1:-https://claude.ai/artifact/KAWuZehECoFrzS7Cx4y7mK#chansons}"
MIN=$(sed "s|__APP__|$APP|" bookmarklet.js | npx -y terser@5.31.6 -c -m --format ascii_only=true)
printf 'javascript:%s' "$MIN" > bookmarklet.min.txt
python3 - "$APP" <<'PY'
import json, re, sys
code = open("bookmarklet.min.txt").read()
s = open("index.html").read()
s = re.sub(r"/\*BOOKMARKLET\*/.*?/\*END\*/", lambda m: "/*BOOKMARKLET*/" + json.dumps(code).replace("<", "\\u003c") + "/*END*/", s, flags=re.S)
open("index.html", "w").write(s)
PY
wc -c bookmarklet.min.txt
