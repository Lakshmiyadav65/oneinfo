"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/auth/auth-context";
import { primaryNavItems, secondaryNavItems, type NavItem } from "@/components/layout/nav-items";

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {/*
        A tinted background alone reads as a hover state. The bar anchors the
        active item to the sidebar edge, and the coloured icon repeats the
        signal — so which page you are on is legible at a glance rather than
        inferred from a slightly lighter rectangle.
      */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
          aria-hidden="true"
        />
      )}
      <Icon
        className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-current")}
        aria-hidden="true"
      />
      <span className={cn(isActive && "font-semibold")}>{item.label}</span>
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { creator, signOut } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard" className="leading-tight">
          <span className="block text-base font-semibold tracking-tight text-foreground">
            OneInfo
          </span>
          <span className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            AI Creator
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {primaryNavItems.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}

        <div className="my-2 h-px bg-border" />

        {secondaryNavItems.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {(creator?.name ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {creator?.name ?? "Unknown creator"}
            </p>
            {creator?.email && (
              <p className="truncate text-xs text-muted-foreground">{creator.email}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
      <SidebarContent />
    </aside>
  );
}
