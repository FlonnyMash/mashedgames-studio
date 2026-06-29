import DOMPurify from "isomorphic-dompurify";
import { markdownToHtml } from "@/lib/rich-text-markdown";

const ALLOWED_STYLE_PROPS = new Set([
  "font-size",
  "line-height",
  "color",
  "text-align",
  "background-color",
  "font-weight",
  "font-style",
  "text-decoration",
]);

function sanitizeInlineStyle(style: string): string {
  const parts = style
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const safe: string[] = [];
  for (const part of parts) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop) || !value) continue;
    if (/url\s*\(/i.test(value) || /expression\s*\(/i.test(value)) continue;
    safe.push(`${prop}: ${value}`);
  }
  return safe.join("; ");
}

let domPurifyHookRegistered = false;

function ensureDomPurifyHooks() {
  if (domPurifyHookRegistered) return;
  domPurifyHookRegistered = true;

  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName !== "style" || !data.attrValue) return;
    const cleaned = sanitizeInlineStyle(data.attrValue);
    if (cleaned) {
      data.attrValue = cleaned;
    } else {
      data.keepAttr = false;
    }
  });
}

const HTML_TAG_PATTERN =
  /<\/?(?:p|br|h[1-6]|ul|ol|li|strong|b|em|i|u|s|del|strike|span|mark|div)\b/i;

export function isRichHtmlContent(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  if (/^<[a-z!?/]/i.test(trimmed)) return true;
  return HTML_TAG_PATTERN.test(trimmed);
}

/** Normalize legacy Markdown or existing HTML for the TipTap editor. */
export function normalizeEditorContent(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (isRichHtmlContent(trimmed)) return trimmed;
  return markdownToHtml(trimmed);
}

export function isEmptyRichHtml(html: string): boolean {
  const trimmed = html.trim();
  return !trimmed || trimmed === "<p></p>" || trimmed === "<p></p>\n";
}

/** Sanitized HTML for display — accepts legacy Markdown or rich HTML source. */
export function renderRichContentToHtml(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  const html = isRichHtmlContent(trimmed) ? trimmed : markdownToHtml(trimmed);
  return sanitizeRichHtml(html);
}

export function richTextToPlainText(source: string, maxLength?: number): string {
  const trimmed = source.trim();
  if (!trimmed) return "";

  const html = renderRichContentToHtml(trimmed);
  const plain = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (maxLength != null && plain.length > maxLength) {
    return `${plain.slice(0, maxLength).trimEnd()}…`;
  }
  return plain;
}

export function sanitizeRichHtml(html: string): string {
  ensureDomPurifyHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "del",
      "strike",
      "span",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "mark",
    ],
    ALLOWED_ATTR: ["style", "class"],
  });
}

export function normalizeHtmlForCompare(html: string): string {
  return sanitizeRichHtml(html).replace(/\s+/g, " ").trim();
}

/** Compare Markdown or HTML content semantically for dirty-checking. */
export function normalizeRichContentForCompare(source: string): string {
  return normalizeHtmlForCompare(normalizeEditorContent(source));
}
