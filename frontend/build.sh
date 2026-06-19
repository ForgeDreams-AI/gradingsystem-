#!/usr/bin/env bash
# Build the grader app into ./dist (a static site you can host anywhere).
#
# You normally DON'T need to run this — dist/ is committed prebuilt. Run it only
# if you change anything in src/. Requires Node.js; it installs esbuild +
# tailwindcss on first run.
#
#   cd frontend && ./build.sh
#
set -e
cd "$(dirname "$0")"

mkdir -p dist .tool
# Local, self-contained toolchain (so this never touches global npm).
if [ ! -d .tool/node_modules ]; then
  echo "Installing build tools (one time)…"
  (cd .tool && npm init -y >/dev/null 2>&1 && npm install react@18 react-dom@18 esbuild tailwindcss@3 >/dev/null 2>&1)
fi

# 1) Bundle the app + React into one file (no CDN needed at runtime).
.tool/node_modules/.bin/esbuild src/app.jsx \
  --bundle --jsx=automatic --minify \
  --define:process.env.NODE_ENV='"production"' \
  --outfile=dist/app.js

# 2) Compile only the Tailwind classes actually used.
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > .tool/input.css
cat > .tool/tailwind.config.js <<'CFG'
module.exports = { content: ['../src/app.jsx'], theme: { extend: {} }, plugins: [] };
CFG
.tool/node_modules/.bin/tailwindcss -c .tool/tailwind.config.js -i .tool/input.css -o dist/styles.css --minify

# 3) Copy the static shell.
cp src/index.html src/sw.js src/manifest.webmanifest dist/

echo "✅ Built dist/ — host that folder (e.g. GitHub Pages)."
