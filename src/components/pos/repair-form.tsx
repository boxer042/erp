"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, MapPin, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatComma, parseComma } from "@/lib/utils";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";

interface LaborPreset {
  id: string;
  name: string;
  unitRate: string;
}

type RepairType = "ON_SITE" | "DROP_OFF";

interface Props {
  sessionId: string;
  enabled?: boolean;
}

export function RepairForm({ sessionId, enabled = true }: Props) {
  const router = useRouter();
  const { add, getSession } = useSessions();
  const session = getSession(sessionId);

  const [type, setType] = useState<RepairType>("ON_SITE");
  const [serialCode, setSerialCode] = useState("");
  const [serialItemId, setSerialItemId] = useState<string | null>(null);
  const [deviceBrand, setDeviceBrand] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const presetsQuery = useQuery({
    queryKey: ["pos", "repair-labor-presets"],
    queryFn: () => apiGet<LaborPreset[]>("/api/repair-labor-presets"),
    enabled,
  });

  // 시리얼 코드 조회 — 손님·상품 자동 채움
  const lookupSerial = useMutation({
    mutationFn: async () => {
      const list = await apiGet<
        Array<{
          id: string;
          code: string;
          product: { name: string };
          customer: { id: string; name: string; phone: string | null } | null;
        }>
      >(`/api/serial-items?search=${encodeURIComponent(serialCode)}`);
      const exact = list.find((i) => i.code === serialCode.trim());
      if (!exact) throw new Error("해당 라벨 코드를 찾을 수 없습니다");
      return exact;
    },
    onSuccess: (item) => {
      setSerialItemId(item.id);
      setDeviceModel(item.product.name);
      toast.success(`라벨 ${item.code} — ${item.product.name}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "조회 실패"),
  });

  // 맡김수리 접수 — RepairTicket 생성 후 작업 화면으로 이동
  const dropOffMutation = useMutation({
    mutationFn: () => {
      if (!session?.customerId) throw new Error("손님 연결이 필요합니다");
      const symptom = [
        deviceBrand && deviceModel ? `${deviceBrand} ${deviceModel}` : deviceBrand || deviceModel,
        issueDescription.trim(),
      ]
        .filter(Boolean)
        .join(" — ");
      return apiMutate<{ id: string; ticketNo: string }>(
        "/api/repair-tickets",
        "POST",
        {
          type: "DROP_OFF",
          customerId: session.customerId,
          serialItemId: serialItemId || null,
          symptom: symptom || null,
        },
      );
    },
    onSuccess: (ticket) => {
      toast.success(`접수 완료 — ${ticket.ticketNo}`);
      router.push(`/repairs/${ticket.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "접수 실패"),
  });

  const handleSelectPreset = (p: LaborPreset) => {
    setName(p.name);
    setPrice(String(parseFloat(p.unitRate) || 0));
  };

  const handleAddToCart = () => {
    if (!session?.customerId) {
      toast.error("수리 추가는 손님 연결이 필요합니다");
      return;
    }
    if (!name.trim()) {
      toast.error("수리명을 입력해주세요");
      return;
    }
    const num = parseFloat(price.replace(/,/g, "")) || 0;
    if (num <= 0) {
      toast.error("수리비를 입력해주세요");
      return;
    }
    add(
      {
        itemType: "repair",
        name: name.trim(),
        imageUrl: null,
        unitPrice: num,
        taxType: "TAXABLE",
        repairMeta: {
          deviceBrand: deviceBrand.trim() || undefined,
          deviceModel: deviceModel.trim() || undefined,
          issueDescription: issueDescription.trim() || undefined,
          serialItemId: serialItemId || undefined,
        },
      },
      { sessionId },
    );
    toast.success("수리 항목 추가됨");
    setName("");
    setPrice("");
  };

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-4">
      {/* 타입 토글 */}
      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType("ON_SITE")}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
              type === "ON_SITE"
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-foreground/20",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <MapPin className="size-4" /> 즉시수리
            </span>
            <span className="text-xs text-muted-foreground">
              현장에서 바로 수리하고 카트에 추가 → 결제
            </span>
          </button>
          <button
            type="button"
            onClick={() => setType("DROP_OFF")}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
              type === "DROP_OFF"
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-foreground/20",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Wrench className="size-4" /> 맡김수리
            </span>
            <span className="text-xs text-muted-foreground">
              접수 후 작업 화면으로 이동, 픽업 시 결제
            </span>
          </button>
        </div>
      </section>

      {/* 시리얼 라벨 코드 (선택) */}
      <section className="flex flex-col gap-2">
        <Label htmlFor="serial-code" className="text-xs text-muted-foreground">
          시리얼 라벨 코드 (선택 — 손님 라벨 스캔)
        </Label>
        <div className="flex gap-2">
          <Input
            id="serial-code"
            value={serialCode}
            onChange={(e) => {
              setSerialCode(e.target.value);
              setSerialItemId(null);
            }}
            placeholder="예: 241125-0042"
            className="font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && serialCode.trim()) {
                lookupSerial.mutate();
              }
            }}
          />
          <Button
            variant="outline"
            onClick={() => lookupSerial.mutate()}
            disabled={!serialCode.trim() || lookupSerial.isPending}
          >
            {lookupSerial.isPending && <Loader2 className="size-4 animate-spin" />}
            조회
          </Button>
        </div>
        {serialItemId && (
          <span className="text-xs text-primary">✓ 연동됨 — 보증 정보가 자동 적용됩니다</span>
        )}
      </section>

      {/* 장비 정보 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">장비 정보</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand">브랜드</Label>
            <Input
              id="brand"
              value={deviceBrand}
              onChange={(e) => setDeviceBrand(e.target.value)}
              placeholder="예: Samsung"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">모델명</Label>
            <Input
              id="model"
              value={deviceModel}
              onChange={(e) => setDeviceModel(e.target.value)}
              placeholder="예: QN65Q60A"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issue">증상</Label>
          <Textarea
            id="issue"
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            placeholder="고객이 말한 증상"
            rows={3}
          />
        </div>
      </section>

      {type === "DROP_OFF" ? (
        // 맡김수리 — 접수만, 결제는 픽업 시 별도
        <section className="flex flex-col gap-3">
          <Button
            size="lg"
            className="h-14"
            onClick={() => dropOffMutation.mutate()}
            disabled={dropOffMutation.isPending || !session?.customerId}
          >
            {dropOffMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            <ClipboardList className="size-4" />
            맡김 접수 (작업 화면으로 이동)
          </Button>
          {!session?.customerId && (
            <p className="text-xs text-muted-foreground">
              ⚠ 손님 연결 후 접수 가능합니다
            </p>
          )}
        </section>
      ) : (
        // 즉시수리 — 카트에 항목 추가, 카트 결제 흐름 사용
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">수리 항목</h2>

          {presetsQuery.isPending ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : presetsQuery.data && presetsQuery.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {presetsQuery.data.map((p) => (
                <Card
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  className={cn(
                    "cursor-pointer p-3 transition-colors hover:border-primary",
                    name === p.name && "border-primary bg-primary/5",
                  )}
                >
                  <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    ₩{Math.round(parseFloat(p.unitRate) || 0).toLocaleString("ko-KR")}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Wrench />
                </EmptyMedia>
                <EmptyTitle>등록된 수리 프리셋이 없습니다</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repair-name">수리명</Label>
            <Input
              id="repair-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: TV 화면 교체"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repair-price">수리비</Label>
            <Input
              id="repair-price"
              type="text"
              inputMode="numeric"
              value={formatComma(price)}
              onChange={(e) => setPrice(parseComma(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0"
              className="text-right tabular-nums"
            />
          </div>

          <Button size="lg" className="h-12" onClick={handleAddToCart}>
            카트에 수리 추가
          </Button>
        </section>
      )}
    </div>
  );
}
