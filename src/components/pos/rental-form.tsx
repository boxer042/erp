"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";

interface RentalAsset {
  id: string;
  assetNo: string;
  name: string;
  brand: string | null;
  dailyRate: string;
  monthlyRate: string;
  depositAmount: string | null;
  status: string;
}

interface Props {
  sessionId: string;
  enabled?: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RentalForm({ sessionId, enabled = true }: Props) {
  const { add, getSession } = useSessions();
  const session = getSession(sessionId);

  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());

  const assetsQuery = useQuery({
    queryKey: ["pos", "rental-assets", "AVAILABLE"],
    queryFn: () => apiGet<RentalAsset[]>("/api/rental-assets?status=AVAILABLE"),
    enabled,
  });

  const selected = useMemo(
    () => assetsQuery.data?.find((a) => a.id === selectedAssetId),
    [assetsQuery.data, selectedAssetId]
  );

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const diff = Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
    );
    return Math.max(1, diff);
  }, [startDate, endDate]);

  const dailyRate = selected ? Number(selected.dailyRate) : 0;
  const totalAmount = dailyRate * days;

  const handleSubmit = () => {
    if (!session?.customerId) {
      toast.error("임대 추가는 손님 연결이 필요합니다");
      return;
    }
    if (!selected) {
      toast.error("임대 자산을 선택해주세요");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("기간을 입력해주세요");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast.error("종료일이 시작일보다 빠를 수 없습니다");
      return;
    }
    add(
      {
        itemType: "rental",
        name: selected.name,
        sku: selected.assetNo,
        imageUrl: null,
        unitPrice: totalAmount,
        taxType: "TAXABLE",
        rentalMeta: {
          assetId: selected.id,
          dailyRate,
          depositAmount: selected.depositAmount ? Number(selected.depositAmount) : undefined,
          startDate,
          endDate,
        },
      },
      { sessionId }
    );
    toast.success(`${selected.name} 임대 추가됨`);
    setSelectedAssetId("");
  };

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">임대 자산</h2>
        {assetsQuery.isPending ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : assetsQuery.data && assetsQuery.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {assetsQuery.data.map((a) => (
              <Card
                key={a.id}
                onClick={() => setSelectedAssetId(a.id)}
                className={cn(
                  "cursor-pointer p-3 transition-colors hover:border-primary",
                  selectedAssetId === a.id && "border-primary bg-primary/5"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="line-clamp-1 font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.assetNo}</div>
                </div>
                <div className="mt-1 text-sm tabular-nums text-muted-foreground">
                  일 ₩{Math.round(Number(a.dailyRate)).toLocaleString("ko-KR")}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClock />
              </EmptyMedia>
              <EmptyTitle>대여 가능한 자산이 없습니다</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">대여 기간</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rental-start">시작일</Label>
            <Input
              id="rental-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rental-end">종료일</Label>
            <Input
              id="rental-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg bg-muted/50 p-4">
        <div className="flex items-baseline justify-between text-sm text-muted-foreground">
          <span>일 단가 × 일수</span>
          <span className="tabular-nums">
            ₩{dailyRate.toLocaleString("ko-KR")} × {days}일
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-base font-semibold">대여료 합계</span>
          <span className="text-xl font-bold tabular-nums">
            ₩{totalAmount.toLocaleString("ko-KR")}
          </span>
        </div>
        {selected?.depositAmount && Number(selected.depositAmount) > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            보증금 별도: ₩{Math.round(Number(selected.depositAmount)).toLocaleString("ko-KR")}
          </div>
        )}
      </section>

      <Button size="lg" className="h-12" onClick={handleSubmit}>
        카트에 임대 추가
      </Button>
    </div>
  );
}
