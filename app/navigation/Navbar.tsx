"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

type NavItem = {
  href: string;
  label: string;
};

const AUTH_NAV: NavItem[] = [
  { href: "/transactions", label: "Transactions" },
  /*
   * Add later:
   * {href: "/categories", label: "categories"}
   * {href: "/settings", label: "settings"}
   */
];

const PUBLIC_NAV: NavItem[] = [{ href: "/about", label: "About" }];

// Minimal “me” shape for the navbar UI
type MeUser = {
  id: number;
  email: string;
  username: string;
};

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Current user state
  const [me, setMe] = useState<MeUser | null>(null);
  const [isLoadingMe, setIsLoadingMe] = useState(true);
  const navItems = !isLoadingMe && me ? AUTH_NAV : PUBLIC_NAV;
  const brandHref = !isLoadingMe && me ? "/transactions" : "/about";

  // Fetch current user on mount and after route changes
  useEffect(() => {
    let isCurrent = true;

    async function fetchMe() {
      setIsLoadingMe(true);

      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (!isCurrent) return;

        if (res.ok) {
          const body = await res.json();
          setMe(body.user);
        } else {
          setMe(null);
        }
      } catch (error) {
        if (!isCurrent) return;

        console.error("Failed to fetch user:", error);
        setMe(null);
      } finally {
        if (isCurrent) setIsLoadingMe(false);
      }
    }

    fetchMe();

    return () => {
      isCurrent = false;
    };
  }, [pathname]);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Logout failed:", body);
      } else {
        setMe(null);
      }
    } finally {
      setIsLoggingOut(false);
      router.push("/login");
      router.refresh();
    }
  }
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-bg/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href={brandHref} className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-primary-text">
              All-in Ledger
            </div>
            <div className="text-xs text-muted-text">Personal finance</div>
          </div>
        </Link>

        {/* Links */}
        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-raised-bg text-primary-text"
                    : "text-muted-text hover:text-primary-text hover:bg-raised-bg",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}

          {/* User Display - Show username or email when logged in */}
          {!isLoadingMe && me && (
            <Link href="/profile" className="rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm hover:border-border-hover">
              <span className="font-semibold text-primary-text">
                {me.username || me.email.split("@")[0]}
              </span>
            </Link>
          )}

          {/* Logout */}
          {!isLoadingMe && me && (
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm font-semibold text-primary-text hover:border-border-hover disabled:opacity-70"
            >
              {isLoggingOut ? "Logging out…" : "Logout"}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
