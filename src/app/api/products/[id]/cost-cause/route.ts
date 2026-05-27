import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { computeCurrentUnitCostForId } from "@/lib/product-cost";

/**
 * 원가 변동 알림의 "원인 단서" 조회.
 * acknowledgedAt 이후 일어난 다음 4종 이벤트를 모아 시간 역순으로 반환:
 *   1. 공급가 변경 (SupplierProductPriceHistory)
 *   2. 부대비용 신규/수정/비활성 (IncomingCost.createdAt | updatedAt)
 *   3. 매핑 추가/삭제 (AuditLog entity=Product, action=MAPPING_CREATE/DELETE)
 *   4. 하위 부속(ASSEMBLED/SET)의 원가 변동 — 자식 acknowledged 갱신 + 미확인 변동 직접 비교
 *
 * acknowledgedAt 이 null 이면 product.createdAt 또는 90일 전 중 최근값을 fallback.
 */

const FALLBACK_DAYS = 90;

type CauseKind = "supplier-price" | "incoming-cost" | "mapping" | "subcomponent";

interface Cause {
  type: CauseKind;
  title: string;
  subject: string;
  detail: string;
  delta: {
    from: number;
    to: number;
    diff: number;
    percent: number;
    direction: "up" | "down";
  } | null;
  occurredAt: string;
  link: { href: string; label: string } | null;
}

const num = (v: { toString(): string } | string | number | null | undefined): number =>
  v === null || v === undefined ? 0 : typeof v === "number" ? v : parseFloat(v.toString()) || 0;

