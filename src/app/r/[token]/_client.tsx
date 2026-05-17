"use client";

import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { JmScope, JmSkeleton, JmBadge } from "@/jm";
import { ManualRenderer } from "@/components/manual-renderer";
import { type ManualBlock, parseManualBlocks } from "@/lib/manual-blocks";

interface RentalAssetData {
  assetNo: string;
  name: string;
  brand: string | null;
  modelNo: string | null;
  imageUrl: string | null;
  manualBlocks: ManualBlock[];
}

export function RentalAssetClient({ token }: { token: string }) {
  const [data, setData] = useState<RentalAssetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/rental-asset/${token}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "조회에 실패했습니다");
        return j as RentalAssetData;
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <JmScope theme="auto" data-jm-scope>
      <div className="min-h-dvh bg-[var(--jm-bg)] font-[family-name:var(--jm-font-sans)]">
        <div className="mx-auto max-w-[480px]">
          {loading ? (
            <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
              <JmSkeleton className="aspect-[16/10] w-full rounded-[var(--jm-radius-lg)]" />
              <JmSkeleton className="h-6 w-40" />
              <JmSkeleton className="h-64 w-full rounded-[var(--jm-radius-lg)]" />
            </div>
          ) : error || !data ? (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
              <Package className="size-12 text-[var(--jm-text-muted)]" />
              <h1 className="text-jm-lg font-bold text-[var(--jm-text)]">
                {error ?? "조회에 실패했습니다"}
              </h1>
              <p className="text-jm-sm text-[var(--jm-text-muted)]">
                QR 코드를 다시 스캔하거나 매장으로 문의해주세요.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
              {/* 히어로 */}
              <div className="aspect-[16/10] w-full overflow-hidden rounded-[var(--jm-radius-lg)] bg-[var(--jm-surface-muted)]">
                {data.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.imageUrl}
                    alt={data.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="size-12 text-[var(--jm-text-muted)]" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <JmBadge>임대 제품</JmBadge>
                <h1 className="text-jm-xl font-bold text-[var(--jm-text)]">
                  {data.name}
                </h1>
                <div className="flex items-center gap-2 text-jm-xs text-[var(--jm-text-muted)]">
                  {(data.brand || data.modelNo) && (
                    <span>{[data.brand, data.modelNo].filter(Boolean).join(" ")}</span>
                  )}
                  <span className="font-[family-name:var(--jm-font-mono)]">
                    {data.assetNo}
                  </span>
                </div>
              </div>

              {/* 사용법 */}
              <div className="rounded-[var(--jm-radius-lg)] border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4">
                <h2 className="mb-3 text-jm-base font-semibold text-[var(--jm-text)]">
                  사용설명서
                </h2>
                <ManualRenderer blocks={parseManualBlocks(data.manualBlocks)} />
              </div>

              <p className="px-2 pt-1 text-center text-jm-xs leading-relaxed text-[var(--jm-text-muted)]">
                임대 제품 사용 중 문제가 있으면 매장으로 문의해주세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </JmScope>
  );
}
