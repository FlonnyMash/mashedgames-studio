"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef } from "react";

type InlineTitleEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
};

export function InlineTitleEditor({
  value,
  onChange,
  placeholder = "Storefront title",
  className,
  maxLength = 200,
}: InlineTitleEditorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!ref.current || isFocusedRef.current) return;
    if (ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    let next = el.textContent ?? "";
    if (next.length > maxLength) {
      next = next.slice(0, maxLength);
      el.textContent = next;
      const selection = window.getSelection();
      if (selection) {
        selection.selectAllChildren(el);
        selection.collapseToEnd();
      }
    }
    onChange(next);
  }, [maxLength, onChange]);

  return (
    <span
      ref={ref}
      role="textbox"
      aria-label={placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onBlur={() => {
        isFocusedRef.current = false;
        handleInput();
      }}
      onInput={handleInput}
      className={cn(
        "block w-full outline-none ring-0 transition-[box-shadow]",
        "rounded-lg px-2 py-1 focus-visible:ring-2 focus-visible:ring-white/30",
        "empty:before:pointer-events-none empty:before:text-white/35 empty:before:content-[attr(data-placeholder)]",
        className,
      )}
    />
  );
}
