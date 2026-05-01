/**
 * 기본정보 Sheet 저장 시 assemblyTemplateId 가 누락되어 NULL 로 끊긴 상품들을 복구.
 *
 * 원인: ProductInfoEditSheet 가 PUT body 에 assemblyTemplateId 를 포함시키지 않아
 *       PUT 처리에서 `data.assemblyTemplateId || null` → null 로 저장됐음.
 *       (코드는 별도 PR 로 수정됨.)
 *
 * 복구 전략: SetComponent.slotId 가 가리키는 AssemblyTemplateSlot.templateId 로 역추적.
 *           한 상품의 모든 SetComponent 가 동일한 templateId 를 가리키면 그 템플릿으로 복구.
 *
 * 사용법:
 *   npx tsx --env-file=.env.local    scripts/fix-product-assembly-template.ts          (scan)
 *   npx tsx --env-file=.env.local    scripts/fix-product-assembly-template.ts --fix    (apply)
 *   npx tsx --env-file=.env.prod.tmp scripts/fix-product-assembly-template.ts          (prod scan)
 *   npx tsx --env-file=.env.prod.tmp scripts/fix-product-assembly-template.ts --fix    (prod apply)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--fix");

type Candidate = {
  productId: string;
  productName: string;
  productSku: string;
  isCanonical: boolean;
  canonicalProductId: string | null;
  hasVariants: boolean;
  templateIdCandidates: Map<string, number>;
  resolvedTemplateId: string | null;
  reason: string;
};

async function main() {
  // 1. assemblyTemplateId 가 NULL 이지만 SetComponent 는 가지고 있는 상품 후보 추출
  //    + 변형 가족(canonical 또는 canonical_product_id 가 채워진) 만 의미 있음 — 단일 상품은 변형 비교 자체가 없음
  const broken = await prisma.product.findMany({
    where: {
      isActive: true,
      assemblyTemplateId: null,
      OR: [
        { isCanonical: true },                  // 부모인데 끊김
        { canonicalProductId: { not: null } },  // 변형인데 끊김
      ],
      setComponents: {
        some: { slotId: { not: null } },        // slotId 가 있는 SetComponent 1 개 이상
      },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      isCanonical: true,
      canonicalProductId: true,
      _count: { select: { variants: true } },
      setComponents: {
        select: {
          slotId: true,
          slot: { select: { templateId: true } },
        },
      },
    },
  });

  const candidates: Candidate[] = [];
  for (const p of broken) {
    const tally = new Map<string, number>();
    for (const sc of p.setComponents) {
      const tid = sc.slot?.templateId;
      if (!tid) continue;
      tally.set(tid, (tally.get(tid) ?? 0) + 1);
    }

    let resolved: string | null = null;
    let reason = "";
    if (tally.size === 0) {
      reason = "SetComponent.slotId 에 연결된 templateId 없음 — 복구 불가";
    } else if (tally.size === 1) {
      resolved = [...tally.keys()][0];
      reason = `단일 templateId (${tally.get(resolved)} 개 슬롯 일치)`;
    } else {
      // 가장 많이 등장한 templateId 채택, 단 ambiguous 표시
      const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      resolved = sorted[0][0];
      reason = `다중 templateId 후보 [${sorted
        .map(([t, c]) => `${t.slice(0, 8)}=${c}`)
        .join(", ")}] — 다수결로 ${resolved.slice(0, 8)} 선택 (수동 검증 권장)`;
    }

    candidates.push({
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      isCanonical: p.isCanonical,
      canonicalProductId: p.canonicalProductId,
      hasVariants: p._count.variants > 0,
      templateIdCandidates: tally,
      resolvedTemplateId: resolved,
      reason,
    });
  }

  // 2. 보고
  console.log(`\n=== assemblyTemplateId 끊김 후보: ${candidates.length} 건 ===\n`);
  const recoverable = candidates.filter((c) => c.resolvedTemplateId);
  const unrecoverable = candidates.filter((c) => !c.resolvedTemplateId);
  const ambiguous = candidates.filter(
    (c) => c.resolvedTemplateId && c.templateIdCandidates.size > 1,
  );

  for (const c of candidates) {
    const role = c.isCanonical
      ? "[부모]"
      : c.canonicalProductId
        ? "[변형]"
        : "[단일]";
    console.log(
      `${role} ${c.productSku.padEnd(20)} ${c.productName.slice(0, 30).padEnd(30)} → ${
        c.resolvedTemplateId ? c.resolvedTemplateId.slice(0, 8) + "..." : "(복구 불가)"
      }   ${c.reason}`,
    );
  }

  console.log(
    `\n  복구 가능: ${recoverable.length} / 다중 후보(검토 권장): ${ambiguous.length} / 복구 불가: ${unrecoverable.length}`,
  );

  if (!APPLY) {
    console.log("\n[scan only] --fix 플래그를 추가해 실제로 적용하세요.\n");
    return;
  }

  // 3. 복구 적용
  console.log(`\n=== 복구 적용 (${recoverable.length} 건) ===\n`);
  let ok = 0;
  let fail = 0;
  for (const c of recoverable) {
    try {
      await prisma.product.update({
        where: { id: c.productId },
        data: { assemblyTemplateId: c.resolvedTemplateId! },
      });
      ok++;
      console.log(`  ✓ ${c.productSku} → ${c.resolvedTemplateId!.slice(0, 8)}`);
    } catch (e) {
      fail++;
      console.log(
        `  ✗ ${c.productSku} 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  console.log(`\n  성공 ${ok} / 실패 ${fail}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
