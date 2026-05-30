import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 디자인 시스템 드리프트 가드 — 자세한 규약은 src/jm/DESIGN.md "Canonical decisions (lint-enforced)" 참고.
// raw 팔레트 색상 / 임의 px 폰트 / 점선 border 를 className 문자열에서 탐지.
const DESIGN_DRIFT_SYNTAX = [
  {
    selector: "Literal[value=/text-\\[[0-9]+px\\]/]",
    message:
      "임의 px 폰트 크기 금지 — text-jm-4xs..6xl 토큰 사용. 코드모드: node scripts/codemod-text-tokens.mjs (DESIGN.md Canonical decisions)",
  },
  {
    selector:
      "Literal[value=/(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)/]",
    message:
      "raw 팔레트 색상 금지 (다크모드 미대응) — jm: var(--jm-success/warning/danger/info-*), shadcn: 시맨틱 토큰 (DESIGN.md)",
  },
  {
    selector: "Literal[value=/border-dashed/]",
    message: "점선 border 금지 (사용자 규칙) — 실선 또는 border-subtle 사용",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // 한글 본문(도움말·가이드)에 따옴표/어퍼스트로피가 자연스럽게 등장 — 타이포그래픽
  // 이스케이프를 강제하면 가독성만 해침. 흔히 비활성하는 노이즈 룰.
  { rules: { "react/no-unescaped-entities": "off" } },

  // ── 시스템 경계 잠금 (error — shadcn 완전 제거됨, 영구 0 유지) ───────────
  // @/components/ui (shadcn) 는 삭제됨. 전 영역에서 재도입 금지 — @/jm 사용.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/ui", "@/components/ui/*"],
              message:
                "shadcn @/components/ui 는 제거됨 — @/jm 컴포넌트 사용 (CLAUDE.md 분기 규칙)",
            },
          ],
        },
      ],
    },
  },
  // src/jm 포터빌리티 — 프로젝트 코드 import 금지 (허용: @base-ui/react, lucide-react, clsx, tailwind-merge, cva).
  {
    files: ["src/jm/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/**", "@/lib/**", "@/app/**"],
              message:
                "src/jm 은 포터블 디자인 시스템 — 프로젝트 코드(@/components, @/lib, @/app) import 금지 (DESIGN.md §6)",
            },
          ],
        },
      ],
    },
  },

  // ── 디자인 토큰 드리프트 가드 (error — 베이스라인 0 정리 완료) ──
  // print(react-pdf) 과 *-pdf 렌더러는 리터럴 사이즈/색상이 필요하므로 제외.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/(print)/**", "src/**/*-pdf.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...DESIGN_DRIFT_SYNTAX],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
