#!/usr/bin/env bash
# POS 페이지 zinc-* / 시맨틱 컬러 → jm 토큰 일괄 마이그레이션.
# 멱등(idempotent): 여러 번 실행해도 결과 동일.

set -euo pipefail

ROOT="src/app/(pos)"

# Helper: sed in-place across all .tsx files under ROOT
replace() {
  local pattern="$1"
  local replacement="$2"
  find "$ROOT" -name "*.tsx" -exec sed -i "s|${pattern}|${replacement}|g" {} +
}

echo "▶ Stage 1: 특수 alpha 패턴 (shadow zinc-900/X)"
replace 'shadow-zinc-900/25' 'shadow-[var(--jm-shadow-lg)]'
replace 'shadow-zinc-900/10' 'shadow-[var(--jm-shadow-md)]'

echo "▶ Stage 2: zinc-* 색상 매핑"

# bg
replace 'bg-zinc-50' 'bg-[var(--jm-bg)]'
replace 'bg-zinc-100' 'bg-[var(--jm-surface-muted)]'
replace 'bg-zinc-200' 'bg-[var(--jm-border)]'
replace 'bg-zinc-300' 'bg-[var(--jm-border-strong)]'
replace 'bg-zinc-900' 'bg-[var(--jm-action)]'

# text
replace 'text-zinc-300' 'text-[var(--jm-text-disabled)]'
replace 'text-zinc-400' 'text-[var(--jm-text-subtle)]'
replace 'text-zinc-500' 'text-[var(--jm-text-muted)]'
replace 'text-zinc-600' 'text-[var(--jm-text-muted)]'
replace 'text-zinc-700' 'text-[var(--jm-text)]'
replace 'text-zinc-800' 'text-[var(--jm-text)]'
replace 'text-zinc-900' 'text-[var(--jm-text)]'

# border
replace 'border-zinc-100' 'border-[var(--jm-border)]'
replace 'border-zinc-200' 'border-[var(--jm-border)]'
replace 'border-zinc-300' 'border-[var(--jm-border-strong)]'

# ring
replace 'ring-zinc-100' 'ring-[var(--jm-border)]'
replace 'ring-zinc-200' 'ring-[var(--jm-border)]'
replace 'ring-zinc-300' 'ring-[var(--jm-border-strong)]'

# decoration / divide / outline
replace 'divide-zinc-100' 'divide-[var(--jm-border)]'
replace 'divide-zinc-200' 'divide-[var(--jm-border)]'

# fill / stroke (svg)
replace 'fill-zinc-100' 'fill-[var(--jm-surface-muted)]'
replace 'stroke-zinc-100' 'stroke-[var(--jm-surface-muted)]'

echo "▶ Stage 3: 시맨틱 컬러 (amber/rose/emerald) 매핑"

# amber → warning
replace 'bg-amber-50' 'bg-[var(--jm-warning-bg)]'
replace 'bg-amber-100' 'bg-[var(--jm-warning-bg)]'
replace 'bg-amber-500' 'bg-[var(--jm-warning-solid)]'
replace 'text-amber-600' 'text-[var(--jm-warning-fg)]'
replace 'text-amber-700' 'text-[var(--jm-warning-fg)]'
replace 'text-amber-800' 'text-[var(--jm-warning-fg)]'
replace 'text-amber-900' 'text-[var(--jm-warning-fg)]'
replace 'border-amber-200' 'border-[var(--jm-warning-bg)]'
replace 'border-amber-300' 'border-[var(--jm-warning-bg)]'
replace 'ring-amber-200' 'ring-[var(--jm-warning-bg)]'

# rose → danger
replace 'bg-rose-50' 'bg-[var(--jm-danger-bg)]'
replace 'bg-rose-100' 'bg-[var(--jm-danger-bg)]'
replace 'bg-rose-500' 'bg-[var(--jm-danger-solid)]'
replace 'bg-rose-600' 'bg-[var(--jm-danger-solid)]'
replace 'text-rose-600' 'text-[var(--jm-danger-fg)]'
replace 'text-rose-700' 'text-[var(--jm-danger-fg)]'
replace 'text-rose-800' 'text-[var(--jm-danger-fg)]'
replace 'text-rose-900' 'text-[var(--jm-danger-fg)]'
replace 'border-rose-200' 'border-[var(--jm-danger-bg)]'
replace 'border-rose-300' 'border-[var(--jm-danger-bg)]'
replace 'ring-rose-200' 'ring-[var(--jm-danger-bg)]'

# emerald → success
replace 'bg-emerald-50' 'bg-[var(--jm-success-bg)]'
replace 'bg-emerald-100' 'bg-[var(--jm-success-bg)]'
replace 'bg-emerald-500' 'bg-[var(--jm-success-solid)]'
replace 'text-emerald-600' 'text-[var(--jm-success-fg)]'
replace 'text-emerald-700' 'text-[var(--jm-success-fg)]'
replace 'text-emerald-800' 'text-[var(--jm-success-fg)]'
replace 'border-emerald-200' 'border-[var(--jm-success-bg)]'
replace 'ring-emerald-200' 'ring-[var(--jm-success-bg)]'

echo "▶ Stage 4: bg-white / text-white"
replace 'bg-white' 'bg-[var(--jm-surface)]'
# text-white 은 보통 bg-zinc-900 + text-white 조합이라 action-fg 가 적합
# 하지만 다양한 컨텍스트가 있어 위험. 우선 그대로 두고 시각 검증 후 개별 처리
# replace 'text-white' 'text-[var(--jm-action-fg)]'

echo "✅ 마이그레이션 완료"
echo ""
echo "남은 zinc 사용 (0이어야 함):"
find "$ROOT" -name "*.tsx" -exec grep -ohE "zinc-[0-9]+" {} \; | sort | uniq -c
