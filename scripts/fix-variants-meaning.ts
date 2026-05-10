/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 1회성 — 변형상품(canonical/variant) 의미 정정.
 *
 * 이전 잘못 사용:
 *  - 안전화 PRD-SHO-CANONICAL + variants (PRD-SHO-250/270/290) ← 사이즈 차이일 뿐, canonical 아님
 *
 * 올바른 사용 (조립상품의 부속 변경):
 *  - 조립 PC i7 32G 2TB (기본) ← canonical
 *    └ variant: i7 64G 2TB (RAM 업그레이드)
 *    └ variant: i7 32G 4TB (SSD 업그레이드)
 *
 * 실행: npx tsx scripts/fix-variants-meaning.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const url = process.env.DATABASE_URL!;
if (url.includes("eflvrygympn") || url.includes("ap-northeast-2")) {
  console.error("⛔ prod 호스트 — 중단");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const D = (n: number | string) => new Prisma.Decimal(n);

async function main() {
  // [1] 안전화 canonical/variant 관계 해제
  console.log("[1] 안전화 canonical/variant 관계 해제...");

  const shoeSkus = ["PRD-SHO-250", "PRD-SHO-270", "PRD-SHO-290"];
  for (const sku of shoeSkus) {
    const p = await prisma.product.findUnique({ where: { sku } });
    if (!p) continue;
    if (p.canonicalProductId) {
      await prisma.product.update({
        where: { id: p.id },
        data: { canonicalProductId: null },
      });
      console.log(`  ▼ ${sku} canonicalProductId 제거`);
    }
  }
  // canonical 자체 제거
  const shoeCanonical = await prisma.product.findUnique({ where: { sku: "PRD-SHO-CANONICAL" } });
  if (shoeCanonical) {
    // ProductMedia 등 관계 cascade 됨
    await prisma.productMedia.deleteMany({ where: { productId: shoeCanonical.id } });
    await prisma.inventory.deleteMany({ where: { productId: shoeCanonical.id } });
    await prisma.product.delete({ where: { id: shoeCanonical.id } });
    console.log(`  ▼ PRD-SHO-CANONICAL 제거`);
  }

  // [2] 조립 PC 를 canonical 로 + variant 추가
  console.log("\n[2] 조립 PC canonical/variant 셋업...");

  const cat = await prisma.productCategory.findFirst({ where: { name: "노트북·PC" } });
  if (!cat) throw new Error("카테고리 노트북·PC 없음");

  const pcCanonical = await prisma.product.findUnique({ where: { sku: "PRD-PC-ASSEMBLED" } });
  if (!pcCanonical) throw new Error("PRD-PC-ASSEMBLED 없음");
  const tmpl = await prisma.assemblyTemplate.findFirst({ where: { name: "기본 PC 조립" } });

  // canonical 표시
  if (!pcCanonical.isCanonical) {
    await prisma.product.update({
      where: { id: pcCanonical.id },
      data: { isCanonical: true },
    });
    console.log(`  ▲ PRD-PC-ASSEMBLED isCanonical=true`);
  }

  // 추가 부속 SKU (RAM 64GB, SSD 4TB)
  const upgradeParts = [
    { sku: "PRD-RAM-DDR5-64G", name: "DDR5 64GB 메모리", price: 520000, cost: 420000 },
    { sku: "PRD-SSD-4TB-NVME", name: "NVMe SSD 4TB", price: 580000, cost: 460000 },
  ];
  const partIds: Record<string, string> = {};
  for (const ap of upgradeParts) {
    const exist = await prisma.product.findUnique({ where: { sku: ap.sku } });
    if (exist) {
      partIds[ap.sku] = exist.id;
      console.log(`  · ${ap.sku} 이미 존재`);
      continue;
    }
    const product = await prisma.product.create({
      data: {
        name: ap.name,
        sku: ap.sku,
        category: { connect: { id: cat.id } },
        productType: "PARTS",
        listPrice: D(ap.price),
        sellingPrice: D(ap.price),
      },
    });
    await prisma.inventory.create({
      data: { product: { connect: { id: product.id } }, quantity: D(5), safetyStock: D(1) },
    });
    await prisma.inventoryLot.create({
      data: {
        product: { connect: { id: product.id } },
        receivedQty: D(5),
        remainingQty: D(5),
        unitCost: D(ap.cost),
        receivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        source: "INITIAL",
      },
    });
    const inv = await prisma.inventory.findUnique({ where: { productId: product.id } });
    if (inv) {
      await prisma.inventoryMovement.create({
        data: {
          inventory: { connect: { id: inv.id } },
          type: "INITIAL",
          quantity: D(5),
          balanceAfter: inv.quantity,
          memo: "조립 variant 부속 초기 재고",
        },
      });
    }
    // 이미지
    const thumbUrl = `https://picsum.photos/seed/${encodeURIComponent(ap.sku)}/600/600`;
    const detailUrl = `https://picsum.photos/seed/${encodeURIComponent(ap.sku)}-d/1200/800`;
    await prisma.product.update({ where: { id: product.id }, data: { imageUrl: thumbUrl } });
    await prisma.productMedia.create({
      data: { product: { connect: { id: product.id } }, type: "IMAGE", kind: "THUMBNAIL", url: thumbUrl, sortOrder: 0 },
    });
    await prisma.productMedia.create({
      data: { product: { connect: { id: product.id } }, type: "IMAGE", kind: "DETAIL", url: detailUrl, sortOrder: 1 },
    });
    partIds[ap.sku] = product.id;
    console.log(`  + ${ap.sku} 부속 생성 + 초기 재고 5`);
  }

  // 기존 부속 ID 조회
  const baseParts: Record<string, string> = {};
  for (const sku of ["PRD-CPU-I7", "PRD-RAM-DDR5-32G", "PRD-SSD-2TB-NVME", "PRD-CASE-MID"]) {
    const p = await prisma.product.findUnique({ where: { sku } });
    if (p) baseParts[sku] = p.id;
  }

  // variant 1: RAM 64GB
  const variantSpecs = [
    {
      sku: "PRD-PC-ASSEMBLED-RAM64",
      name: "조립 PC i7 64G 2TB (RAM 업그레이드)",
      listPrice: 1780000,
      sellingPrice: 1650000,
      components: [
        { sku: "PRD-CPU-I7", label: "CPU" },
        { sku: "PRD-RAM-DDR5-64G", label: "RAM" },
        { sku: "PRD-SSD-2TB-NVME", label: "Storage" },
        { sku: "PRD-CASE-MID", label: "Case" },
      ],
    },
    {
      sku: "PRD-PC-ASSEMBLED-SSD4T",
      name: "조립 PC i7 32G 4TB (SSD 업그레이드)",
      listPrice: 1820000,
      sellingPrice: 1700000,
      components: [
        { sku: "PRD-CPU-I7", label: "CPU" },
        { sku: "PRD-RAM-DDR5-32G", label: "RAM" },
        { sku: "PRD-SSD-4TB-NVME", label: "Storage" },
        { sku: "PRD-CASE-MID", label: "Case" },
      ],
    },
  ];

  for (const v of variantSpecs) {
    const exist = await prisma.product.findUnique({ where: { sku: v.sku } });
    if (exist) {
      console.log(`  · ${v.sku} 이미 존재 — 건너뜀`);
      continue;
    }
    const variant = await prisma.product.create({
      data: {
        name: v.name,
        sku: v.sku,
        category: { connect: { id: cat.id } },
        productType: "ASSEMBLED",
        isSet: true,
        canonicalProduct: { connect: { id: pcCanonical.id } }, // ★ canonical 의 variant
        ...(tmpl ? { assemblyTemplate: { connect: { id: tmpl.id } } } : {}),
        listPrice: D(v.listPrice),
        sellingPrice: D(v.sellingPrice),
        trackable: true,
        warrantyMonths: 12,
      },
    });
    await prisma.inventory.create({
      data: { product: { connect: { id: variant.id } }, quantity: D(0), safetyStock: D(1) },
    });
    for (const c of v.components) {
      const componentId = baseParts[c.sku] ?? partIds[c.sku];
      if (!componentId) continue;
      await prisma.setComponent.create({
        data: {
          setProduct: { connect: { id: variant.id } },
          component: { connect: { id: componentId } },
          quantity: D(1),
          label: c.label,
        },
      });
    }
    // 이미지
    const thumbUrl = `https://picsum.photos/seed/${encodeURIComponent(v.sku)}/600/600`;
    const detailUrl = `https://picsum.photos/seed/${encodeURIComponent(v.sku)}-d/1200/800`;
    await prisma.product.update({ where: { id: variant.id }, data: { imageUrl: thumbUrl } });
    await prisma.productMedia.create({
      data: { product: { connect: { id: variant.id } }, type: "IMAGE", kind: "THUMBNAIL", url: thumbUrl, sortOrder: 0 },
    });
    await prisma.productMedia.create({
      data: { product: { connect: { id: variant.id } }, type: "IMAGE", kind: "DETAIL", url: detailUrl, sortOrder: 1 },
    });
    console.log(`  + ${v.sku} variant 생성 (canonical=PRD-PC-ASSEMBLED, ${v.components.length} 부속)`);
  }

  console.log("\n=== 완료 ===");
  console.log("이제 조립 PC 그룹: 기본 / RAM 64G / SSD 4TB 3종");
  console.log("안전화: 250/270/290 별개 단품 (canonical 관계 없음)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
