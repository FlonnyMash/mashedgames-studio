import TurndownService from "turndown";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

turndown.addRule("strikethrough", {
  filter: ["del", "s", "strike"],
  replacement: (content) => `~~${content}~~`,
});

export function markdownToHtml(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return "";
  const parsed = marked.parse(trimmed, { async: false });
  return typeof parsed === "string" ? parsed : "";
}

export function htmlToMarkdown(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<p></p>") return "";
  return turndown.turndown(trimmed).trim();
}

export { turndown };
