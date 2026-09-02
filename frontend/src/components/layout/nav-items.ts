import {
  LayoutDashboard,
  BookOpen,
  Wand2,
  FolderKanban,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";

export type NavItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
};

export const primaryNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Create Video", href: "/create", icon: Wand2 },
  { label: "Projects", href: "/projects", icon: FolderKanban },
];

export const secondaryNavItems: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
];
