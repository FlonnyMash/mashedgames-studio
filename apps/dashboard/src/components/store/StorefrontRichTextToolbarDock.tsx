"use client";

import type { Editor } from "@tiptap/core";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RichTextToolbar } from "@/components/ui/RichTextToolbar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "storefront-rich-text-toolbar-position";
const DEFAULT_LEFT = 12;
const PANEL_WIDTH = 224;

type Point = { x: number; y: number };

function readStoredPosition(): Point | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Point;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return null;
}

function computeCenteredLeftPosition(panelHeight: number): Point {
  return clampPosition(
    DEFAULT_LEFT,
    (window.innerHeight - panelHeight) / 2,
    panelHeight,
  );
}

function estimateInitialPosition(): Point {
  if (typeof window === "undefined") {
    return { x: DEFAULT_LEFT, y: 96 };
  }
  return computeCenteredLeftPosition(420);
}

function clampPosition(x: number, y: number, panelHeight: number): Point {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - PANEL_WIDTH - margin);
  const maxY = Math.max(margin, window.innerHeight - panelHeight - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

export function StorefrontRichTextToolbarDock({
  editor,
  fieldLabel,
  visible = true,
  className,
}: {
  editor: Editor | null;
  fieldLabel?: string;
  visible?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Point>(estimateInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const hasStoredPositionRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
    const stored = readStoredPosition();
    hasStoredPositionRef.current = stored !== null;
    if (stored) {
      setPosition(stored);
    }
  }, []);

  useLayoutEffect(() => {
    if (!mounted || !visible || !editor || hasStoredPositionRef.current) return;

    const panel = panelRef.current;
    if (!panel) return;

    const height = panel.getBoundingClientRect().height;
    setPosition(computeCenteredLeftPosition(height));
  }, [mounted, visible, editor, fieldLabel]);

  const persistPosition = useCallback((next: Point) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, []);

  const finishDrag = useCallback(
    (pointerId: number) => {
      const panel = panelRef.current;
      if (!panel) return;

      dragRef.current = null;
      setIsDragging(false);
      panel.releasePointerCapture(pointerId);

      const height = panel.getBoundingClientRect().height;
      setPosition((current) => {
        const clamped = clampPosition(current.x, current.y, height);
        persistPosition(clamped);
        hasStoredPositionRef.current = true;
        return clamped;
      });
    },
    [persistPosition],
  );

  useEffect(() => {
    if (!mounted) return;

    const onResize = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const height = panel.getBoundingClientRect().height;
      setPosition((current) => {
        if (!hasStoredPositionRef.current) {
          return computeCenteredLeftPosition(height);
        }
        return clampPosition(current.x, current.y, height);
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted]);

  const onDragHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    setIsDragging(true);
  };

  const onDragHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    const panel = panelRef.current;
    const height = panel?.getBoundingClientRect().height ?? 420;
    const next = clampPosition(
      drag.originX + (event.clientX - drag.startX),
      drag.originY + (event.clientY - drag.startY),
      height,
    );
    setPosition(next);
  };

  const onDragHandlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    finishDrag(event.pointerId);
  };

  const onDragHandlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    finishDrag(event.pointerId);
  };

  if (!mounted || !visible || !editor) {
    return null;
  }

  return createPortal(
    <aside
      ref={panelRef}
      style={{ left: position.x, top: position.y }}
      className={cn(
        "fixed z-[100] w-[14rem] max-h-[calc(100dvh-2rem)] overflow-x-visible overflow-y-auto rounded-xl border border-zinc-700/80 bg-zinc-950/95 px-3 py-3 shadow-2xl backdrop-blur-md",
        isDragging && "select-none ring-2 ring-white/20",
        className,
      )}
      aria-label="Text formatting"
    >
      <div
        role="toolbar"
        aria-label="Toolbar verschieben"
        onPointerDown={onDragHandlePointerDown}
        onPointerMove={onDragHandlePointerMove}
        onPointerUp={onDragHandlePointerUp}
        onPointerCancel={onDragHandlePointerCancel}
        className={cn(
          "-mx-1 -mt-1 mb-3 flex cursor-grab items-start gap-1.5 rounded-t-lg border-b border-zinc-800 px-1 pb-2 pt-1 active:cursor-grabbing",
          isDragging && "cursor-grabbing",
        )}
      >
        <GripVertical
          className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {fieldLabel ? "Editing" : "Formatting"}
          </p>
          {fieldLabel ? (
            <p className="truncate text-xs font-medium text-zinc-200">{fieldLabel}</p>
          ) : (
            <p className="text-[10px] text-zinc-600">Drag to reposition</p>
          )}
        </div>
      </div>

      <RichTextToolbar editor={editor} variant="dark" layout="vertical" />
    </aside>,
    document.body,
  );
}
