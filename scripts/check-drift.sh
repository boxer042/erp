#!/usr/bin/env bash
# 디자인 시스템 하드-제로 인바리언트 게이트 (CI + 로컬).
# 현재 0 인 항목이 다시 새는 순간 exit 1. ESLint warn 과 별개로 "절대 늘면 안 되는" 것만 검사.
set -uo pipefail

fail=0
note() { echo "❌ $1"; fail=1; }

# 1) 하드코딩 hex 색상 (className) — 현재 0, 토큰만 사용
if grep -rEn '(bg|text|border|ring|fill|stroke|from|to|via)-\[#[0-9a-fA-F]' src --include='*.tsx' --include='*.ts' \
     | grep -v '/(print)/' | grep -v -- '-pdf.tsx'; then
  note "하드코딩 hex 색상 발견 — var(--jm-*) 또는 시맨틱 토큰 사용 (위 위치)"
fi

# 2) shadcn @/components/ui 재도입 — 디렉토리 삭제됨, 전 영역 0 유지
if grep -rEn 'from "@/components/ui' src --include='*.tsx' --include='*.ts' 2>/dev/null; then
  note "shadcn @/components/ui import 발견 (제거됨) — @/jm 컴포넌트 사용 (위 위치)"
fi

# 3) 로딩 텍스트(스켈레톤 대신) — 스피너 aria-label/주석 제외, '로딩 중...' UI 텍스트만
if grep -rEn '로딩 중\.\.\.|로딩중\.\.\.' src/app --include='*.tsx' | grep -v 'aria-label'; then
  note "'로딩 중...' UI 텍스트 발견 — 페이지 전용 Skeleton 사용 (CLAUDE.md §5)"
fi

if [ "$fail" -eq 0 ]; then
  echo "✅ drift gate clean (hex 0, 경계 누수 0, 로딩 텍스트 0)"
fi
exit "$fail"
