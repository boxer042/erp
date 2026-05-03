"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { SingleHtmlPreview } from "@/components/landing/single-html-preview";
import type { LandingBlock } from "@/lib/validators/landing-block";

interface LandingResponse {
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

export default function PosProductDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const productId = id ?? "";

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.back()}
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col leading-tight">
          <span className="truncate text-sm font-semibold">
            {landingQuery.data?.name ?? (landingQuery.isPending ? "" : "상품 상세")}
          </span>
          {landingQuery.data?.sku && (
            <span className="text-[11px] font-normal text-muted-foreground">
              {landingQuery.data.sku}
            </span>
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex-1 min-h-0",
          isSingleHtml ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {isPending ? (
          <PreviewSkeleton />
        ) : landingQuery.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
            <p className="text-sm text-muted-foreground">상세페이지를 불러올 수 없습니다</p>
            <Button variant="outline" size="sm" onClick={() => landingQuery.refetch()}>
              <Loader2 className="h-3.5 w-3.5" />
              <span>다시 시도</span>
            </Button>
          </div>
        ) : isSingleHtml ? (
          landingQuery.data?.singleHtmlUrl ? (
            <div className="h-full overflow-y-auto">
              <SingleHtmlPreview src={resolveHtmlSrc(landingQuery.data.singleHtmlUrl)} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              HTML 파일이 등록되지 않았습니다
            </div>
          )
        ) : (
          <LandingPageView
            blocks={blocks}
            emptyMessage="아직 등록된 상세페이지가 없습니다"
            productId={productId}
          />
        )}
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-[300px] w-full rounded-md" />
      <div className="space-y-2 px-2">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <Skeleton className="h-[400px] w-full rounded-md" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="aspect-square w-full rounded-md" />
        <Skeleton className="aspect-square w-full rounded-md" />
        <Skeleton className="aspect-square w-full rounded-md" />
      </div>
    </div>
  );
}
