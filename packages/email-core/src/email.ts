export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function emailHtml(data: {
  brand: string;
  title: string;
  subtitle: string;
  cta: string;
  color: string;
  url: string;
}) {
  const safe = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, escapeHtml(value)]),
  );
  const color = /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : "#6654c0";
  const url = /^https?:\/\//i.test(data.url) ? safe.url : "#";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe.brand}</title></head><body style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;max-width:600px;margin:auto;background:#ffffff;border-collapse:collapse"><tr><td style="padding:48px 32px;text-align:center"><p style="font-size:20px;font-weight:bold;color:${color}">${safe.brand}</p><h1 style="font-size:36px;line-height:1.2;color:#252525;white-space:pre-line">${safe.title}</h1><p style="font-size:16px;line-height:1.8;color:#666">${safe.subtitle}</p><p style="padding:24px"><a href="${url}" style="display:inline-block;padding:16px 24px;background:${color};color:#fff;text-decoration:none;border-radius:6px">${safe.cta}</a></p><p style="font-size:12px;color:#777">Sent with care by ${safe.brand}.</p></td></tr></table></body></html>`;
}

import type { Block, Document } from "./workspace.js";
export function safeUrl(value: string, image = false) {
  if (
    image &&
    /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)
  )
    return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}
const hex = (value: string, fallback = "#ffffff") =>
  /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const num = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
export function blockHtml(b: Block) {
  const text = escapeHtml(b.text).replace(/\n/g, "<br>");
  const url = escapeHtml(safeUrl(b.url) || "#");
  const font = [
    "Arial",
    "Georgia",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
  ].includes(b.font)
    ? b.font
    : "Arial";
  const align = ["left", "center", "right"].includes(b.align)
    ? b.align
    : "left";
  const style = `font-family:${font},sans-serif;font-size:${num(b.size, 8, 72)}px;font-weight:${num(b.weight, 100, 900)};line-height:${num(b.lineHeight, 1, 3)};color:${hex(b.color, "#30283c")};text-align:${align};overflow-wrap:anywhere;`;
  const img = safeUrl(b.src, true);
  const image = img
    ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(b.alt)}" width="${Math.round((560 * num(b.width, 10, 100)) / 100)}" style="display:block;width:${num(b.width, 10, 100)}%;max-width:100%;height:auto;margin:${align === "center" ? "auto" : align === "right" ? "0 0 0 auto" : "0"};border-radius:${num(b.radius, 0, 50)}px">`
    : `<p style="margin:0;color:#766b7e">${escapeHtml(b.alt)}</p>`;
  let content = `<p style="margin:0;${style}">${text}</p>`;
  if (b.kind === "Heading")
    content = `<h1 style="margin:0;${style}">${text}</h1>`;
  if (b.kind === "Button")
    content = `<a href="${url}" style="display:inline-block;text-decoration:none;${style}background:${hex(b.background, "#6e56ae")};padding:${num(b.gap, 0, 64)}px ${num(b.gap, 0, 64) + 8}px;border-radius:${num(b.radius, 0, 50)}px">${text}</a>`;
  if (b.kind === "Image" || (b.kind === "Logo" && img))
    content = `<a href="${url}">${image}</a>`;
  if (b.kind === "Divider")
    content = `<div style="border-top:${Math.max(1, num(b.border, 0, 10))}px solid ${hex(b.color, "#dddddd")};font-size:0">&nbsp;</div>`;
  if (b.kind === "Spacer") content = "&nbsp;";
  if (b.kind === "Two columns" || b.kind === "Three columns")
    content = `<table role="presentation" width="100%" style="border-collapse:collapse;table-layout:fixed"><tr>${b.columns
      .slice(0, b.kind === "Two columns" ? 2 : 3)
      .map(
        (c) =>
          `<td class="email-column" width="${b.kind === "Two columns" ? 50 : 33}%" style="${style}vertical-align:top;padding:${num(b.gap, 0, 64)}px">${escapeHtml(c).replace(/\n/g, "<br>")}</td>`,
      )
      .join("")}</tr></table>`;
  if (b.kind === "Social links")
    content =
      b.text
        .split("\n")
        .filter(Boolean)
        .map((link) =>
          safeUrl(link)
            ? `<a href="${escapeHtml(safeUrl(link))}" style="${style}display:inline-block;margin:4px 8px">${escapeHtml(new URL(link).hostname)}</a>`
            : "",
        )
        .join("") || `<p style="${style}">Add your social profile URLs</p>`;
  if (b.kind === "Product")
    content = `${img ? image : ""}<p style="margin:${num(b.gap, 0, 64)}px 0;${style}">${text}</p><a href="${url}" style="${style}">View product →</a>`;
  const spacing =
    !["Button", "Two columns", "Three columns", "Product"].includes(b.kind) &&
    b.gap > 0
      ? `<tr><td height="${num(b.gap, 0, 64)}" style="height:${num(b.gap, 0, 64)}px;font-size:0;line-height:0">&nbsp;</td></tr>`
      : "";
  return `<table role="presentation" width="100%" style="border-collapse:separate;border-spacing:0;table-layout:fixed"><tr><td style="${style}border-radius:${num(b.radius, 0, 50)}px;padding:${num(b.padding, 0, 80)}px;background:${b.kind === "Button" ? "#ffffff" : hex(b.background)};border:${num(b.border, 0, 10)}px solid ${hex(b.color, "#dddddd")}">${content}</td></tr>${spacing}</table>`;
}
export function documentHtml(doc: Document) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.name)}</title><style>@media(max-width:480px){.email-column{display:block!important;width:auto!important}.email-wrap{width:100%!important}}</style></head><body style="margin:0;padding:24px 0;background:${hex(doc.background, "#f3f1f5")}"><table role="presentation" width="100%" style="border-collapse:collapse"><tr><td align="center"><table class="email-wrap" role="presentation" width="${num(doc.width, 320, 800)}" style="width:100%;max-width:${num(doc.width, 320, 800)}px;background:#ffffff;border-collapse:collapse"><tr><td>${doc.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(doc.preheader)}</div>` : ""}${doc.blocks.map(blockHtml).join("")}</td></tr></table></td></tr></table></body></html>`;
}
