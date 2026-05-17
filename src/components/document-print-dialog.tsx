"use client";

import {
  JmButton,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
} from "@/jm";
import { FileDown, Printer } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 인쇄 페이지 path. 예: `/quotations/<id>/print`, `/statements/<id>/print` */
  printPath: string | null;
  /** 다이얼로그 헤더 라벨. 예: "견적서 — QUO260501-0001" */
  title: string;
};

/**
 * 견적서·거래명세표 등 PDF 인쇄 페이지를 새 탭이 아닌 모달로 띄우는 공용 다이얼로그.
 * iframe으로 기존 `/[id]/print` 라우트를 그대로 임베드 (PDFViewer 툴바·다운로드 그대로 사용).
 * 헤더 우측에 [PDF 다운로드] 버튼은 동일 path에 ?auto=1 붙여 새 탭 (다운로드 강제)으로 연다.
 */
export function DocumentPrintDialog({ open, onOpenChange, printPath, title }: Props) {
  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent
        size="xl"
        className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]! flex-col gap-0 p-0"
      >
        <JmDialogHeader className="flex flex-row items-center justify-between border-b border-[var(--jm-border)] px-4 py-3 space-y-0">
          <JmDialogTitle className="text-jm-base">{title}</JmDialogTitle>
          <div className="flex items-center gap-2 mr-8">
            <JmButton
              variant="outline"
              size="sm"
              disabled={!printPath}
              onClick={() => {
                if (!printPath) return;
                const url = `${printPath}${printPath.includes("?") ? "&" : "?"}auto=1`;
                window.open(url, "_blank");
              }}
            >
              <FileDown className="size-3.5" />
              <span>PDF 다운로드</span>
            </JmButton>
            <JmButton
              size="sm"
              variant="cta"
              disabled={!printPath}
              onClick={() => {
                // 모달 안 iframe에 인쇄 명령 — react-pdf의 <PDFViewer>는 자체 인쇄 버튼 제공이라
                // 가장 안정적인 건 새 탭에서 print 다이얼로그 띄우는 것.
                if (!printPath) return;
                window.open(`${printPath}`, "_blank");
              }}
            >
              <Printer className="size-3.5" />
              <span>새 탭에서 인쇄</span>
            </JmButton>
          </div>
        </JmDialogHeader>
        {printPath ? (
          <iframe
            key={printPath}
            src={printPath}
            className="size-full flex-1 border-0"
            title={title}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-jm-sm text-[var(--jm-text-muted)]">
            로드할 문서가 없습니다
          </div>
        )}
      </JmDialogContent>
    </JmDialog>
  );
}
