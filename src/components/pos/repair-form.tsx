"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatComma, parseComma } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";

interface LaborPreset {
  id: string;
  name: string;
  unitRate: string;
}

interface Props {
  sessionId: string;
  enabled?: boolean;
}

export function RepairForm({ sessionId, enabled = true }: Props) {
  const { add, getSession } = useSessions();
  const session = getSession(sessionId);

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

  const handleSelectPreset = (p: LaborPreset) => {
    setName(p.name);
    setPrice(String(parseFloat(p.unitRate) || 0));
  };

  const handleSubmit = () => {
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
        },
      },
      { sessionId }
    );
    toast.success("수리 항목 추가됨");
    setName("");
    setPrice("");
    setIssueDescription("");
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
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
                  name === p.name && "border-primary bg-primary/5"
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

        <Button size="lg" className="h-12" onClick={handleSubmit}>
          카트에 수리 추가
        </Button>
      </section>
    </div>
  );
}
