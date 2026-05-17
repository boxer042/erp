"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  JmDateRangePicker,
  JmSegmentedControl,
  type DateRange,
} from "@/jm";
import { formatYmd, type DashboardPeriod } from "./_helpers";

const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "this-week", label: "이번 주" },
  { value: "this-month", label: "이번 달" },
  { value: "last-month", label: "지난 달" },
  { value: "custom", label: "지정" },
];

export function PeriodToggle({
  value,
  customFrom,
  customTo,
}: {
  value: DashboardPeriod;
  customFrom?: string;
  customTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    return undefined;
  });

  const navigate = (newPeriod: DashboardPeriod, newRange?: DateRange) => {
    const params = new URLSearchParams(searchParams);
    if (newPeriod === "this-month") {
      params.delete("period");
    } else {
      params.set("period", newPeriod);
    }
    if (newPeriod === "custom" && newRange?.from && newRange.to) {
      params.set("from", formatYmd(newRange.from));
      params.set("to", formatYmd(newRange.to));
    } else {
      params.delete("from");
      params.delete("to");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <JmSegmentedControl
        size="sm"
        value={value}
        onChange={(v) => navigate(v, range)}
        options={OPTIONS}
      />
      {value === "custom" && (
        <JmDateRangePicker
          size="sm"
          value={range}
          numberOfMonths={2}
          onChange={(r) => {
            setRange(r);
            if (r?.from && r.to) navigate("custom", r);
          }}
        />
      )}
    </div>
  );
}
