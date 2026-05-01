"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChipToggle } from "@/components/ui/chip-toggle";
import { Checkbox } from "@/components/ui/checkbox";
import type { SpecType } from "@/lib/validators/spec-slot";

interface SpecSlot {
  id: string;
  name: string;
  type: SpecType;
  unit: string | null;
  options: string[];
  order: number;
  isActive: boolean;
  _count: { values: number };
}

const slotsKey = ["spec-slots"] as const;

const TYPE_LABELS: Record<SpecType, string> = {
  TEXT: "텍스트",
  NUMBER: "숫자",
  ENUM: "선택지",
};

interface FormState {
  name: string;
  type: SpecType;
  unit: string;
  options: string[];
  order: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  type: "TEXT",
  unit: "",
  options: [],
  order: "0",
  isActive: true,
};

export default function SpecSlotsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpecSlot | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [optionInput, setOptionInput] = useState("");

  const slotsQuery = useQuery({
    queryKey: slotsKey,
    queryFn: () => apiGet<SpecSlot[]>("/api/spec-slots"),
  });

  const filtered = (slotsQuery.data ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOptionInput("");
    setDialogOpen(true);
  };

  const openEdit = (slot: SpecSlot) => {
    setEditing(slot);
    setForm({
      name: slot.name,
      type: slot.type,
      unit: slot.unit ?? "",
      options: [...slot.options],
      order: String(slot.order),
      isActive: slot.isActive,
    });
    setOptionInput("");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        type: form.type,
        unit: form.type === "NUMBER" ? form.unit.trim() || null : null,
        options: form.type === "ENUM" ? form.options : [],
        order: parseInt(form.order, 10) || 0,
        isActive: form.isActive,
      };
      if (editing) {
        return apiMutate(`/api/spec-slots/${editing.id}`, "PUT", body);
      }
      return apiMutate("/api/spec-slots", "POST", body);
    },
    onSuccess: () => {
      toast.success(editing ? "슬롯이 수정되었습니다" : "슬롯이 등록되었습니다");
      qc.invalidateQueries({ queryKey: slotsKey });
      setDialogOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장에 실패했습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/spec-slots/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("슬롯이 삭제되었습니다");
      qc.invalidateQueries({ queryKey: slotsKey });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const addOption = () => {
    const v = optionInput.trim();
    if (!v) return;
    if (form.options.includes(v)) {
      toast.error("이미 추가된 옵션입니다");
      return;
    }
    setForm((p) => ({ ...p, options: [...p.options, v] }));
    setOptionInput("");
  };

  const removeOption = (v: string) => {
    setForm((p) => ({ ...p, options: p.options.filter((o) => o !== v) }));
  };

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{
          value: search,
          onChange: setSearch,
          onSearch: () => {},
          placeholder: "슬롯명 검색...",
        }}
        onAdd={openCreate}
        addLabel="슬롯 등록"
        loading={slotsQuery.isFetching}
        onRefresh={() => qc.invalidateQueries({ queryKey: slotsKey })}
      />
      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead className="w-[80px]">타입</TableHead>
              <TableHead className="w-[100px]">단위</TableHead>
              <TableHead>옵션</TableHead>
              <TableHead className="text-right w-[80px]">사용중</TableHead>
              <TableHead className="w-[60px] text-right">순서</TableHead>
              <TableHead className="w-[80px]">상태</TableHead>
              <TableHead className="w-[100px] text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slotsQuery.isPending ? (
              <SkeletonRows />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  등록된 슬롯이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((slot) => {
                const inUse = slot._count.values;
                return (
                  <TableRow key={slot.id}>
                    <TableCell className="font-medium">{slot.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABELS[slot.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {slot.unit ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {slot.options.length === 0
                        ? "—"
                        : slot.options.length <= 3
                          ? slot.options.join(", ")
                          : `${slot.options.slice(0, 3).join(", ")} 외 ${slot.options.length - 3}개`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inUse}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {slot.order}
                    </TableCell>
                    <TableCell>
                      <Badge variant={slot.isActive ? "secondary" : "outline"}>
                        {slot.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(slot)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={inUse > 0}
                          title={inUse > 0 ? `사용 중 (${inUse}개 상품)` : "삭제"}
                          onClick={() => {
                            if (!confirm("이 슬롯을 삭제하시겠습니까?")) return;
                            deleteMutation.mutate(slot.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) {
            setEditing(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "슬롯 수정" : "슬롯 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="slot-name">이름 *</Label>
              <Input
                id="slot-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="예: 흡입력, 색상"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>타입</Label>
              <ChipToggle
                value={form.type}
                onChange={(v) => setForm((p) => ({ ...p, type: v }))}
                options={[
                  { value: "TEXT", label: "텍스트" },
                  { value: "NUMBER", label: "숫자" },
                  { value: "ENUM", label: "선택지" },
                ]}
              />
            </div>

            {form.type === "NUMBER" && (
              <div className="space-y-1.5">
                <Label htmlFor="slot-unit">단위</Label>
                <Input
                  id="slot-unit"
                  value={form.unit}
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  placeholder="예: W, kg, L"
                />
              </div>
            )}

            {form.type === "ENUM" && (
              <div className="space-y-1.5">
                <Label>옵션</Label>
                <div className="flex gap-2">
                  <Input
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                    placeholder="옵션 추가 후 엔터"
                  />
                  <Button type="button" variant="outline" onClick={addOption}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.options.length === 0 ? (
                    <span className="text-xs text-muted-foreground">옵션 없음</span>
                  ) : (
                    form.options.map((o) => (
                      <Badge key={o} variant="secondary" className="gap-1">
                        {o}
                        <button
                          type="button"
                          onClick={() => removeOption(o)}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="slot-order">표시 순서</Label>
                <Input
                  id="slot-order"
                  type="text"
                  inputMode="numeric"
                  value={form.order}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, order: e.target.value.replace(/\D/g, "") }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm pt-7">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(c) => setForm((p) => ({ ...p, isActive: c === true }))}
                />
                활성
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim()}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editing ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-6" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-6" /></div></TableCell>
          <TableCell><Skeleton className="h-5 w-10 rounded-md" /></TableCell>
          <TableCell><div className="flex justify-end gap-1"><Skeleton className="h-7 w-7 rounded-md" /><Skeleton className="h-7 w-7 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}
