#!/usr/bin/env bash
# 把模板里的 <!--@include path--> 展开成文件内容，产出自包含的单文件页面。
# 用法（在仓库根目录执行）： bash tools/build.sh src/review.html docs/ranges-review.html
set -e

TEMPLATE="$1"
OUTPUT="$2"

if [ -z "$TEMPLATE" ] || [ -z "$OUTPUT" ]; then
  echo "用法: bash tools/build.sh <模板> <输出>" >&2
  exit 1
fi

awk '
  /<!--@include .*-->/ {
    line = $0
    if (match(line, /@include [^ ]+/)) {
      f = substr(line, RSTART + 9, RLENGTH - 9)
      sub(/-->$/, "", f)
      n = 0
      while ((getline l < f) > 0) { print l; n++ }
      close(f)
      if (n == 0) { print "找不到或空文件: " f > "/dev/stderr"; exit 1 }
      next
    }
  }
  { print }
' "$TEMPLATE" > "$OUTPUT"

echo "已生成 $OUTPUT ($(wc -c < "$OUTPUT") 字节)"
