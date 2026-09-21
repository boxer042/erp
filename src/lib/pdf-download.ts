/** 파일명에 쓸 수 없는 문자 치환 (거래처·고객명에 / : 등이 들어가는 경우) */
export function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

/**
 * PDF blob 을 파일명 지정해 내려받는다.
 *
 * `window.open(blobUrl)` / `window.location.href = blobUrl` 로 blob 을 열면
 * URL 에 파일명도 Content-Disposition 도 없어 브라우저 PDF 뷰어가 blob UUID 를
 * 파일명으로 제안한다. 반드시 `<a download>` 로 내려받을 것.
 *
 * @param title 확장자 없는 파일명. 각 PDF 의 `<Document title>` 과 동일하게 맞춘다.
 */
export function downloadPdfBlob(blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileName(title)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
