#!/usr/bin/env bash
# 下载 nodejs-mobile 预编译 libnode.so 与头文件到 app/libnode/
# 用法: bash scripts/fetch-libnode.sh [版本，默认 v18.20.4]
set -euo pipefail

VER="${1:-v18.20.4}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/app/libnode"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URL="https://github.com/nodejs-mobile/nodejs-mobile/releases/download/${VER}/nodejs-mobile-${VER}-android.zip"
echo ">> 下载 ${URL}"
curl -fL --retry 3 -o "$TMP/nm.zip" "$URL"

mkdir -p "$DEST"
unzip -q -o "$TMP/nm.zip" 'bin/arm64-v8a/libnode.so' 'bin/armeabi-v7a/libnode.so' 'include/*' -d "$DEST"

echo ">> 完成:"
ls -lh "$DEST"/bin/*/libnode.so
echo "   include 头文件: $(ls "$DEST"/include/node/node.h)"
