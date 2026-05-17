"use client";

import { Download } from "lucide-react";
import { JmButton } from "@/jm";

export interface CsvData {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}

function escapeCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 테이블 데이터를 CSV 로 즉시 다운로드. Excel 한글 깨짐 방지용 BOM 포함. */
export function CsvButton({ filename, headers, rows }: CsvData) {
  const handleDownload = () => {
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <JmButton
      variant="ghost"
      size="xs"
      onClick={handleDownload}
      disabled={rows.length === 0}
      className="gap-1"
    >
      <Download className="size-3" />
      CSV
    </JmButton>
  );
}
