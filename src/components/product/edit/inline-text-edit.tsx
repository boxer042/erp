"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { JmIconButton, JmInput, JmTextarea } from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";

interface InlineTextEditProps {
  /** 표시되는 현재 값 */
  value: string;
  /** "" → "-" 로 표시 */
  placeholder?: string;
  /** input vs textarea */
  multiline?: boolean;
  /** 저장 동작 — 사용자가 입력한 새 값을 받아서 PUT 등 수행 */
  onSave: (next: string) => Promise<void>;
  /** 저장 후 invalidate 할 productId (쿼리 캐시 갱신) — products.all 로 invalidate 하므로 현재 unused. 호환 보존. */
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
 */
export function InlineTextEdit({
  value,
  placeholder = "-",
  multiline = false,
  onSave,
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

  // money/숫자 인풋이면 select-all 대신 캐럿 끝 (기존 값 보존 + 끝부터 편집)
  const isMoney =
    commaFormat || inputMode === "numeric" || inputMode === "decimal";

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      if (isMoney) {
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          // type 이 caret 미지원이면 무시
        }
      } else if ("select" in el) {
        el.select();
      }
    }
  }, [editing, isMoney]);

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
      // 상세 + 목록 + costs/movements 등 모든 products 관련 쿼리 일괄 갱신.
      // detail 만 invalidate 하면 목록 페이지에서 인라인 편집해도 다른 행/캐시가
      // 옛 이름으로 남아 사용자가 새로고침해야 하는 문제 방지.
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패");
    },
  });

  const formatDisplay = (s: string) =>
    commaFormat && s ? Number(s.replace(/,/g, "")).toLocaleString("ko-KR") : s;

  if (!editing) {
    const showValue =
      display ??
      (value ? (
        formatDisplay(value)
      ) : (
        <span className="text-[var(--jm-text-muted)]">{placeholder}</span>
      ));
    return (
      <span className={`group inline-flex items-center gap-1.5 ${className ?? ""}`}>
        <span>{showValue}</span>
        <button
          type="button"
          onClick={startEdit}
          className="opacity-40 group-hover:opacity-100 transition-opacity text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
          aria-label="편집"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    );
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter" && !multiline && !e.nativeEvent.isComposing) {
      e.preventDefault();
      saveMutation.mutate();
    }
  };

  return (
    <span className={`inline-flex items-start gap-1.5 ${className ?? ""}`}>
      {multiline ? (
        <JmTextarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          value={commaFormat ? formatDisplay(draft) : draft}
          onChange={(e) =>
            setDraft(
              commaFormat ? e.target.value.replace(/,/g, "") : e.target.value,
            )
          }
          onKeyDown={handleKey}
          className="min-h-[60px]"
          disabled={saveMutation.isPending}
        />
      ) : (
        <JmInput
          ref={inputRef as React.Ref<HTMLInputElement>}
          size="sm"
          value={commaFormat ? formatDisplay(draft) : draft}
          onChange={(e) =>
            setDraft(
              commaFormat ? e.target.value.replace(/,/g, "") : e.target.value,
            )
          }
          onKeyDown={handleKey}
          onFocus={isMoney ? focusCaretEnd : undefined}
          inputMode={inputMode}
          disabled={saveMutation.isPending}
        />
      )}
      {inputSuffix}
      <JmIconButton
        type="button"
        size="sm"
        variant="solid"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        aria-label="저장"
      >
        {saveMutation.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Check />
        )}
      </JmIconButton>
      <JmIconButton
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setEditing(false)}
        disabled={saveMutation.isPending}
        aria-label="취소"
      >
        <X />
      </JmIconButton>
    </span>
  );
}
