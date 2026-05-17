"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { JmButton, JmSkeleton } from "@/jm";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { SingleHtmlPreview } from "@/components/landing/single-html-preview";
import type { LandingBlock } from "@/lib/validators/landing-block";

export interface LandingResponse {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  blocks: LandingBlock[];
  landingMode: "BLOCKS" | "SINGLE_HTML";
  singleHtmlUrl: string | null;
}

function resolveHtmlSrc(url: string): string {
  const m = url.match(/\/storage\/v1\/object\/public\/product-html\/(.+)$/);
  if (m) return `/api/products/landing-html/${m[1]}`;
  return url;
}

interface Props {
  productId: string;
}

/**
 * v2 고객 페이지 콘텐츠 영역에 임베드되는 상품 상세 — ERP 의 LandingPageView 그대로.
 * 헤더 없음. 본문만. 부모(customer page) 가 헤더(뒤로 + 상품명 + 고객썸네일) 그림.
 * 부모는 같은 queryKey 로 product 정보를 cache 에서 읽어 헤더에 표시 (추가 fetch 없음).
 */
export function ProductDetailView({ productId }: Props) {
  const landingQuery = useQuery({
    queryKey: queryKeys.products.landing(productId),
    queryFn: () => apiGet<LandingResponse>(`/api/products/${productId}/landing`),
    enabled: !!productId,
  });

  const settingsQuery = useQuery({
    queryKey: queryKeys.landingSettings.all,
    queryFn: () =>
      apiGet<{ headerBlocks: LandingBlock[]; footerBlocks: LandingBlock[] }>(
        "/api/landing-settings",
      ),
    enabled: !!productId,
  });

  const blocks: LandingBlock[] = [
    ...((settingsQuery.data?.headerBlocks ?? []).map((b) => ({
      ...b,
      id: `__header__${b.id}`,
    }))),
    ...(landingQuery.data?.blocks ?? []),
    ...((settingsQuery.data?.footerBlocks ?? []).map((b) => ({
      ...b,
      id: `__footer__${b.id}`,
    }))),
  ];

  const isPending = landingQuery.isPending || settingsQuery.isPending;
  const isSingleHtml = landingQuery.data?.landingMode === "SINGLE_HTML";

  if (isPending) return <PreviewSkeleton />;

  if (landingQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        <p className="text-jm-sm text-[var(--jm-text-muted)]">상세페이지를 불러올 수 없습니다</p>
        <JmButton
          type="button"
          variant="cta"
          size="sm"
          onClick={() => landingQuery.refetch()}
        >
          <Loader2 />
          <span>다시 시도</span>
        </JmButton>
      </div>
    );
  }

  if (isSingleHtml) {
    return landingQuery.data?.singleHtmlUrl ? (
      <div className="h-full overflow-y-auto">
        <SingleHtmlPreview src={resolveHtmlSrc(landingQuery.data.singleHtmlUrl)} />
      </div>
    ) : (
      <div className="flex h-full items-center justify-center text-jm-sm text-[var(--jm-text-muted)]">
        HTML 파일이 등록되지 않았습니다
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <LandingPageView
        blocks={blocks}
        emptyMessage="아직 등록된 상세페이지가 없습니다"
        productId={productId}
      />
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <JmSkeleton className="h-[300px] w-full rounded-md" />
      <div className="space-y-2 px-2">
        <JmSkeleton className="h-6 w-2/3" />
        <JmSkeleton className="h-4 w-full" />
        <JmSkeleton className="h-4 w-5/6" />
      </div>
      <JmSkeleton className="h-[400px] w-full rounded-md" />
      <div className="grid grid-cols-3 gap-2">
        <JmSkeleton className="aspect-square w-full rounded-md" />
        <JmSkeleton className="aspect-square w-full rounded-md" />
        <JmSkeleton className="aspect-square w-full rounded-md" />
      </div>
    </div>
  );
}
