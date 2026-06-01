"use client";

import { toast } from "sonner";

import { JmImageEditor, type JmImageEditorProps } from "@/jm";

type Props = Omit<JmImageEditorProps, "onRemoveBackground" | "onError">;

/**
 * 프로젝트용 래퍼 — 순수 편집 UI 는 전부 JmImageEditor(src/jm) 로 이전됨.
 * 여기선 호스트 전용 의존성만 주입한다:
 * - AI 배경 제거: @imgly/background-removal (무거운 ML 패키지 → jm 밖에 유지, 동적 import)
 * - 에러 알림: sonner toast
 */
export function ImageEditDialog(props: Props) {
  return (
    <JmImageEditor
      {...props}
      onError={(msg) => toast.error(msg)}
      onRemoveBackground={async (input) => {
        const { removeBackground } = await import("@imgly/background-removal");
        return removeBackground(input);
      }}
    />
  );
}
