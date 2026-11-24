import type { Document } from "./workspace.js";
import { safeUrl, documentHtml } from "./email.js";
/** Reserved documentation domains (example.com/.net/.org, *.example) are placeholders, never real destinations. */
export function isPlaceholderUrl(value: string) {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase();
    return /(^|\.)example\.(com|net|org)$/.test(host) || host.endsWith(".example") || host === "example";
  } catch {
    return false;
  }
}
export function emailChecks(document: Document) {
  const warnings: string[] = [];
  if (!document.subject?.trim()) warnings.push("Add a subject before sending.");
  if (!document.preheader?.trim()) warnings.push("Add preview text for the inbox.");
  for (const [index, block] of document.blocks.entries()) {
    const label = `Block ${index + 1}`;
    if (["Image", "Logo", "Product"].includes(block.kind) && block.src) {
      if (!block.alt.trim()) warnings.push(`${label}: add image alt text.`);
      if (block.src.startsWith("data:")) warnings.push(`${label}: embedded images may not display in some email clients.`);
      else if (!block.src.startsWith("https://")) warnings.push(`${label}: use an HTTPS image URL.`);
    }
    if (["Button", "Image", "Logo", "Product"].includes(block.kind)) {
      if (!safeUrl(block.url)) warnings.push(`${label}: add a valid destination URL.`);
      else if (isPlaceholderUrl(block.url)) warnings.push(`${label}: replace the placeholder link (${new URL(block.url).hostname}) with your own URL.`);
    }
    if (block.kind === "Social links" && block.text.split("\n").some(line => line.trim() && isPlaceholderUrl(line))) warnings.push(`${label}: replace placeholder social links with your profiles.`);
  }
  if (new TextEncoder().encode(documentHtml(document)).length > 100000) warnings.push("HTML exceeds 100 KB and may be clipped by email clients.");
  return warnings;
}
export function plainText(document: Document) {
  return [document.subject || document.name, ...document.blocks.map(block => {
    if (["Divider", "Spacer"].includes(block.kind)) return "";
    if (["Two columns", "Three columns"].includes(block.kind)) return block.columns.join("\n\n");
    const text = ["Image", "Logo"].includes(block.kind) && block.src ? block.alt : block.text;
    return text + (["Button", "Product", "Image", "Logo"].includes(block.kind) && safeUrl(block.url) ? `\n${block.url}` : "");
  })].filter(Boolean).join("\n\n");
}
