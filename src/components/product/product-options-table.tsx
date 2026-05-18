import { JmBadge } from "@/jm";
import type { ProductOptionItem, ProductOptionValueItem } from "./types";

interface Props {
  options: ProductOptionItem[];
}

/**
 * 고객 옵션 표시 — 옵션 슬롯별 카드 리스트.
 * 옵션값마다 연결된 단품(썸네일·이름·SKU·가격)을 한눈에. 편집은 별도 Sheet.
 */
export function ProductOptionsTable({ options }: Props) {
  if (options.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        등록된 고객 옵션이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      {options.map((opt) => (
        <div key={opt.id} className="space-y-1.5">
          {/* 슬롯 헤더 */}
          <div className="flex items-center gap-2 px-0.5">
            <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
              {opt.name}
            </span>
            {opt.required && (
              <JmBadge variant="outline" size="sm" shape="square" className="text-jm-2xs">
                필수
              </JmBadge>
            )}
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              옵션값 {opt.values.length}개
            </span>
          </div>
          {/* 옵션값 카드들 */}
          <div className="space-y-1.5">
            {opt.values.map((v) => (
              <OptionValueCard key={v.id} value={v} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 옵션값 1개 — 라벨 + 연결된 단품(또는 텍스트/변형) */
function OptionValueCard({ value: v }: { value: ProductOptionValueItem }) {
  const addPrice = Number(v.addPrice);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2">
      {/* 옵션값 라벨 */}
      <span className="w-24 shrink-0 truncate text-jm-sm font-medium text-[var(--jm-text)]">
        {v.label}
      </span>

      {v.mappedProduct ? (
        <>
          {/* 연결 기호 — SWAP(교체)=화살표 / ADDON(추가)=플러스 */}
          <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">
            {v.mappedMode === "SWAP" ? "→" : "+"}
          </span>
          <Thumb url={v.mappedProduct.imageUrl} name={v.mappedProduct.name} />
          {/* 연결 단품 정보 */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-jm-sm font-medium text-[var(--jm-text)]">
              {v.mappedProduct.name}
            </div>
            <div className="flex items-center gap-1.5 text-jm-2xs text-[var(--jm-text-muted)]">
              <span className="font-[family-name:var(--jm-font-mono)]">
                {v.mappedProduct.sku}
              </span>
              {v.mappedProduct.sellingPrice != null && (
                <span className="tabular-nums">
                  · ₩{Number(v.mappedProduct.sellingPrice).toLocaleString("ko-KR")}
                </span>
              )}
            </div>
          </div>
          {/* 모드 — SWAP=교체(info) / ADDON=추가(warning) */}
          <JmBadge
            variant={v.mappedMode === "SWAP" ? "info" : "warning"}
            size="sm"
            shape="square"
            className="shrink-0 text-jm-2xs"
            title={
              v.mappedMode === "SWAP"
                ? "이 옵션 선택 시 주문 상품이 이 SKU 로 교체됩니다 (색상·사이즈 변형)"
                : "이 옵션 선택 시 이 상품이 별도 라인으로 함께 결제됩니다"
            }
          >
            {v.mappedMode === "SWAP" ? "교체" : "추가"}
          </JmBadge>
        </>
      ) : v.mappedVariant ? (
        <>
          <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">→</span>
          <Thumb url={null} name={v.mappedVariant.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-jm-sm font-medium text-[var(--jm-text)]">
              {v.mappedVariant.name}
            </div>
            <div className="text-jm-2xs text-[var(--jm-text-muted)] font-[family-name:var(--jm-font-mono)]">
              {v.mappedVariant.sku}
            </div>
          </div>
          <JmBadge variant="accent" size="sm" shape="square" className="shrink-0 text-jm-2xs">
            변형
          </JmBadge>
        </>
      ) : (
        <span className="flex-1 text-jm-xs text-[var(--jm-text-muted)]">
          텍스트 옵션 (연결된 단품 없음)
        </span>
      )}

      {/* 추가가 */}
      {addPrice > 0 && (
        <span className="shrink-0 text-jm-xs tabular-nums text-[var(--jm-text-muted)]">
          +₩{addPrice.toLocaleString("ko-KR")}
        </span>
      )}
    </div>
  );
}

/** 연결 단품 썸네일 — 이미지 없으면 이름 첫 글자 */
function Thumb({ url, name }: { url: string | null | undefined; name: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="size-9 shrink-0 rounded-md border border-[var(--jm-border)] object-cover"
      />
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-xs font-semibold text-[var(--jm-text-muted)]">
      {name.charAt(0)}
    </div>
  );
}
