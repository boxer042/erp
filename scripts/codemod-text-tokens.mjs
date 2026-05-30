#!/usr/bin/env node
/**
 * codemod: 임의 text-[NNpx] → jm 폰트 사이즈 토큰 (text-jm-*)
 *
 * 1:1 매핑 (globals.css @theme 정의와 동기):
 *   9→4xs 10→3xs 11→2xs 12→xs 13→sm 14→base 15→md 16→lg 18→xl 20→2xl 22→3xl 26→4xl 32→5xl 40→6xl
 *
 * - sm:/hover:/md: 등 variant prefix 는 substring 치환이라 자동 보존 (sm:text-[14px] → sm:text-jm-base)
 * - 매핑 없는 px (28px 등) 은 그대로 두고 리포트
 * - src/app/(print)/** 과 *-pdf.tsx 는 react-pdf 라 제외
 *
 * 실행: node scripts/codemod-text-tokens.mjs        (적용)
 *       node scripts/codemod-text-tokens.mjs --dry  (미리보기)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MAP = {
  9: "4xs", 10: "3xs", 11: "2xs", 12: "xs", 13: "sm", 14: "base",
  15: "md", 16: "lg", 18: "xl", 20: "2xl", 22: "3xl", 26: "4xl", 32: "5xl", 40: "6xl",
};

const DRY = process.argv.includes("--dry");
const ROOT = join(process.cwd(), "src");

function isExempt(path) {
  return path.includes("/(print)/") || path.endsWith("-pdf.tsx");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if ((p.endsWith(".tsx") || p.endsWith(".ts")) && !isExempt(p)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
let filesChanged = 0;
let totalReplacements = 0;
const unmapped = new Map();

for (const file of files) {
  const src = readFileSync(file, "utf8");
  let count = 0;
  const next = src.replace(/text-\[(\d+)px\]/g, (whole, n) => {
    const token = MAP[Number(n)];
    if (!token) {
      unmapped.set(n, (unmapped.get(n) ?? 0) + 1);
      return whole;
    }
    count++;
    return `text-jm-${token}`;
  });
  if (count > 0) {
    totalReplacements += count;
    filesChanged++;
    if (!DRY) writeFileSync(file, next);
  }
}

console.log(`${DRY ? "[dry] " : ""}files changed: ${filesChanged}, replacements: ${totalReplacements}`);
if (unmapped.size) {
  console.log("unmapped px (left as-is — add token first):");
  for (const [px, n] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`  ${px}px ×${n}`);
}
