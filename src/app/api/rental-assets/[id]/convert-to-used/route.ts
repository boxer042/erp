import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { nextUsedItemCode } from "@/lib/used-item-code";
import { z } from "zod";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const convertSchema = z.object({
  /** 매입가 (= 감가상각 잔존가). 보통 0 또는 매장이 추정한 잔존가치 */
  acquiredCost: z.string().regex(/^-?\d+(\.\d+)?$/).default("0"),
  /** 시리얼 라벨 발번 토글 — 단품 판매 예정이면 ON */
  issueSerial: z.boolean().default(false),
  /** 시리얼 발번 시 보증 개월 (0 = 보증 없음) */
  warrantyMonths: z.number().int().min(0).max(120).default(0),
  memo: z.string().nullish(),
});

/**
 * POST /api/rental-assets/[id]/convert-to-used
 *
 * 임대 자산 lifecycle 종료 → UsedItem 전환.
 *
 * 동작:
 *  1. RentalAsset.status = RETIRED
 *  2. UsedItem 신규 생성 — acquiredFrom=RENTAL_RETIREMENT, productId 가 있으면 카탈로그 매칭 보존,
 *     name 은 RentalAsset.name, 사진은 RentalAsset.imageUrl (있으면)
 *  3. RentalAsset.convertedUsedItemId ↔ UsedItem.rentalAssetId 양방향 link (UsedItem 측은 자동)
 *  4. (옵션) 시리얼 라벨 발번 (USED_INTAKE source)
 *
 * 가드:
 *  - status=RENTED (현재 사용 중) 는 차단 — 자산이 손님 손에 있음
 *  - 이미 convertedUsedItemId 가 있으면 중복 전환 차단
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = convertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const asset = await prisma.rentalAsset.findUnique({
    where: { id },
    include: { convertedUsedItem: { select: { id: true } } },
  });
  if (!asset) {
    return NextResponse.json({ error: "임대 자산을 찾을 수 없습니다" }, { status: 404 });
  }
  if (asset.status === "RENTED") {
    return NextResponse.json(
      { error: "현재 임대 중인 자산은 중고로 전환할 수 없습니다 — 반납 후 다시 시도" },
      { status: 400 },
    );
  }
  if (asset.convertedUsedItem) {
    return NextResponse.json(
      { error: "이미 중고 단품으로 전환되어 있습니다", usedItemId: asset.convertedUsedItem.id },
      { status: 400 },
    );
  }

  const acquiredCost = parseFloat(data.acquiredCost) || 0;
  const now = new Date();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const internalCode = await nextUsedItemCode(tx, now);

      // 시리얼 발번 (옵션)
      let serialItemId: string | null = null;
      if (data.issueSerial) {
        const yy = String(now.getFullYear() % 100).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const prefix = `${yy}${mm}${dd}`;
        const count = await tx.serialItem.count({
          where: { code: { startsWith: `${prefix}-` } },
        });
        const seq = String(count + 1).padStart(4, "0");
        const code = `${prefix}-${seq}`;

        const warrantyEnds = data.warrantyMonths
          ? new Date(
              now.getFullYear(),
              now.getMonth() + data.warrantyMonths,
              now.getDate(),
            )
          : null;

        const serial = await tx.serialItem.create({
          data: {
            code,
            productId: asset.productId,
            displayName: asset.productId ? null : asset.name,
            source: "USED_INTAKE",
            soldAt: null,
            warrantyEnds,
            status: "ACTIVE",
          },
        });
        serialItemId = serial.id;
      }

      // UsedItem 생성 (rentalAssetId link 양방향 자동)
      const usedItem = await tx.usedItem.create({
        data: {
          internalCode,
          displayName: asset.name,
          productId: asset.productId,
          acquiredFrom: "RENTAL_RETIREMENT",
          acquiredCost,
          isAcquiredTaxable: false,
          acquiredAt: now,
          status: "IN_STOCK",
          imageUrls: asset.imageUrl ? [asset.imageUrl] : undefined,
          memo: data.memo ?? `임대 자산 ${asset.assetNo} 에서 전환`,
          rentalAssetId: asset.id,
          serialItemId,
          createdById: user!.id,
        },
        include: {
          serialItem: { select: { id: true, code: true } },
        },
      });

      // RentalAsset.status = RETIRED + isActive=false (목록에서 숨김)
      await tx.rentalAsset.update({
        where: { id: asset.id },
        data: { status: "RETIRED", isActive: false },
      });

      return usedItem;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "중고 전환에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
