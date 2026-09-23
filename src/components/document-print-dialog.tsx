"use client";

import { useRef, useState } from "react";
import {
  JmButton,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmSwitch,
} from "@/jm";
import { FileDown } from "lucide-react";

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
 * 헤더 우측 [PDF 다운로드] 는 동일 path 에 ?auto=1 을 붙여 새 탭에서 다운로드한다.
 * 인쇄는 모달 안 PDFViewer 의 자체 인쇄 버튼을 쓴다 (버튼 중복 제거).
 *
 * "공급가액만" 토글 — 켜면 세액 컬럼·세액 합계를 빼고 공급가액 기준으로만 출력한다
 * (`?supplyOnly=1` 쿼리 → 인쇄 페이지가 DocumentPdf 에 전달).
 */
export function DocumentPrintDialog({ open, onOpenChange, printPath, title }: Props) {
  const [supplyOnly, setSupplyOnly] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /** printPath 에 supplyOnly / auto / embed 쿼리를 합쳐 최종 URL 생성 */
  const buildPath = (auto?: boolean, embed?: boolean): string | null => {
    if (!printPath) return null;
    const params = new URLSearchParams();
    if (supplyOnly) params.set("supplyOnly", "1");
    if (auto) params.set("auto", "1");
    // 모달 iframe — 인쇄 페이지의 [PDF 생성] 버튼을 숨긴다 (헤더 버튼과 중복)
    if (embed) params.set("embed", "1");
    const qs = params.toString();
    return qs ? `${printPath}?${qs}` : printPath;
  };

  const iframeSrc = buildPath(false, true);

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent
        size="xl"
        className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]! flex-col gap-0 p-0"
      >
        <JmDialogHeader className="flex flex-row items-center justify-between border-b border-[var(--jm-border)] px-4 py-3 space-y-0">
          <JmDialogTitle className="text-jm-base">{title}</JmDialogTitle>
          <div className="flex items-center gap-3 mr-8">
            <label className="flex cursor-pointer items-center gap-2 text-jm-sm text-[var(--jm-text)]">
              <JmSwitch checked={supplyOnly} onCheckedChange={setSupplyOnly} />
              <span>공급가액만 (세액 제외)</span>
            </label>
            <span className="h-5 w-px bg-[var(--jm-border)]" />
            {/* 인쇄는 모달 안 PDF 뷰어의 자체 인쇄 버튼으로 — 여기선 다운로드만 (파일명 지정 경로) */}
            <JmButton
              variant="cta"
              size="sm"
              disabled={!printPath}
              onClick={() => {
                // 새 탭을 열면 다운로드 후 빈 탭이 남는다 — iframe 안에서 직접 생성·저장
                iframeRef.current?.contentWindow?.postMessage(
                  { type: "jm-pdf-download" },
                  window.location.origin,
                );
              }}
            >
              <FileDown className="size-3.5" />
              <span>PDF 다운로드</span>
            </JmButton>
          </div>
        </JmDialogHeader>
        {iframeSrc ? (
          <iframe
            key={iframeSrc}
            ref={iframeRef}
            src={iframeSrc}
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
