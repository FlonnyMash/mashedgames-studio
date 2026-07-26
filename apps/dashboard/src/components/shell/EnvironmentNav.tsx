"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useProjectsListStore } from "@/store/useProjectsListStore";
import { useStoreCatalogStore } from "@/store/useStoreCatalogStore";

type IndicatorRect = { left: number; width: number; height: number; top: number };

const tabClass = (active: boolean) =>
  [
    "relative z-10 m-0 box-border flex h-9 shrink-0 appearance-none items-center justify-center rounded-lg border-0 bg-transparent p-0 px-4 text-center text-sm font-medium leading-none no-underline outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900/15 active:bg-transparent",
    active
      ? "text-white hover:bg-transparent"
      : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900",
  ].join(" ");

const TAB_COUNT = 4;

type EnvironmentNavProps = {
  appName: string;
  primaryColor: string;
  isHome: boolean;
  isStudio: boolean;
  isStore: boolean;
  isConfigurator: boolean;
  studioHref: string;
  storeHref: string;
  configuratorHref: string;
  onHomeClick: () => void;
  showStudioTab: boolean;
};

function activeIndexFromFlags(
  isHome: boolean,
  isStudio: boolean,
  isStore: boolean,
  isConfigurator: boolean,
): number {
  if (isHome) return 0;
  if (isStudio) return 1;
  if (isStore) return 2;
  if (isConfigurator) return 3;
  return 0;
}

function rectsEqual(a: IndicatorRect | null, b: IndicatorRect): boolean {
  if (!a) return false;
  return (
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.top === b.top
  );
}

function TabLabel({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

export function EnvironmentNav({
  appName,
  primaryColor,
  isHome,
  isStudio,
  isStore,
  isConfigurator,
  studioHref,
  storeHref,
  configuratorHref,
  onHomeClick,
  showStudioTab,
}: EnvironmentNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const tabRectsRef = useRef<(IndicatorRect | null)[]>(
    Array.from({ length: TAB_COUNT }, () => null),
  );
  const routeActiveIndex = activeIndexFromFlags(
    isHome,
    isStudio,
    isStore,
    isConfigurator,
  );
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const displayIndex = pendingIndex ?? routeActiveIndex;
  const displayIndexRef = useRef(displayIndex);
  displayIndexRef.current = displayIndex;
  const [indicator, setIndicator] = useState<IndicatorRect | null>(null);

  const applyIndicatorForIndex = (index: number) => {
    const target = tabRectsRef.current[index];
    if (target) {
      setIndicator((prev) => (rectsEqual(prev, target) ? prev : target));
    }
  };

  useLayoutEffect(() => {
    if (pendingIndex !== null && pendingIndex === routeActiveIndex) {
      setPendingIndex(null);
    }
  }, [pendingIndex, routeActiveIndex]);

  useLayoutEffect(() => {
    applyIndicatorForIndex(displayIndex);
  }, [displayIndex]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measureAll = () => {
      const navRect = nav.getBoundingClientRect();
      const nextRects: (IndicatorRect | null)[] = [];

      for (let i = 0; i < TAB_COUNT; i++) {
        const item = itemRefs.current[i];
        if (!item) {
          nextRects.push(null);
          continue;
        }
        const itemRect = item.getBoundingClientRect();
        nextRects.push({
          left: itemRect.left - navRect.left,
          width: itemRect.width,
          height: itemRect.height,
          top: itemRect.top - navRect.top,
        });
      }

      tabRectsRef.current = nextRects;
      applyIndicatorForIndex(displayIndexRef.current);
    };

    measureAll();

    const observer = new ResizeObserver(measureAll);
    observer.observe(nav);
    for (const el of itemRefs.current) {
      if (el) observer.observe(el);
    }

    window.addEventListener("resize", measureAll);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureAll);
    };
  }, [appName, studioHref, storeHref, configuratorHref, showStudioTab]);

  const setItemRef = (index: number) => (el: HTMLElement | null) => {
    itemRefs.current[index] = el;
  };

  const selectTab = (index: number) => {
    applyIndicatorForIndex(index);
    setPendingIndex(index);
  };

  const prefetchStore = () => {
    useStoreCatalogStore.getState().prefetch([]);
  };

  const prefetchConfigurator = () => {
    useProjectsListStore.getState().prefetch();
  };

  return (
    <nav
      ref={navRef}
      className="relative flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1"
      aria-label="Environment"
    >
      {indicator ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-lg transition-[left,width,top,height] duration-200 ease-out"
          style={{
            left: indicator.left,
            top: indicator.top,
            width: indicator.width,
            height: indicator.height,
            backgroundColor: primaryColor,
          }}
        />
      ) : null}
      <button
        ref={setItemRef(0)}
        type="button"
        onClick={() => {
          selectTab(0);
          onHomeClick();
        }}
        className={tabClass(displayIndex === 0)}
        aria-current={routeActiveIndex === 0 ? "page" : undefined}
      >
        <TabLabel>{appName}</TabLabel>
      </button>
      {showStudioTab ? (
        <Link
          ref={setItemRef(1)}
          href={studioHref}
          onClick={() => selectTab(1)}
          className={tabClass(displayIndex === 1)}
          aria-current={routeActiveIndex === 1 ? "page" : undefined}
        >
          <TabLabel>Studio</TabLabel>
        </Link>
      ) : null}
      <Link
        ref={setItemRef(2)}
        href={storeHref}
        onClick={() => selectTab(2)}
        onPointerEnter={prefetchStore}
        onFocus={prefetchStore}
        className={tabClass(displayIndex === 2)}
        aria-current={routeActiveIndex === 2 ? "page" : undefined}
      >
        <TabLabel>Store</TabLabel>
      </Link>
      <Link
        ref={setItemRef(3)}
        href={configuratorHref}
        onClick={() => selectTab(3)}
        onPointerEnter={prefetchConfigurator}
        onFocus={prefetchConfigurator}
        className={tabClass(displayIndex === 3)}
        aria-current={routeActiveIndex === 3 ? "page" : undefined}
      >
        <TabLabel>Configurator</TabLabel>
      </Link>
    </nav>
  );
}
