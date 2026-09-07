#!/usr/bin/env bash
# 从 node-server/（Node 版后端源码）生成 APK 内嵌的 assets/nodejs-project
# 用法: bash scripts/prepare-node-project.sh [源码目录，默认 node-server]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/node-server}"
DEST="$ROOT/app/src/main/assets/nodejs-project"

if [ ! -f "$SRC/server.js" ]; then
  echo "错误: 在 $SRC 未找到 server.js，请先准备 node-server/ 目录" >&2
  exit 1
fi

echo ">> 清理旧的 nodejs-project"
rm -rf "$DEST"
mkdir -p "$DEST"

echo ">> 拷贝 Node 版源码"
cp "$SRC/server.js" "$DEST/server.js"
[ -f "$SRC/config.json" ] && cp "$SRC/config.json" "$DEST/config.json" || true
[ -f "$SRC/config.example.json" ] && cp "$SRC/config.example.json" "$DEST/config.example.json" || true
cp "$SRC/package.json" "$DEST/package.json"
cp -r "$SRC/public" "$DEST/public"

echo ">> npm install (express；hls.min.js 已作为静态文件置于 public/hls.js/，不再安装体积约 30MB 的 hls.js npm 包)"
cd "$DEST"
npm install --omit=dev --no-audit --no-fund express

echo ">> 完成: $DEST"
du -sh "$DEST"
