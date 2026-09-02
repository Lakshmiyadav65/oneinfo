"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { getPageTitle } from "@/components/layout/page-title";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/Dropdown";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { creator, signOut } = useAuth();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="-ml-2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      </div>

      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-80"
            aria-label="Creator menu"
          >
            {(creator?.name ?? "?").slice(0, 1).toUpperCase()}
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {creator?.name ?? "Unknown creator"}
            </p>
            {creator?.email && (
              <p className="truncate text-xs text-muted-foreground">{creator.email}</p>
            )}
          </div>
          <DropdownItem onSelect={() => void signOut()}>Sign out</DropdownItem>
        </DropdownContent>
      </Dropdown>
    </header>
  );
}
