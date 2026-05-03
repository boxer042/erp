"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { usePosShell } from "@/components/pos/pos-shell-context";
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

export function LandingPreviewDrawer() {
  const { landingProductId, closeLanding } = usePosShell();
  const productId = landingProductId ?? "";

  const landingQuery = useQuery({
    queryKey: queryKeys.products.landing(productId),
    queryFn: () => apiGet<LandingResponse>(`/api/products/${productId}/landing`),
    enabled: !!productId,
  });

  const footerQuery = useQuery({
    queryKey: queryKeys.landingSettings.all,
    queryFn: () => apiGet<{ footerBlocks: LandingBlock[] }>("/api/landing-settings"),
    enabled: !!productId,
  });

  const blocks: LandingBlock[] = [
    ...(landingQuery.data?.blocks ?? []),
    ...((footerQuery.data?.footerBlocks ?? []).map((b) => ({
      ...b,
      id: `__footer__${b.id}`,
    }))),
  ];

  return (
    <Sheet open={landingProductId !== null} onOpenChange={(o) => !o && closeLanding()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-background p-0 shadow-none sm:max-w-none data-[side=right]:sm:w-[820px] data-[side=right]:lg:w-[960px]"
      >
        <SheetHeader className="flex flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={closeLanding}
            aria-label="닫기"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <SheetTitle className="flex flex-col items-start text-left">
            <span className="truncate text-sm font-semibold">
              {landingQuery.data?.name ?? (landingQuery.isPending ? "" : "상품 상세")}
            </span>
            {landingQuery.data?.sku && (
              <span className="text-xs font-normal text-muted-foreground">
                {landingQuery.data.sku}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div
          className={cn(
            "flex-1 min-h-0",
            landingQuery.data?.landingMode === "SINGLE_HTML"
              ? "overflow-hidden"
              : "overflow-y-auto",
          )}
        >
          {landingQuery.isPending || footerQuery.isPending ? (
            <PreviewSkeleton />
          ) : landingQuery.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
              <p className="text-sm text-muted-foreground">상세페이지를 불러올 수 없습니다</p>
              <Button variant="outline" size="sm" onClick={() => landingQuery.refetch()}>
                <Loader2 className="h-3.5 w-3.5" />
                <span>다시 시도</span>
              </Button>
            </div>
          ) : landingQuery.data?.landingMode === "SINGLE_HTML" ? (
            landingQuery.data.singleHtmlUrl ? (
              <div className="overflow-y-auto h-full">
                <SingleHtmlPreview
                  src={resolveHtmlSrc(landingQuery.data.singleHtmlUrl)}
                />
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
      </SheetContent>
    </Sheet>
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
