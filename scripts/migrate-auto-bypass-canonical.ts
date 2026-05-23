/**
 * Phase 2 마이그레이션 — "자동조압변" 버전 ASSEMBLED canonical 신규 생성
 *
 * 대상:
 *   - 7HP: 범양80A7HP엔진자동고압분무기 (price 590,000)
 *   - 3HP: 범양80A3HP 모터자동고압분무기 (price 540,000)
 *
 * 작업:
 *   1. AssemblySlotLabel "자동조압변" / "수동조압변 회수" 보장
 *   2. 기존 수동 canonical 의 AssemblyTemplate 슬롯을 복제 + 2 슬롯 추가한 신규 템플릿 생성
 *   3. 신규 auto canonical Product 생성 (isCanonical=true, inventory 없음, 수동 canonical 의 본질 식별 필드 상속)
 *   4. SetComponents 복제 (옛 slotId → 새 slotId 매핑) + 자동조압변 +1 / 수동조압변 -1 (회수) 추가
 *
 * 운영 DB 영향: 신규 row 만 생성 — 기존 수동 canonical/variants/template 손대지 않음.
 *
 * 실행: 먼저 DRY_RUN=1 로 검증 → 문제 없으면 그대로 다시 실행
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1";

// 부속 SKU
const AUTO_BYPASS_SKU = "AUTO-AE24B273"; // 자동조압변(레규레이터)
const MANUAL_BYPASS_SKU = "P260523-ODPN"; // 수동조압변(레규레이터)

interface MigrationTarget {
  manualCanonicalSku: string;
  newName: string;
  newSku: string;
  newSellingPrice: number;
}

const TARGETS: MigrationTarget[] = [
  {
    manualCanonicalSku: "P260523-A7F7", // 범양80A7HP엔진고압분무기 canonical
    newName: "범양80A7HP엔진자동고압분무기",
    newSku: "P260523-A7F7-AUTO",
    newSellingPrice: 590000,
  },
  {
    manualCanonicalSku: "P260522-36OP", // 범양80A3HP 모터고압분무기 canonical
    newName: "범양80A3HP 모터자동고압분무기",
    newSku: "P260522-36OP-AUTO",
    newSellingPrice: 540000,
  },
];

async function migrateOne(target: MigrationTarget) {
  console.log(`\n=== 마이그레이션: ${target.newName} (${target.newSku}) ===`);

  // 사전 검증
  const existing = await prisma.product.findUnique({
    where: { sku: target.newSku },
    select: { id: true },
  });
  if (existing) {
    console.log(`이미 존재 → 건너뜀 (${target.newSku})`);
    return;
  }

  const autoBypass = await prisma.product.findUnique({
    where: { sku: AUTO_BYPASS_SKU },
    select: { id: true, name: true },
  });
  const manualBypass = await prisma.product.findUnique({
    where: { sku: MANUAL_BYPASS_SKU },
    select: { id: true, name: true },
  });
  if (!autoBypass || !manualBypass) {
    throw new Error(`부속 단품 누락: 자동=${!!autoBypass}, 수동=${!!manualBypass}`);
  }

  const manual = await prisma.product.findUnique({
    where: { sku: target.manualCanonicalSku },
    include: {
      assemblyTemplate: {
        include: {
          slots: { orderBy: { order: "asc" } },
        },
      },
      setComponents: true,
    },
  });
  if (!manual) {
    throw new Error(`수동 canonical 못 찾음: ${target.manualCanonicalSku}`);
  }
  if (!manual.isCanonical) {
    throw new Error(`${target.manualCanonicalSku} 는 canonical 이 아님`);
  }
  if (!manual.assemblyTemplate) {
    throw new Error(`${target.manualCanonicalSku} 에 AssemblyTemplate 없음`);
  }

  console.log(`  수동 canonical: ${manual.name} (${manual.sku})`);
  console.log(`  기존 슬롯 ${manual.assemblyTemplate.slots.length}개, BOM ${manual.setComponents.length}개`);

  if (DRY_RUN) {
    console.log("  [DRY_RUN] 신규 생성될 데이터:");
    console.log("    - Product:", target.newName, target.newSku, "isCanonical=true, sellingPrice=" + target.newSellingPrice);
    console.log("    - AssemblyTemplate:", `${manual.name} (자동) 조립`);
    console.log("    - 슬롯:", manual.assemblyTemplate.slots.length, "개 복제 + 2개 신규 (자동조압변, 수동조압변 회수)");
    console.log("    - SetComponents:", manual.setComponents.length, "개 복제 + 2개 신규 (자동조압변 +1, 수동조압변 -1)");
    return;
  }

  // 실제 mutation 시작
  await prisma.$transaction(async (tx) => {
    // 1. SlotLabel 보장
    const slotLabelAuto = await tx.assemblySlotLabel.upsert({
      where: { name: "자동조압변" },
      create: { name: "자동조압변" },
      update: {},
    });
    const slotLabelRecovery = await tx.assemblySlotLabel.upsert({
      where: { name: "수동조압변 회수" },
      create: { name: "수동조압변 회수" },
      update: {},
    });

    // 2. AssemblyTemplate 신규 생성 + 슬롯 복제 + 2 슬롯 추가
    const newTemplate = await tx.assemblyTemplate.create({
      data: {
        name: `${manual.name} (자동) 조립`,
        description: manual.assemblyTemplate!.description,
        defaultLaborCost: manual.assemblyTemplate!.defaultLaborCost,
        slots: {
          create: [
            ...manual.assemblyTemplate!.slots.map((s) => ({
              label: s.label,
              slotLabelId: s.slotLabelId,
              order: s.order,
              defaultProductId: s.defaultProductId,
              defaultQuantity: s.defaultQuantity,
              isVariable: s.isVariable,
            })),
            {
              label: "자동조압변",
              slotLabelId: slotLabelAuto.id,
              order: manual.assemblyTemplate!.slots.length + 1,
              defaultProductId: autoBypass.id,
              defaultQuantity: 1,
              isVariable: false,
            },
            {
              label: "수동조압변 회수",
              slotLabelId: slotLabelRecovery.id,
              order: manual.assemblyTemplate!.slots.length + 2,
              defaultProductId: manualBypass.id,
              defaultQuantity: -1,
              isVariable: false,
            },
          ],
        },
      },
      include: { slots: { orderBy: { order: "asc" } } },
    });

    // 3. 신규 auto canonical Product
    const newAuto = await tx.product.create({
      data: {
        name: target.newName,
        sku: target.newSku,
        productType: "ASSEMBLED",
        isCanonical: true,
        isSet: true,
        sellingPrice: target.newSellingPrice,
        listPrice: target.newSellingPrice,
        taxRate: manual.taxRate,
        taxType: manual.taxType,
        unitOfMeasure: manual.unitOfMeasure,
        brand: manual.brand,
        brandId: manual.brandId,
        modelName: manual.modelName,
        spec: manual.spec,
        imageUrl: manual.imageUrl,
        description: manual.description,
        categoryId: manual.categoryId,
        zeroRateEligible: manual.zeroRateEligible,
        countryOfOrigin: manual.countryOfOrigin,
        manufacturer: manual.manufacturer,
        importer: manual.importer,
        certifications: manual.certifications,
        asResponsible: manual.asResponsible,
        catalogHidden: manual.catalogHidden,
        trackable: manual.trackable,
        warrantyMonths: manual.warrantyMonths,
        warrantyPolicy: manual.warrantyPolicy,
        assemblyTemplateId: newTemplate.id,
        // canonical 은 자체 inventory 없음
      },
    });

    // 4. SetComponents — 옛 slotId → 새 slotId 매핑
    const oldSlots = manual.assemblyTemplate!.slots;
    const newSlots = newTemplate.slots;
    const oldToNewSlotId = new Map<string, string>();
    for (let i = 0; i < oldSlots.length; i++) {
      oldToNewSlotId.set(oldSlots[i].id, newSlots[i].id);
    }
    const autoSlot = newSlots.find((s) => s.label === "자동조압변")!;
    const recoverySlot = newSlots.find((s) => s.label === "수동조압변 회수")!;

    // 4a. 기존 BOM 복제
    for (const sc of manual.setComponents) {
      await tx.setComponent.create({
        data: {
          setProductId: newAuto.id,
          componentId: sc.componentId,
          quantity: sc.quantity,
          label: sc.label,
          slotLabelId: sc.slotLabelId,
          slotId: sc.slotId ? oldToNewSlotId.get(sc.slotId) ?? null : null,
        },
      });
    }

    // 4b. 자동조압변 +1
    await tx.setComponent.create({
      data: {
        setProductId: newAuto.id,
        componentId: autoBypass.id,
        quantity: 1,
        label: "자동조압변",
        slotLabelId: slotLabelAuto.id,
        slotId: autoSlot.id,
      },
    });

    // 4c. 수동조압변 -1 (회수)
    await tx.setComponent.create({
      data: {
        setProductId: newAuto.id,
        componentId: manualBypass.id,
        quantity: -1,
        label: "수동조압변 회수",
        slotLabelId: slotLabelRecovery.id,
        slotId: recoverySlot.id,
      },
    });

    console.log(`  ✓ 신규 canonical 생성: ${newAuto.name} (${newAuto.sku}, id=${newAuto.id})`);
    console.log(`  ✓ 신규 template id=${newTemplate.id}, 슬롯 ${newTemplate.slots.length}개`);
    console.log(`  ✓ SetComponents 총 ${manual.setComponents.length + 2}개 (기존 복제 + 회수/자동조압변)`);
  });
}

async function main() {
  console.log(`DRY_RUN=${DRY_RUN ? "true (실제 mutate 안 함)" : "false (실제 mutate)"}`);
  for (const t of TARGETS) {
    await migrateOne(t);
  }
}

main()
  .catch((e) => {
    console.error("실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
