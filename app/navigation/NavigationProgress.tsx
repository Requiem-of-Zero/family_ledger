"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Global route-transition overlay. 
export default function NavigationProgress() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);

  // A pathname change means the route transition completed, so the overlay can
  // fade out instead of disappearing abruptly.
  useEffect(() => {
    finishProgress();
  }, [pathname]);

  // Capture clicks high in the document so this works for any internal link,
  // not only links rendered inside the navbar.
  useEffect(() => {
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      clearProgressTimers();
    };
  }, []);

  function clearProgressTimers() {
    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = null;
  }

  function startProgress() {
    clearProgressTimers();
    setIsVisible(true);
  }

  // Keep the overlay visible for a beat so very fast transitions still feel
  // intentional and do not flicker.
  function finishProgress() {
    if (!isVisible) return;

    hideTimeoutRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, 220);
  }

  // Only start the overlay for normal same-origin page navigations. Modified
  // clicks, hash links, and external links keep their default browser behavior.
  function handleClick(event: globalThis.MouseEvent) {
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = (event.target as Element | null)?.closest("a");
    if (!link) return;

    const target = link.getAttribute("target");
    const href = link.getAttribute("href");
    if (!href || target === "_blank" || href.startsWith("#")) return;

    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.origin !== window.location.origin) return;

    const currentUrl = new URL(window.location.href);
    if (
      nextUrl.pathname === currentUrl.pathname &&
      nextUrl.search === currentUrl.search
    ) {
      return;
    }

    startProgress();
  }

  return (
    <div
      aria-hidden="true"
      className={[
        "pointer-events-none fixed inset-0 z-[80] grid place-items-center bg-black/35 backdrop-blur-[1px] transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      <div className="grid h-16 w-16 place-items-center rounded-full border border-border bg-surface-bg/90 shadow-xl shadow-black/20">
        <div className="family-ledger-loading-mark h-11 w-11 bg-primary-text" />
      </div>
    </div>
  );
}
