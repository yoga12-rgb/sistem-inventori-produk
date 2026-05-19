"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  Database,
  FileText,
  Grid3x3,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { TransferNotifier } from "@/components/transfer-notifier";
import { cn } from "@/lib/utils";

type Role = "super_admin" | "cashier" | null;

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
  bottomBar?: boolean;
};

type NavGroup = {
  /** Stable id (untuk localStorage). */
  id: string;
  /** Label tier-1 yang berfungsi sebagai dropdown trigger. */
  label: string;
  /** Ikon di sebelah label tier-1. */
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

type NavSchema = {
  /** Item top-level (rendered tanpa dropdown — mis. Dashboard). */
  topLevel: NavItem[];
  /** Group yang punya tier-2. */
  groups: NavGroup[];
};

const NAV: NavSchema = {
  topLevel: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, bottomBar: true },
  ],
  groups: [
    {
      id: "operasional",
      label: "Operasional",
      icon: Workflow,
      items: [
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
        {
          href: "/penjualan",
          label: "Penjualan",
          icon: Receipt,
          bottomBar: true,
        },
        { href: "/eod", label: "End of Day", icon: FileText },
      ],
    },
    {
      id: "laporan",
      label: "Laporan",
      icon: ClipboardList,
      items: [
        { href: "/matrix", label: "Inventory Matrix", icon: Grid3x3 },
        {
          href: "/aktivitas",
          label: "Aktivitas",
          icon: Activity,
          roles: ["super_admin"],
        },
      ],
    },
    {
      id: "master",
      label: "Master Data",
      icon: Database,
      items: [
        {
          href: "/master/outlets",
          label: "Outlet",
          icon: Building2,
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
      ],
    },
  ],
};

const STORAGE_KEY = "sidebar:groups";

function matchesActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function visibleItem(item: NavItem, role: Role): boolean {
  return !item.roles || (role !== null && item.roles.includes(role));
}

function visibleSchema(role: Role): NavSchema {
  return {
    topLevel: NAV.topLevel.filter((i) => visibleItem(i, role)),
    groups: NAV.groups
      .map((g) => ({ ...g, items: g.items.filter((i) => visibleItem(i, role)) }))
      .filter((g) => g.items.length > 0),
  };
}

/** State expand/collapse per grup, persist di localStorage. */
function useGroupState(groups: NavGroup[], pathname: string) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    // Default: semua expanded (akan dioverride oleh saved state via effect).
    return Object.fromEntries(groups.map((g) => [g.id, true]));
  });

  // Restore dari localStorage sekali saat mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, boolean>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenMap((prev) => ({ ...prev, ...saved }));
    } catch {
      /* ignore */
    }
  }, []);

  // Pastikan grup yang berisi route aktif selalu terbuka.
  useEffect(() => {
    const groupWithActive = groups.find((g) =>
      g.items.some((i) => matchesActive(pathname, i.href)),
    );
    if (!groupWithActive) return;
    if (openMap[groupWithActive.id]) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenMap((prev) => ({ ...prev, [groupWithActive.id]: true }));
  }, [pathname, groups, openMap]);

  const toggle = useCallback((id: string) => {
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);

  return { openMap, toggle };
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

  const schema = useMemo(() => visibleSchema(user.role), [user.role]);
  const { openMap, toggle } = useGroupState(schema.groups, pathname);

  const allVisibleItems = useMemo(
    () => [...schema.topLevel, ...schema.groups.flatMap((g) => g.items)],
    [schema],
  );
  const bottomBarNav = allVisibleItems.filter((i) => i.bottomBar).slice(0, 4);

  const roleLabel =
    user.role === "super_admin"
      ? "Super Admin"
      : user.role === "cashier"
        ? "Kasir"
        : "Tanpa profil";

  return (
    <div className="flex min-h-dvh">
      {user.outletId ? (
        <TransferNotifier myOutletId={user.outletId} myUserId={user.id} />
      ) : null}

      {/* ===== Sidebar (desktop only) ===== */}
      <aside className="sticky top-0 hidden h-dvh w-64 flex-shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Package className="h-4 w-4" />
            </span>
            <span>Inventaris</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <SidebarTree
            schema={schema}
            pathname={pathname}
            openMap={openMap}
            onToggle={toggle}
          />
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 px-2">
            <div className="text-sm font-medium leading-tight">
              {user.fullName}
            </div>
            <div className="text-xs text-muted-foreground">{roleLabel}</div>
          </div>
          <form action={signOutAction}>
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
        </div>
      </aside>

      {/* ===== Main column ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-card/95 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Package className="h-4 w-4" />
            </span>
            <span className="text-sm">Inventaris</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-end gap-3 border-b bg-card/80 px-6 backdrop-blur lg:flex">
          <ThemeToggle />
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
              schema={schema}
              pathname={pathname}
              openMap={openMap}
              onToggle={toggle}
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
          <div className="border-t p-3">
            <form action={signOutAction}>
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
  );
}

function SidebarTree({
  schema,
  pathname,
  openMap,
  onToggle,
  onNavigate,
}: {
  schema: NavSchema;
  pathname: string;
  openMap: Record<string, boolean>;
  onToggle: (id: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1">
      {/* Tier-0 / top-level items (mis. Dashboard) */}
      {schema.topLevel.length > 0 ? (
        <ul className="space-y-0.5">
          {schema.topLevel.map((item) => (
            <li key={item.href}>
              <SidebarLeafLink
                item={item}
                active={matchesActive(pathname, item.href)}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* Tier-1 group (collapsible) */}
      {schema.groups.map((group) => {
        const open = openMap[group.id] ?? true;
        const containsActive = group.items.some((i) =>
          matchesActive(pathname, i.href),
        );
        const panelId = `nav-section-${group.id}`;
        return (
          <div key={group.id} className="pt-1">
            <button
              type="button"
              onClick={() => onToggle(group.id)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                "group/btn flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                containsActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <group.icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 truncate text-left">{group.label}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200",
                  open ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden
              />
            </button>

            {/* Tier-2 items — animasi via grid template rows trick */}
            <div
              id={panelId}
              role="region"
              aria-labelledby={panelId}
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <ul
                  className={cn(
                    "ml-4 mt-1 space-y-0.5 border-l border-border pl-2 transition-opacity duration-200",
                    open ? "opacity-100" : "opacity-0",
                  )}
                >
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <SidebarLeafLink
                        item={item}
                        active={matchesActive(pathname, item.href)}
                        onNavigate={onNavigate}
                        nested
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SidebarLeafLink({
  item,
  active,
  onNavigate,
  nested,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  nested?: boolean;
}) {
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
    </Link>
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
        "flex h-full w-full flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <item.icon className="h-5 w-5" />
      <span>{item.label}</span>
    </Link>
  );
}
