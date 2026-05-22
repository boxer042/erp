"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  JmButton,
  JmCheckbox,
  JmDialog,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmInput,
} from "@/jm";
import { ApiError, apiMutate } from "@/lib/api-client";

export type QuickTemplateSlot = {
  id: string;
  label: string;
  slotLabelId: string | null;
  order: number;
  defaultProductId: string | null;
  defaultQuantity: string;
};

export type QuickTemplate = {
  id: string;
  name: string;
  defaultLaborCost: string | null;
  isActive: boolean;
  slots: QuickTemplateSlot[];
  presets: Array<{
    id: string;
    name: string;
    items: Array<{ slotId: string; productId: string; quantity: string }>;
  }>;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (template: QuickTemplate) => void;
  defaultName?: string;
}

type SlotRow = {
  key: string;
  label: string;
  defaultQuantity: string;
  isVariable: boolean;
};

const emptySlot = (): SlotRow => ({
  key: Math.random().toString(36).slice(2),
  label: "",
  defaultQuantity: "1",
  isVariable: false,
});

export function QuickAssemblyTemplateDialog({
  open,
  onOpenChange,
  onCreated,
  defaultName = "",
}: Props) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [defaultLaborCost, setDefaultLaborCost] = useState("");
  const [slots, setSlots] = useState<SlotRow[]>(() => [emptySlot()]);
  const [submitting, setSubmitting] = useState(false);

  // 다이얼로그 열릴 때마다 defaultName 반영 + 슬롯 초기화
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setDescription("");
      setDefaultLaborCost("");
      setSlots([emptySlot()]);
    }
  }, [open, defaultName]);

  const addSlot = () => setSlots((prev) => [...prev, emptySlot()]);
  const removeSlot = (key: string) =>
    setSlots((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));
  const updateSlot = (key: string, patch: Partial<SlotRow>) =>
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const submit = async () => {
    if (!name.trim()) {
      toast.error("템플릿명을 입력해주세요");
      return;
    }
    if (slots.length === 0 || slots.some((s) => !s.label.trim())) {
      toast.error("슬롯 라벨을 모두 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiMutate<QuickTemplate>(
        "/api/assembly-templates",
        "POST",
        {
          name: name.trim(),
          description: description.trim() || undefined,
          defaultLaborCost: defaultLaborCost.trim() || null,
          isActive: true,
          slots: slots.map((s, idx) => ({
            label: s.label.trim(),
            order: idx,
            defaultQuantity: s.defaultQuantity || "1",
            isVariable: s.isVariable,
          })),
        },
      );
      toast.success("조립 템플릿이 등록되었습니다");
      // 신규 생성이라 presets 는 빈 배열로 보장
      onCreated({ ...result, presets: result.presets ?? [] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent className="max-w-xl">
        <JmDialogHeader>
          <JmDialogTitle>새 조립 템플릿</JmDialogTitle>
        </JmDialogHeader>
        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-jm-xs text-[var(--jm-text-muted)]">템플릿명 *</label>
              <JmInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 3HP 공기압축기"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-jm-xs text-[var(--jm-text-muted)]">
                기본 조립비 (선택)
              </label>
              <JmInput
                inputMode="numeric"
                value={defaultLaborCost}
                onChange={(e) => setDefaultLaborCost(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-jm-xs text-[var(--jm-text-muted)]">설명 (선택)</label>
            <JmInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="간단한 메모"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-jm-sm font-medium">슬롯 *</span>
              <JmButton type="button" variant="outline" size="sm" onClick={addSlot}>
                <Plus className="size-3.5" />
                슬롯 추가
              </JmButton>
            </div>
            <div className="flex flex-col gap-2">
              {slots.map((s, idx) => (
                <div
                  key={s.key}
                  className="grid grid-cols-[1fr_90px_auto_auto] items-center gap-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-2"
                >
                  <JmInput
                    size="sm"
                    value={s.label}
                    onChange={(e) => updateSlot(s.key, { label: e.target.value })}
                    placeholder={`슬롯 ${idx + 1} 라벨 (예: 모터)`}
                  />
                  <JmInput
                    size="sm"
                    inputMode="decimal"
                    value={s.defaultQuantity}
                    onChange={(e) =>
                      updateSlot(s.key, { defaultQuantity: e.target.value })
                    }
                    placeholder="수량"
                  />
                  <label className="flex items-center gap-1.5 text-jm-xs text-[var(--jm-text-muted)] whitespace-nowrap">
                    <JmCheckbox
                      checked={s.isVariable}
                      onCheckedChange={(v) =>
                        updateSlot(s.key, { isVariable: v === true })
                      }
                    />
                    가변
                  </label>
                  <JmButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSlot(s.key)}
                    disabled={slots.length <= 1}
                    aria-label="슬롯 삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </JmButton>
                </div>
              ))}
            </div>
            <p className="text-jm-2xs text-[var(--jm-text-muted)]">
              가변 슬롯 — 같은 템플릿으로 부속만 다른 변형 상품을 만들 때 표시.
            </p>
          </div>
        </div>
        <JmDialogFooter>
          <JmButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </JmButton>
          <JmButton onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            등록
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
