"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { ProductDetail } from "./types";
import { InlineTextEdit } from "./edit/inline-text-edit";

interface ProductHeaderBarProps {
  product: Pick<
    ProductDetail,
    | "id"
    | "name"
    | "sku"
    | "imageUrl"
    | "isSet"
    | "isCanonical"
    | "canonicalProductId"
    | "isBulk"
    | "productType"
  >;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  /** 상품명 인라인 편집 — 제공 시 hover Pencil 아이콘 노출 */
  onSaveName?: (next: string) => Promise<void>;
  /** 대표 이미지 변경 — 제공 시 썸네일 호버 시 업로드 오버레이 노출 */
  onSaveImageUrl?: (url: string) => Promise<void>;
}

export function ProductHeaderBar({
  product,
  backHref = "/products",
  backLabel = "목록",
  actions,
  onSaveName,
  onSaveImageUrl,
}: ProductHeaderBarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!onSaveImageUrl) return;
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "업로드 실패");
      }
      const { url } = (await res.json()) as { url: string };
      await onSaveImageUrl(url);
      return url;
    },
    onSuccess: () => {
      toast.success("대표 이미지가 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(product.id) });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "업로드 실패"),
  });

  const renderThumb = () => {
    if (!product.imageUrl && !onSaveImageUrl) return null;

    const editable = !!onSaveImageUrl;
    const inner = product.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.imageUrl}
        alt={product.name}
        className="h-10 w-10 rounded-md object-cover border border-border"
      />
    ) : (
      <div className="h-10 w-10 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground">
        <ImagePlus className="h-4 w-4" />
      </div>
    );

    if (!editable) {
      return <div className="shrink-0">{inner}</div>;
    }

    return (
      <button
        type="button"
        className="relative h-10 w-10 shrink-0 group"
        onClick={() => fileRef.current?.click()}
        disabled={uploadMutation.isPending}
        aria-label="대표 이미지 변경"
      >
        {inner}
        <span className="absolute inset-0 rounded-md bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {uploadMutation.isPending ? (
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4 text-white" />
          )}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            e.target.value = "";
          }}
        />
      </button>
    );
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={backLabel}
        onClick={handleBack}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      {renderThumb()}
      {onSaveName ? (
        <h2 className="text-lg font-semibold truncate">
          <InlineTextEdit
            value={product.name}
            productId={product.id}
            onSave={onSaveName}
          />
        </h2>
      ) : (
        <h2 className="text-lg font-semibold truncate">{product.name}</h2>
      )}
      <Badge variant="outline">{product.sku}</Badge>
      {product.isSet && <Badge>세트</Badge>}
      {product.productType === "ASSEMBLED" && <Badge>조립</Badge>}
      {product.isCanonical && <Badge variant="default">대표</Badge>}
      {product.canonicalProductId && <Badge variant="secondary">변형</Badge>}
      {product.isBulk && <Badge variant="secondary">벌크원료</Badge>}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
