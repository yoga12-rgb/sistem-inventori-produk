"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowLeftRight,
  Boxes,
  Building2,
  FileText,
  FolderTree,
  Grid3x3,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import {
  PageActionSlotOutlet,
  PageActionSlotProvider,
} from "@/components/page-action-slot";
import { TopbarPageInfo } from "@/components/topbar-page-info";
import { ThemeToggle } from "@/components/theme-toggle";
import { TransferNotifier } from "@/components/transfer-notifier";
import { useTransferInbox } from "@/components/transfer-inbox";
import { cn } from "@/lib/utils";

type Role = "super_admin" | "cashier" | null;

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
  bottomBar?: boolean;
};

/** Flat menu — tanpa kategori. Urutan = urutan tampil di sidebar. */
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, bottomBar: true },
  { href: "/stok", label: "Stok", icon: Boxes, bottomBar: true },
  {
    href: "/produksi",
    label: "Produksi",
    icon: Sparkles,
    roles: ["super_admin"],
  },
  {
    href: "/transfer",
    label: "Transfer",
    icon: ArrowLeftRight,
    bottomBar: true,
  },
  { href: "/penjualan", label: "Penjualan", icon: Receipt, bottomBar: true },
  { href: "/eod", label: "End of Day", icon: FileText },
  { href: "/matrix", label: "Inventory Matrix", icon: Grid3x3 },
  {
    href: "/aktivitas",
    label: "Aktivitas",
    icon: Activity,
    roles: ["super_admin"],
  },
  {
    href: "/master/outlets",
    label: "Outlet",
    icon: Building2,
    roles: ["super_admin"],
  },
  {
    href: "/master/categories",
    label: "Kategori",
    icon: FolderTree,
    roles: ["super_admin"],
  },
  {
    href: "/master/products",
    label: "Produk",
    icon: Package,
    roles: ["super_admin"],
  },
  {
    href: "/master/users",
    label: "Pengguna",
    icon: Users,
    roles: ["super_admin"],
  },
];

function matchesActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function visibleItem(item: NavItem, role: Role): boolean {
  return !item.roles || (role !== null && item.roles.includes(role));
}

function visibleNav(role: Role): NavItem[] {
  return NAV.filter((i) => visibleItem(i, role));
}