const fmtKrw = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      productType: true,
      isSet: true,
      isBulk: true,
      acknowledgedAt: true,
      createdAt: true,
      productMappings: {
        select: {
          id: true,
          createdAt: true,
          supplierProduct: {
            select: {
              id: true,
              name: true,
              supplier: { select: { name: true } },
            },
          },
        },
      },
      setComponents: {
        select: {
          componentId: true,
          quantity: true,
          component: {
            select: {
              id: true,
              name: true,
              sku: true,
              acknowledgedUnitCost: true,
              acknowledgedAt: true,
            },
          },
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  const fallback = new Date(Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000);
  const since = product.acknowledgedAt ?? (product.createdAt > fallback ? product.createdAt : fallback);

  const mappedSpIds = product.productMappings.map((m) => m.supplierProduct.id);
  const spNameById = new Map(
    product.productMappings.map((m) => [
      m.supplierProduct.id,
      {
        name: m.supplierProduct.name,
        supplierName: m.supplierProduct.supplier?.name ?? null,
      },
    ]),
  );

  const causes: Cause[] = [];

  // ─── 1. 공급가 변경 ──────────────────────────────────────────────────────
  if (mappedSpIds.length > 0) {
    const priceChanges = await prisma.supplierProductPriceHistory.findMany({
      where: {
        supplierProductId: { in: mappedSpIds },
        createdAt: { gt: since },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const h of priceChanges) {
      const sp = spNameById.get(h.supplierProductId);
      const oldP = num(h.oldPrice);
      const newP = num(h.newPrice);
      const diff = newP - oldP;
      const pct = num(h.changePercent);
      causes.push({
        type: "supplier-price",
        title: "공급가 변경",
        subject: sp?.name ?? "공급상품",
        detail: `${sp?.supplierName ? `[${sp.supplierName}] ` : ""}${fmtKrw(oldP)} → ${fmtKrw(newP)}`,
        delta: {
          from: oldP,
          to: newP,
          diff,
          percent: pct,
          direction: diff >= 0 ? "up" : "down",
        },
        occurredAt: h.createdAt.toISOString(),
        link: h.incomingId
          ? { href: `/inventory/incoming/${h.incomingId}`, label: "입고 보기" }
          : null,
      });
    }
  }

  // ─── 2. 부대비용 신규 등록 / 수정 ────────────────────────────────────────
  // updatedAt > createdAt → 수정된 비용, 그 외엔 신규.
  // isActive=false 도 포함 — 비용이 비활성화되면 원가가 감소하므로 그것도 원인.
  if (mappedSpIds.length > 0) {
    const recentCosts = await prisma.incomingCost.findMany({
      where: {
        supplierProductId: { in: mappedSpIds },
        OR: [{ createdAt: { gt: since } }, { updatedAt: { gt: since } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    for (const c of recentCosts) {
      const sp = spNameById.get(c.supplierProductId);
      const valueStr =
        c.costType === "PERCENTAGE"
          ? `${num(c.value)}%`
          : fmtKrw(num(c.value));
      const isEdit =
        c.updatedAt > c.createdAt && c.updatedAt.getTime() - c.createdAt.getTime() > 1000;
      const isCreate = c.createdAt > since;
      // 수정 + 신규가 동시에 since 안에 들어오면 둘 중 더 최근 이벤트만:
      // createdAt > since 이면서 isEdit 이면 같은 row 가 두 번 잡히지 않게 신규로 표시
      const isInactivation = !c.isActive;
      let title: string;
      let occurredAt: Date;
      if (isInactivation && c.updatedAt > since) {
        title = "부대비용 비활성";
        occurredAt = c.updatedAt;
      } else if (isEdit && c.updatedAt > since && !isCreate) {
        title = "부대비용 수정";
        occurredAt = c.updatedAt;
      } else if (isCreate) {
        title = "부대비용 추가";
        occurredAt = c.createdAt;
      } else {
        continue;
      }
      causes.push({
        type: "incoming-cost",
        title,
        subject: sp?.name ?? "공급상품",
        detail: `${c.name} · ${valueStr}${c.isTaxable ? " (과세)" : " (면세)"}${isInactivation ? " · 비활성" : ""}`,
        delta: null,
        occurredAt: occurredAt.toISOString(),
        link: null,
      });
    }
  }

  // ─── 3. 매핑 변경 (AuditLog 기반 — 생성/삭제 모두 추적) ─────────────────
  const mappingAudits = await prisma.auditLog.findMany({
    where: {
      entity: "Product",
      entityId: id,
      action: { in: ["MAPPING_CREATE", "MAPPING_DELETE"] },
      createdAt: { gt: since },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const a of mappingAudits) {
    const meta = (a.meta ?? {}) as Record<string, unknown>;
    const subject =
      (meta.supplierProductName as string | undefined) ??
      (meta.productName as string | undefined) ??
      "공급상품";
    const supplierLabel = meta.supplierName ? `[${meta.supplierName}] ` : "";
    const sourceLabel =
      meta.source === "merge"
        ? " (상품 합치기)"
        : meta.source === "auto-map"
          ? " (자동 매핑)"
          : meta.source === "incoming-unconfirm"
            ? " (입고 확정 취소)"
            : "";
    causes.push({
      type: "mapping",
      title: a.action === "MAPPING_CREATE" ? "매핑 추가" : "매핑 삭제",
      subject,
      detail: `${supplierLabel}${a.action === "MAPPING_CREATE" ? "새 매핑이 연결되었습니다" : "매핑이 해제되었습니다"}${sourceLabel}`,
      delta: null,
      occurredAt: a.createdAt.toISOString(),
      link: null,
    });
  }

  // ─── 4. 하위 부속 원가 변동 (ASSEMBLED/SET) ─────────────────────────────
  // 두 종류 모두 잡는다:
  //   (a) 자식이 [확인] 을 눌러 acknowledgedAt 이 since 이후로 갱신된 경우 — 갱신 시점 원인
  //   (b) 자식의 현재 단가 vs acknowledgedUnitCost 차이가 있는 미확인 변동 — 현재 진행형 원인
  const isAssemblyLike = product.productType === "ASSEMBLED" || product.isSet;
  if (isAssemblyLike && product.setComponents.length > 0) {
    const childCostMemo = new Map<string, number | null>();
    for (const sc of product.setComponents) {
      const child = sc.component;

      // (a) 자식이 직접 확인 처리됨 (시점 기록 있음)
      if (child.acknowledgedAt && child.acknowledgedAt > since) {
        causes.push({
          type: "subcomponent",
          title: "하위 부속 원가 변경 (확인됨)",
          subject: child.name,
          detail: "구성품 원가가 갱신되어 합산 원가가 영향을 받았습니다",
          delta: null,
          occurredAt: child.acknowledgedAt.toISOString(),
          link: { href: `/products/${child.id}`, label: "부속 보기" },
        });
        continue;
      }

      // (b) 자식의 미확인 변동 — 현재 단가 vs acknowledged 비교
      const cur = await computeCurrentUnitCostForId(prisma, child.id, {
        memo: childCostMemo,
      });
      const ack = num(child.acknowledgedUnitCost);
      if (cur === null || ack <= 0) continue;
      const diff = cur - ack;
      if (Math.abs(diff) < 1) continue;
      const pct = (diff / ack) * 100;
      causes.push({
        type: "subcomponent",
        title: "하위 부속 미확인 변동",
        subject: child.name,
        detail: `${fmtKrw(ack)} → ${fmtKrw(cur)}`,
        delta: {
          from: ack,
          to: cur,
          diff,
          percent: Math.round(pct * 100) / 100,
          direction: diff >= 0 ? "up" : "down",
        },
        // 부모 acknowledged 시점 직후로 잡아 정렬상 최근으로 보이게
        occurredAt: since.toISOString(),
        link: { href: `/products/${child.id}`, label: "부속 보기" },
      });
    }
  }

  causes.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

  return NextResponse.json({
    acknowledgedAt: product.acknowledgedAt?.toISOString() ?? null,
    since: since.toISOString(),
    causes,
  });
}
