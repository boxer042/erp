/**
 * Landing block 트리를 외부 채널 (쿠팡/네이버 등) 에 복붙 가능한 형태로 export.
 *
 * - HTML: 표준 HTML 마크업, 인라인 스타일 + 외부 이미지 URL. 대부분 쇼핑몰 에디터에 그대로 paste 가능
 * - Markdown: plain markdown — 텍스트만 가져갈 때
 *
 * 한계:
 * - 모션 블록(scrolly-hero / sticky-feature / parallax) → 정적 이미지+텍스트로 다운그레이드
 * - ambient-video / video → 비디오 URL 만 표시
 * - chart / spec-table → 빈 placeholder
 * - html-embed → URL 안내문 (격리된 iframe 콘텐츠는 인라인 불가)
 */

import type { LandingBlock } from "./validators/landing-block";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** 인라인 마크다운 (**굵게**, *기울임*, [링크](url)) → HTML */
function inlineMdToHtml(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, t, url) =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${t}</a>`,
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  return s.replace(/\n/g, "<br>");
}

/** 외부 export 용 인라인 색상 (callout / notice) */
function calloutInlineColors(variant: "warning" | "info" | "success" | "danger" | "neutral"): {
  bar: string;
  bg: string;
} {
  switch (variant) {
    case "warning":
      return { bar: "#f5a623", bg: "rgba(245,166,35,0.08)" };
    case "info":
      return { bar: "#3ecf8e", bg: "rgba(62,207,142,0.06)" };
    case "success":
      return { bar: "#3ecf8e", bg: "rgba(62,207,142,0.10)" };
    case "danger":
      return { bar: "#ef4444", bg: "rgba(239,68,68,0.08)" };
    case "neutral":
      return { bar: "#888", bg: "#f5f5f7" };
  }
}

export function blocksToHtml(blocks: LandingBlock[]): string {
  return blocks.map((b) => blockToHtml(b)).filter(Boolean).join("\n\n");
}

function blockToHtml(block: LandingBlock): string {
  switch (block.type) {
    case "hero":
    case "scrolly-hero":
    case "parallax": {
      const bg = "imageUrl" in block && block.imageUrl ? block.imageUrl : "";
      const headline = block.headline ?? "";
      const sub = block.subheadline ?? "";
      const eyebrow = "eyebrow" in block ? (block.eyebrow ?? "") : "";
      const align = "textAlign" in block ? block.textAlign : "center";
      const dark = "textColor" in block && block.textColor === "dark";
      const styleBg = bg
        ? `background:#000 url(${escapeHtml(bg)}) center/cover no-repeat;`
        : "background:#f4f4f5;";
      const color = dark ? "#1d1d1f" : "#fff";
      const textShadow = !dark ? "text-shadow:0 1px 3px rgba(0,0,0,0.4);" : "";
      return `<div style="position:relative;${styleBg}min-height:420px;display:flex;align-items:center;padding:64px 32px;color:${color};${textShadow}text-align:${align};">
  <div style="max-width:960px;margin:0 auto;width:100%;">
    ${eyebrow ? `<div style="font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;opacity:0.8;margin-bottom:12px;">${escapeHtml(eyebrow)}</div>` : ""}
    ${headline ? `<h2 style="font-size:48px;font-weight:700;line-height:1.1;margin:0 0 16px;">${escapeHtml(headline)}</h2>` : ""}
    ${sub ? `<p style="font-size:18px;line-height:1.5;opacity:0.9;margin:0;">${escapeHtml(sub)}</p>` : ""}
  </div>
</div>`;
    }
    case "image": {
      if (!block.imageUrl) return "";
      const maxW =
        block.maxWidth === "lg"
          ? 960
          : block.maxWidth === "md"
            ? 768
            : block.maxWidth === "sm"
              ? 560
              : null;
      const wrapStyle = maxW ? `max-width:${maxW}px;margin:0 auto;` : "";
      return `<figure style="${wrapStyle}padding:24px 0;">
  <img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;height:auto;" />
  ${block.caption ? `<figcaption style="text-align:center;font-size:14px;color:#666;margin-top:8px;">${escapeHtml(block.caption)}</figcaption>` : ""}
</figure>`;
    }
    case "text": {
      const align = block.align ?? "left";
      const bg =
        block.background === "muted"
          ? "background:#f5f5f7;"
          : block.background === "dark"
            ? "background:#1d1d1f;color:#fff;"
            : "";
      return `<section style="${bg}padding:64px 32px;">
  <div style="max-width:768px;margin:0 auto;text-align:${align};">
    ${block.eyebrow ? `<div style="font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#666;margin-bottom:16px;">${escapeHtml(block.eyebrow)}</div>` : ""}
    ${block.heading ? `<h3 style="font-size:32px;font-weight:600;line-height:1.2;margin:0 0 16px;">${escapeHtml(block.heading)}</h3>` : ""}
    ${block.body ? `<p style="font-size:16px;line-height:1.6;margin:0;">${inlineMdToHtml(block.body)}</p>` : ""}
  </div>
</section>`;
    }
    case "gallery": {
      const items = block.images.filter((i) => i.url);
      if (items.length === 0) return "";
      return `<section style="padding:24px 16px;">
  <div style="display:grid;grid-template-columns:repeat(${block.columns},1fr);gap:8px;">
    ${items
      .map(
        (img) =>
          `<img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}" style="display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;" />`,
      )
      .join("\n    ")}
  </div>
