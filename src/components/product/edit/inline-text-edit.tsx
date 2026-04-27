"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface InlineTextEditProps {
  /** 표시되는 현재 값 */
  value: string;
  /** "" → "-" 로 표시 */
  placeholder?: string;
  /** input vs textarea */
  multiline?: boolean;
  /** 저장 동작 — 사용자가 입력한 새 값을 받아서 PUT 등 수행 */
  onSave: (next: string) => Promise<void>;
  /** 저장 후 invalidate 할 productId (쿼리 캐시 갱신) */
  productId?: string;
  /** 표시 영역의 className (라벨처럼 보이게 등) */
  className?: string;
  /** 저장 버튼 옆 추가 검증 — 빈 문자열 허용 여부 */
  allowEmpty?: boolean;
  /** 미리 보여주는 React 노드 — value 대신 표시 (Badge 등) */
  display?: React.ReactNode;
  /** 입력 옆에 보여줄 작은 보조 노드 (단위 표시 등) */
  inputSuffix?: React.ReactNode;
  /** 입력 모드 (numeric, decimal 등) */
  inputMode?: "numeric" | "decimal" | "text";
  /** 천단위 콤마 포맷 적용 */
  commaFormat?: boolean;
}

/**
 * Pencil 아이콘 토글로 인라인 편집 가능한 텍스트.
 *
 * 표시 모드:
 *   <span>{value}</span> [hover 시 Pencil 아이콘]
 * 편집 모드:
 *   <input value={draft}/> [✓] [×]
 *
 * 사용:
 *   <InlineTextEdit
 *     value={product.name}
 *     productId={product.id}
 *     onSave={(next) => updateProductFields(product.id, { ...current, name: next })}
 *   />
 */
export function InlineTextEdit({
  value,
  placeholder = "-",
  multiline = false,
  onSave,
  productId,
  className,
  allowEmpty = false,
  display,
  inputSuffix,
  inputMode,
  commaFormat = false,
}: InlineTextEditProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) inputRef.current.select();
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = commaFormat ? draft.replace(/,/g, "") : draft;
      if (!allowEmpty && !trimmed.trim()) {
        throw new Error("값을 입력해주세요");
      }
      await onSave(trimmed);
    },
    onSuccess: () => {
      toast.success("저장되었습니다");
      setEditing(false);
      if (productId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(productId) });
      }
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패");
    },
  });

  const formatDisplay = (s: string) =>
    commaFormat && s ? Number(s.replace(/,/g, "")).toLocaleString("ko-KR") : s;

  if (!editing) {
    const showValue = display ?? (value ? formatDisplay(value) : <span className="text-muted-foreground">{placeholder}</span>);
    return (
      <span className={`group inline-flex items-center gap-1.5 ${className ?? ""}`}>
        <span>{showValue}</span>
        <button
          type="button"
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          aria-label="편집"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  const InputComp = multiline ? Textarea : Input;
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (
      e.key === "Enter" &&
      !multiline &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      saveMutation.mutate();
    }
  };

  return (
    <span className={`inline-flex items-start gap-1.5 ${className ?? ""}`}>
      <InputComp
        ref={inputRef as never}
        value={commaFormat ? formatDisplay(draft) : draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setDraft(commaFormat ? e.target.value.replace(/,/g, "") : e.target.value)
        }
        onKeyDown={handleKey}
        inputMode={inputMode}
        className={multiline ? "min-h-[60px]" : "h-8 text-sm"}
        disabled={saveMutation.isPending}
      />
      {inputSuffix}
      <Button
        type="button"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        aria-label="저장"
      >
        {saveMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        onClick={() => setEditing(false)}
        disabled={saveMutation.isPending}
        aria-label="취소"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