export function AppShell({
  user,
  children,
}: {
  user: {
    id: string;
    email: string | null;
    fullName: string;
    role: Role;
    outletId: string | null;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Toggle sidebar (desktop). State: expanded (default) ↔ collapsed (rail).
  // Saat collapsed, hover ikon menampilkan tooltip kecil — bukan expand penuh.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("sidebar:collapsed");
    if (saved === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarCollapsed(true);
    }
  }, []);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            "sidebar:collapsed",
            next ? "1" : "0",
          );
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);

  // Saat collapsed, sidebar tetap rail. `sidebarExpanded` = invers untuk
  // dipakai render header & footer.
  const sidebarExpanded = !sidebarCollapsed;

  // Keyboard shortcut: Ctrl/Cmd+B toggle sidebar (desktop saja).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        const t = e.target as HTMLElement | null;
        const inField =
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable);
        if (inField) return;
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const navItems = useMemo(() => visibleNav(user.role), [user.role]);

  const bottomBarNav = navItems.filter((i) => i.bottomBar).slice(0, 4);

  const roleLabel =
    user.role === "super_admin"
      ? "Super Admin"
      : user.role === "cashier"
        ? "Kasir"
        : "Tanpa profil";

  return (
    <PageActionSlotProvider>
      <div className="flex min-h-dvh">
      {user.outletId ? (
        <TransferNotifier myOutletId={user.outletId} myUserId={user.id} />
      ) : null}

      {/* ===== Sidebar (desktop only) ===== */}
      {/*
        Pola "icon-rail collapse":
        - Default `w-64` (expanded, label penuh).
        - Saat `sidebarCollapsed`, lebar rail jadi `w-14` (icon-only).
          Hover ikon menampilkan tooltip floating dengan label, bukan
          expand sidebar.
      */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh flex-shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-out lg:flex",
          sidebarCollapsed ? "w-14 overflow-visible" : "w-64 overflow-hidden",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center gap-2 border-b",
            sidebarExpanded ? "justify-between px-4" : "justify-center px-2",
          )}
        >
          {sidebarExpanded ? (
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <Package className="h-4 w-4" />
              </span>
              <span>Inventaris</span>
            </Link>
          ) : (
            <Link href="/" aria-label="Inventaris">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <Package className="h-4 w-4" />
              </span>
            </Link>
          )}
          {sidebarExpanded ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={
                sidebarCollapsed ? "Pin sidebar terbuka" : "Sembunyikan sidebar"
              }
              title={`${sidebarCollapsed ? "Pin sidebar" : "Sembunyikan sidebar"} (Ctrl+B)`}
              className="flex-shrink-0"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          ) : null}
        </div>

        <nav
          className={cn(
            "flex-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]",
            sidebarExpanded
              ? "overflow-y-auto p-3"
              : "overflow-visible px-2 py-2",
          )}
        >
          <SidebarTree
            items={navItems}
            pathname={pathname}
            collapsed={sidebarCollapsed}
          />
        </nav>

        <div
          className={cn(
            "border-t",
            sidebarExpanded ? "p-3" : "px-2 py-3",
          )}
        >
          {sidebarExpanded ? (
            <>
              <div className="mb-2 px-2">
                <div className="text-sm font-medium leading-tight">
                  {user.fullName}
                </div>
                <div className="text-xs text-muted-foreground">{roleLabel}</div>
              </div>
              <form action="/logout" method="POST">
                <Button
                  variant="outline"
                  size="sm"
                  type="submit"
                  className="w-full justify-center"
                >
                  <LogOut className="h-4 w-4" />
                  Keluar
                </Button>
              </form>
            </>
          ) : (
            <form action="/logout" method="POST" className="flex justify-center">
              <Button
                variant="outline"
                size="icon"
                type="submit"
                title="Keluar"
                aria-label="Keluar"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </aside>

      {/* ===== Main column ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile/tablet top bar — judul halaman + ⓘ + theme toggle. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-card/95 px-4 backdrop-blur lg:hidden">
          <TopbarPageInfo className="flex-1" />
          <div className="flex flex-shrink-0 items-center gap-1">
            <PageActionSlotOutlet />
            <ThemeToggle />
          </div>
        </header>

        {/* Desktop top bar — judul halaman + ⓘ kiri, slot aksi + theme toggle kanan. */}
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-between gap-3 border-b bg-card/80 px-6 backdrop-blur lg:flex">
          <TopbarPageInfo className="flex-1" />
          <div className="flex flex-shrink-0 items-center gap-2">
            <PageActionSlotOutlet />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* ===== Bottom nav (mobile + tablet) ===== */}
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {bottomBarNav.map((item) => (
            <li key={item.href}>
              <BottomNavLink
                item={item}
                active={matchesActive(pathname, item.href)}
              />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" />
              <span>Menu</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        side="right"
        title="Menu"
        description={`${user.fullName} · ${roleLabel}`}
        className="lg:hidden"
      >
        <div className="flex h-full flex-col">
          <nav className="flex-1 overflow-y-auto p-3">
            <SidebarTree
              items={navItems}
              pathname={pathname}
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
          <div className="border-t p-3">
            <form action="/logout" method="POST">
              <Button
                variant="outline"
                type="submit"
                className="w-full justify-center"
              >
                <LogOut className="h-4 w-4" />
                Keluar
              </Button>
            </form>
          </div>
        </div>
      </Sheet>
      </div>
    </PageActionSlotProvider>
  );
}

function SidebarTree({
  items,
  pathname,
  onNavigate,
  collapsed,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <SidebarLeafLink
              item={item}
              active={matchesActive(pathname, item.href)}
              onNavigate={onNavigate}
              collapsed
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.href}>
          <SidebarLeafLink
            item={item}
            active={matchesActive(pathname, item.href)}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  );
}

function SidebarLeafLink({
  item,
  active,
  onNavigate,
  nested,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  nested?: boolean;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return <CollapsedSidebarLink item={item} active={active} onNavigate={onNavigate} />;
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md py-2 text-sm transition-colors",
        nested ? "px-2.5" : "px-3",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{item.label}</span>
      <NavBadge href={item.href} />
    </Link>
  );
}

/**
 * Badge angka kecil untuk nav item tertentu (saat ini: /transfer).
 * Otomatis sembunyi kalau angka 0.
 */
function NavBadge({ href }: { href: string }) {
  const inbox = useTransferInbox();
  if (href !== "/transfer") return null;
  const count = inbox.incoming + inbox.outgoing;
  if (count === 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Versi collapsed dari sidebar link — tooltip dirender via portal ke
 * `document.body` agar tidak terjebak stacking context `<aside sticky>`.
 * Tanpa portal, z-index tooltip diukur relatif ke aside dan akan kalah
 * melawan popover Select (yang juga di portal document.body).
 */
function CollapsedSidebarLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const showTimerRef = useRef<number | null>(null);

  const computeCoords = useCallback(() => {
    const el = linkRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.top + r.height / 2, left: r.right + 8 });
  }, []);

  const onEnter = () => {
    computeCoords();
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
    }
    showTimerRef.current = window.setTimeout(() => setHovered(true), 300);
  };
  const onLeave = () => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setHovered(false);
  };

  // Reposition ketika hover (sidebar bisa di-scroll).
  useEffect(() => {
    if (!hovered) return;
    const onScrollOrResize = () => computeCoords();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [hovered, computeCoords]);

  // Cleanup timer saat unmount.
  useEffect(() => {
    return () => {
      if (showTimerRef.current != null) {
        window.clearTimeout(showTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <Link
        ref={linkRef}
        href={item.href}
        onClick={onNavigate}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
        className={cn(
          "relative mx-auto grid h-9 w-9 place-items-center rounded-md transition-colors",
          active
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <item.icon className="h-4 w-4" />
        <NavDot href={item.href} />
      </Link>
      {hovered && coords && typeof window !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[200] -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10"
              style={{ top: coords.top, left: coords.left }}
            >
              {item.label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function BottomNavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <item.icon className="h-5 w-5" />
      <span>{item.label}</span>
      <NavDot href={item.href} top="top-1" right="right-3" />
    </Link>
  );
}

/**
 * Dot kecil di pojok kanan atas icon-only nav (mobile bottom + collapsed
 * sidebar). Aktif kalau ada transfer pending.
 */
function NavDot({
  href,
  top = "-top-0.5",
  right = "-right-0.5",
}: {
  href: string;
  top?: string;
  right?: string;
}) {
  const inbox = useTransferInbox();
  if (href !== "/transfer") return null;
  const count = inbox.incoming + inbox.outgoing;
  if (count === 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "absolute h-2 w-2 rounded-full bg-primary ring-2 ring-card",
        top,
        right,
      )}
    />
  );
}