</section>`;
    }
    case "video":
    case "ambient-video": {
      const url = block.type === "video" ? block.value : block.videoUrl;
      if (!url) return "";
      return `<div style="padding:24px 0;text-align:center;">
  <p style="margin:0 0 8px;font-size:14px;color:#666;">▶︎ 영상 보기</p>
  <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener" style="font-size:14px;">${escapeHtml(url)}</a>
</div>`;
    }
    case "sticky-feature": {
      const heading = block.heading ?? "";
      const body = block.body ?? "";
      const panels = block.panels.filter((p) => p.imageUrl);
      return `<section style="padding:48px 32px;">
  <div style="max-width:1200px;margin:0 auto;">
    ${heading ? `<h3 style="font-size:28px;font-weight:600;margin:0 0 16px;">${escapeHtml(heading)}</h3>` : ""}
    ${body ? `<p style="font-size:16px;line-height:1.6;margin:0 0 32px;color:#666;">${escapeHtml(body)}</p>` : ""}
    ${panels
      .map(
        (p) =>
          `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.alt)}" style="display:block;width:100%;height:auto;margin-bottom:16px;border-radius:8px;" />`,
      )
      .join("\n    ")}
  </div>
</section>`;
    }
    case "table": {
      const headers = block.headers;
      const rows = block.rows;
      if (rows.length === 0) return "";
      return `<section style="padding:48px 32px;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr>${headers.map((h) => `<th style="text-align:left;padding:12px;background:#f5f5f7;border-bottom:2px solid #ddd;">${escapeHtml(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${headers.map((_, c) => `<td style="padding:12px;border-bottom:1px solid #eee;">${escapeHtml(r[c] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>
  ${block.caption ? `<div style="text-align:center;font-size:12px;color:#666;margin-top:8px;">${escapeHtml(block.caption)}</div>` : ""}
