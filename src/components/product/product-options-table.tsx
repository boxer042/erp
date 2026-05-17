import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import type { ProductOptionItem } from "./types";

interface Props {
  options: ProductOptionItem[];
}

/**
 * 고객 옵션 표시 — 슬롯·값·매핑 한눈에. 편집은 별도 Sheet.
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
    <JmTable>
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[160px]">
            슬롯
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            값
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[100px] text-right">
            추가가
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[200px]">
            매핑
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {options.flatMap((opt) =>
          opt.values.map((v, idx) => (
            <JmTableRow key={v.id}>
              <JmTableCell className="px-3 py-2">
                {idx === 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-jm-sm text-[var(--jm-text)]">
                      {opt.name}
                    </span>
                    {opt.required && (
                      <JmBadge
                        variant="outline"
                        size="sm"
                        shape="square"
                        className="text-jm-2xs"
                      >
                        필수
                      </JmBadge>
                    )}
                  </div>
                ) : null}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-sm text-[var(--jm-text)]">
                {v.label}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-right text-[var(--jm-text)]">
                {Number(v.addPrice) > 0
                  ? `+₩${Number(v.addPrice).toLocaleString("ko-KR")}`
                  : "—"}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-xs">
                {v.mappedProduct ? (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <JmBadge variant="info" size="sm" shape="square" className="text-jm-2xs">
                      Product
                    </JmBadge>
                    <JmBadge
                      variant="default"
                      size="sm"
                      shape="square"
                      className="text-jm-2xs"
                      title={
                        v.mappedMode === "SWAP"
                          ? "옵션 선택 시 메인 라인의 productId 가 매핑된 SKU 로 교체됨 (색상·사이즈)"
                          : "옵션 선택 시 자식 OrderItem 자동 추가 (메인 + 부속). 일반 추가구매는 BundleProduct 권장"
                      }
                    >
                      {v.mappedMode}
                    </JmBadge>
                    <span className="font-[family-name:var(--jm-font-mono)] text-[var(--jm-text)]">
                      {v.mappedProduct.sku}
                    </span>
                  </span>
                ) : v.mappedVariant ? (
                  <span className="inline-flex items-center gap-1">
                    <JmBadge variant="accent" size="sm" shape="square" className="text-jm-2xs">
                      Variant
                    </JmBadge>
                    <span className="font-[family-name:var(--jm-font-mono)] text-[var(--jm-text)]">
                      {v.mappedVariant.sku}
                    </span>
                  </span>
                ) : (
                  <span className="text-[var(--jm-text-muted)]">단순 텍스트</span>
                )}
              </JmTableCell>
            </JmTableRow>
          )),
        )}
      </JmTableBody>
    </JmTable>
  );
}
