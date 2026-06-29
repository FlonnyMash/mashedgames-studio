"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef } from "react";
import { PROSE_DARK, PROSE_LIGHT } from "@/components/ui/MarkdownContent";
import { cn } from "@/lib/utils";
import {
  isEmptyRichHtml,
  normalizeEditorContent,
  normalizeHtmlForCompare,
} from "@/lib/rich-html-content";
import { createStorefrontEditorExtensions } from "@/lib/tiptap/storefront-editor-extensions";

type InlineRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  variant?: "light" | "dark";
  placeholder?: string;
  className?: string;
  editorKey?: string;
  onEditorReady?: (editor: Editor) => void;
  onEditorFocus?: () => void;
};

export function InlineRichTextEditor({
  value,
  onChange,
  variant = "dark",
  placeholder = "Click to add content…",
  className,
  editorKey,
  onEditorReady,
  onEditorFocus,
}: InlineRichTextEditorProps) {
  const skipExternalSyncRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onEditorReadyRef = useRef(onEditorReady);
  onChangeRef.current = onChange;
  onEditorReadyRef.current = onEditorReady;

  const emitContentChange = useCallback((ed: Editor) => {
    skipExternalSyncRef.current = true;
    const html = ed.getHTML();
    onChangeRef.current(isEmptyRichHtml(html) ? "" : html);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createStorefrontEditorExtensions(placeholder),
    content: normalizeEditorContent(value),
    onCreate: ({ editor: ed }) => {
      onEditorReadyRef.current?.(ed);
    },
    editorProps: {
      attributes: {
        class: cn(
          "rich-html-content outline-none min-h-[8rem]",
          variant === "dark" ? PROSE_DARK : PROSE_LIGHT,
        ),
        spellcheck: "false",
      },
      handleDOMEvents: {
        focus: () => {
          onEditorFocus?.();
          return false;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      emitContentChange(ed);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      return;
    }
    const current = normalizeHtmlForCompare(editor.getHTML());
    const incoming = normalizeHtmlForCompare(normalizeEditorContent(value));
    if (current !== incoming) {
      editor.commands.setContent(normalizeEditorContent(value), {
        emitUpdate: false,
      });
    }
  }, [editor, value, editorKey]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      {variant === "dark" ? (
        <div className="py-2 sm:py-4">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-white ring-1 ring-zinc-200 backdrop-blur-sm transition-shadow focus-within:ring-zinc-400">
          <div className="px-6 py-5 sm:px-8 sm:py-6">
            <EditorContent editor={editor} />
          </div>
        </div>
      )}
    </div>
  );
}