</section>`;
    }
    case "stats-grid": {
      const items = block.items.filter((it) => it.value || it.label);
      if (items.length === 0 && !block.heading) return "";
      const bg =
        block.background === "muted"
          ? "background:#f5f5f7;"
          : block.background === "dark"
            ? "background:#1d1d1f;color:#fff;"
            : "";
      const align = block.align ?? "left";
      return `<section style="${bg}padding:80px 32px;">
  <div style="max-width:1200px;margin:0 auto;">
    <div style="text-align:${align};margin-bottom:48px;">
      ${block.eyebrow ? `<div style="font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;opacity:0.7;margin-bottom:16px;">${escapeHtml(block.eyebrow)}</div>` : ""}
      ${block.heading ? `<h3 style="font-size:48px;font-weight:700;line-height:1.1;margin:0 0 16px;white-space:pre-line;">${escapeHtml(block.heading)}</h3>` : ""}
      ${block.body ? `<p style="font-size:18px;line-height:1.5;opacity:0.8;margin:0;">${escapeHtml(block.body)}</p>` : ""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(${block.columns},1fr);border-top:1px solid #ccc;padding-top:32px;">
      ${items
        .map(
          (it, i) => `<div style="padding:0 24px;${block.dividers && (i + 1) % block.columns !== 0 && i !== items.length - 1 ? "border-right:1px solid #ccc;" : ""}">
        <div style="margin-bottom:8px;">
          <span style="font-size:48px;font-weight:700;line-height:1;">${escapeHtml(it.value || "—")}</span>
          ${it.unit ? `<span style="font-size:18px;font-weight:500;opacity:0.7;margin-left:4px;">${escapeHtml(it.unit)}</span>` : ""}
        </div>
        <div style="font-size:13px;opacity:0.7;">${escapeHtml(it.label)}</div>
      </div>`,
        )
        .join("\n      ")}
    </div>
  </div>
</section>`;
    }
    case "chart":
      return `<div style="padding:48px;text-align:center;background:#f5f5f7;color:#666;">[차트] 외부 채널 export 시에는 별도 스크린샷으로 대체하세요.</div>`;
    case "spec-table":
      return `<div style="padding:48px;text-align:center;background:#f5f5f7;color:#666;">[자동 스펙표] 상품 상세에서 확인 가능합니다.</div>`;
    case "callout": {
      const colors = calloutInlineColors(block.variant);
      return `<div style="padding:24px 32px;">
  <div style="border-left:3px solid ${colors.bar};background:${colors.bg};padding:16px 20px;font-size:14px;line-height:1.7;color:#444;">
    ${block.label ? `<strong style="color:${colors.bar};font-weight:700;letter-spacing:0.04em;margin-right:6px;">${escapeHtml(block.label)}</strong>` : ""}${inlineMdToHtml(block.body)}
  </div>
</div>`;
    }
    case "info-grid": {
      const bg = block.background === "muted" ? "background:#f1f1ec;" : "";
      return `<section style="${bg}padding:80px 32px;">
  <div style="max-width:1200px;margin:0 auto;">
    ${block.sections
      .map((sec, i) => {
        const isLast = i === block.sections.length - 1;
        return `<div style="display:grid;grid-template-columns:260px 1fr;gap:48px;padding:32px 0;border-top:1px solid #d8d8d2;${isLast ? "border-bottom:1px solid #d8d8d2;" : ""}">
      <div>
        ${sec.number ? `<div style="font-size:11px;letter-spacing:0.25em;color:#999;font-weight:600;margin-bottom:8px;">${escapeHtml(sec.number)}</div>` : ""}
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(sec.title)}</div>
      </div>
      <div style="font-size:14px;line-height:1.85;color:#444;">
        ${sec.rows.length > 0 ? `<dl style="display:grid;grid-template-columns:110px 1fr;gap:12px 24px;margin:0;">${sec.rows.map((r) => `<dt style="color:#888;font-weight:500;">${escapeHtml(r.key)}</dt><dd style="color:#1a1a1a;font-weight:500;margin:0;">${inlineMdToHtml(r.value)}</dd>`).join("")}</dl>` : ""}
        ${sec.bullets.length > 0 ? `<ul style="margin-top:16px;padding:0;list-style:none;">${sec.bullets.map((b) => `<li style="position:relative;padding-left:14px;margin-bottom:6px;">${inlineMdToHtml(b)}</li>`).join("")}</ul>` : ""}
        ${
          sec.notice
            ? (() => {
                const c = calloutInlineColors(sec.notice.variant);
                return `<div style="margin-top:16px;padding:16px 18px;background:#fafaf8;font-size:13px;color:#666;border-left:2px solid ${c.bar};line-height:1.7;">
          ${sec.notice.label ? `<strong style="color:${c.bar};font-weight:700;letter-spacing:0.04em;margin-right:6px;">${escapeHtml(sec.notice.label)}</strong>` : ""}${inlineMdToHtml(sec.notice.body)}
        </div>`;
              })()
            : ""
        }
      </div>
    </div>`;
      })
      .join("")}
  </div>
</section>`;
    }
    case "product-hero":
      // Product 데이터 동적 매핑은 export 시 placeholder
      return `<div style="padding:48px;text-align:center;background:#f5f5f7;color:#666;">[상품 메인 (PDP Hero)] 자동 생성 영역 — 이미지/상품명/가격/CTA 가 Product 데이터에서 매핑됩니다</div>`;
    case "product-info":
      // Product 데이터 동적 매핑은 export 시에는 placeholder 로 (서버에서 Product fetch 별도 처리 필요)
      return `<div style="padding:48px;text-align:center;background:#f5f5f7;color:#666;">[상품정보 고시 — ${escapeHtml(block.title)}] 자동 생성 영역 (Product 데이터에서 매핑됨)</div>`;
    case "html-embed":
      return block.htmlUrl
        ? `<div style="padding:24px;text-align:center;"><a href="${escapeHtml(block.htmlUrl)}" target="_blank" rel="noreferrer noopener">커스텀 콘텐츠 보기 →</a></div>`
        : "";
  }
}

export function blocksToMarkdown(blocks: LandingBlock[]): string {
  return blocks.map((b) => blockToMarkdown(b)).filter(Boolean).join("\n\n");
}

function blockToMarkdown(block: LandingBlock): string {
  switch (block.type) {
    case "hero":
    case "scrolly-hero":
    case "parallax": {
      const eyebrow = "eyebrow" in block ? block.eyebrow : "";
      const lines: string[] = [];
      if (eyebrow) lines.push(`> **${eyebrow.toUpperCase()}**`);
      if (block.headline) lines.push(`# ${block.headline}`);
      if (block.subheadline) lines.push(block.subheadline);
      if ("imageUrl" in block && block.imageUrl) lines.push(`![](${block.imageUrl})`);
      return lines.join("\n\n");
    }
    case "image":
      return block.imageUrl
        ? `![${block.alt || ""}](${block.imageUrl})${block.caption ? `\n\n*${block.caption}*` : ""}`
        : "";
    case "text": {
      const lines: string[] = [];
      if (block.eyebrow) lines.push(`> **${block.eyebrow.toUpperCase()}**`);
      if (block.heading) lines.push(`## ${block.heading}`);
      if (block.body) lines.push(block.body);
      return lines.join("\n\n");
    }
    case "gallery": {
      const items = block.images.filter((i) => i.url);
      return items.map((img) => `![${img.alt || ""}](${img.url})`).join("\n");
    }
    case "video":
    case "ambient-video": {
      const url = block.type === "video" ? block.value : block.videoUrl;
      return url ? `[▶︎ 영상 보기](${url})` : "";
    }
    case "sticky-feature": {
      const lines: string[] = [];
      if (block.heading) lines.push(`## ${block.heading}`);
      if (block.body) lines.push(block.body);
      for (const p of block.panels.filter((p) => p.imageUrl)) {
        lines.push(`![${p.alt || ""}](${p.imageUrl})`);
      }
      return lines.join("\n\n");
    }
    case "table": {
      if (block.rows.length === 0) return "";
      const sep = block.headers.map(() => "---").join(" | ");
      const head = block.headers.join(" | ");
      const body = block.rows
        .map((r) => block.headers.map((_, c) => r[c] ?? "").join(" | "))
        .join("\n");
      return `${block.caption ? `*${block.caption}*\n\n` : ""}${head}\n${sep}\n${body}`;
    }
    case "stats-grid": {
      const lines: string[] = [];
      if (block.eyebrow) lines.push(`> **${block.eyebrow.toUpperCase()}**`);
      if (block.heading) lines.push(`## ${block.heading.replace(/\n/g, " ")}`);
      if (block.body) lines.push(block.body);
      const items = block.items.filter((it) => it.value || it.label);
      if (items.length > 0) {
        lines.push(
          items
            .map((it) => `- **${it.value}${it.unit ? it.unit : ""}** — ${it.label}`)
            .join("\n"),
        );
      }
      return lines.join("\n\n");
    }
    case "chart":
      return `_[차트는 별도 스크린샷으로 대체하세요]_`;
    case "spec-table":
      return `_[상품 자동 스펙표]_`;
    case "callout": {
      const prefix = block.label ? `**${block.label}**: ` : "";
      return `> ${prefix}${block.body}`;
    }
    case "info-grid": {
      const out: string[] = [];
      for (const sec of block.sections) {
        out.push(`### ${sec.number ? `${sec.number} ` : ""}${sec.title}`);
        for (const r of sec.rows) {
          out.push(`- **${r.key}**: ${r.value}`);
        }
        if (sec.bullets.length > 0) {
          out.push(...sec.bullets.map((b) => `- ${b}`));
        }
        if (sec.notice) {
          out.push(`> **${sec.notice.label}**: ${sec.notice.body}`);
        }
      }
      return out.join("\n\n");
    }
    case "product-hero":
      return `_[상품 메인 — Product 자동 매핑 영역]_`;
    case "product-info":
      return `_[${block.title} — Product 자동 매핑 영역]_`;
    case "html-embed":
      return block.htmlUrl ? `[커스텀 콘텐츠 보기 →](${block.htmlUrl})` : "";
  }
}
