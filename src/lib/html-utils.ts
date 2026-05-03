/** 다양한 인코딩(UTF-8 BOM, UTF-16, EUC-KR 등)을 자동 감지해 UTF-8 문자열로 디코드 */
export function detectAndDecode(bytes: Uint8Array): string {
  // UTF-8 BOM
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }
  // UTF-16 LE BOM (Windows 메모장 "Unicode" 옵션)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2));
  }
  // UTF-16 BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.slice(2));
  }
  // BOM 없음 — UTF-8 strict 시도
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // UTF-8 디코드 실패 → EUC-KR(CP949) 시도 (한국 Notepad ANSI 저장)
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch {
      // 마지막 폴백: lenient UTF-8 (replacement character 포함)
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

/** <meta charset> 또는 <meta http-equiv content-type> 이 없으면 자동 삽입 */
export function ensureCharsetMeta(html: string): string {
  if (
    /<meta\s+charset\s*=/i.test(html) ||
    /<meta\s+http-equiv\s*=\s*["']?content-type["'][^>]*charset/i.test(html)
  ) {
    return html;
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, '<head$1>\n<meta charset="utf-8">');
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html([^>]*)>/i,
      '<html$1>\n<head><meta charset="utf-8"></head>',
    );
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>\n${html}\n</body></html>`;
}

/**
 * 부모 창(에디터/프리뷰)이 iframe 높이를 자동 조절할 수 있도록
 * 콘텐츠의 실제 높이를 postMessage 로 송신하는 작은 스크립트.
 * 모든 업로드 HTML 마지막에 자동 주입됨.
 */
const AUTO_RESIZE_MARKER = "__landing_html_auto_resize__";
const AUTO_RESIZE_SCRIPT = `<script data-auto-resize="${AUTO_RESIZE_MARKER}">
(function(){
  if (window.parent === window) return;
  var lastHeight = 0;
  function send() {
    var doc = document.documentElement;
    var body = document.body;
    var h = Math.max(
      body ? body.scrollHeight : 0,
      doc ? doc.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      doc ? doc.offsetHeight : 0
    );
    if (h !== lastHeight && h > 0) {
      lastHeight = h;
      try { window.parent.postMessage({ type: "landing-html-resize", height: h }, "*"); } catch (e) {}
    }
  }
  function init() {
    send();
    window.addEventListener("resize", send);
    window.addEventListener("load", send);
    document.addEventListener("DOMContentLoaded", send);
    if (window.MutationObserver && document.body) {
      new MutationObserver(send).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    if (window.ResizeObserver && document.body) {
      new ResizeObserver(send).observe(document.body);
    }
    setInterval(send, 1000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
</script>`;

/** 자동 리사이즈 스크립트가 없으면 </body> 직전에 주입 (이미 있으면 그대로) */
function injectAutoResizeScript(html: string): string {
  if (html.includes(AUTO_RESIZE_MARKER)) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${AUTO_RESIZE_SCRIPT}\n</body>`);
  }
  return `${html}\n${AUTO_RESIZE_SCRIPT}`;
}

/** 임의 인코딩의 HTML 바이트를 UTF-8 + meta charset + 자동 리사이즈 스크립트가 주입된 바이트로 변환 */
export function normalizeHtmlBytes(bytes: Uint8Array): Uint8Array {
  const decoded = detectAndDecode(bytes);
  const withCharset = ensureCharsetMeta(decoded);
  const withScript = injectAutoResizeScript(withCharset);
  return new TextEncoder().encode(withScript);
}

/**
 * htmlUrl 에서 storage 경로(`<userId>/<uuid>.html`) 추출.
 * - 프록시 URL: `/api/products/landing-html/<path>`
 * - 직접 Supabase URL: `https://...supabase.co/storage/v1/object/public/product-html/<path>`
 * 어느 쪽도 매치 안 되면 null (외부 URL 등)
 */
export function extractHtmlStoragePath(htmlUrl: string): string | null {
  if (!htmlUrl) return null;
  let m = htmlUrl.match(/^\/api\/products\/landing-html\/(.+)$/);
  if (m) return m[1];
  m = htmlUrl.match(/\/storage\/v1\/object\/public\/product-html\/(.+)$/);
  if (m) return m[1];
  return null;
}

/** blocks 안의 모든 html-embed storage 경로 추출 */
export function extractHtmlStoragePaths(
  blocks: Array<{ type: string; htmlUrl?: string }>,
): string[] {
  const paths: string[] = [];
  for (const b of blocks) {
    if (b.type === "html-embed" && b.htmlUrl) {
      const p = extractHtmlStoragePath(b.htmlUrl);
      if (p) paths.push(p);
    }
  }
  return paths;
}
