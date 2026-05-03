import React from "react";

/**
 * 작은 인라인 마크다운 렌더러.
 * 지원 문법:
 *   **굵게**   → <strong>
 *   *기울임*   → <em>
 *   [링크](url) → <a target="_blank">
 *
 * 줄바꿈은 부모에 `whitespace-pre-wrap` 가 있으면 자동 보존됨 (\n 그대로).
 *
 * 외부 라이브러리 의존 없이 한 번 스캔으로 토큰화 → React 노드 배열 반환.
 */
const INLINE_MD_REGEX =
  /(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)/g;

export function InlineMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  // exec 루프 (regex 의 g 플래그)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const re = new RegExp(INLINE_MD_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // 링크 [text](url)
      const url = match[3];
      const safeUrl = /^(https?:|mailto:|tel:|\/)/i.test(url) ? url : `https://${url}`;
      nodes.push(
        <a
          key={`mdL-${key++}`}
          href={safeUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 hover:opacity-80"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      nodes.push(
        <strong key={`mdB-${key++}`} className="font-semibold">
          {match[5]}
        </strong>,
      );
    } else if (match[6]) {
      nodes.push(
        <em key={`mdI-${key++}`} className="italic">
          {match[7]}
        </em>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return <>{nodes}</>;
}
