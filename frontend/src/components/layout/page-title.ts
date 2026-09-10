const TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard", title: "Dashboard" },
  { prefix: "/knowledge", title: "My Knowledge" },
  { prefix: "/create", title: "Create Video" },
  { prefix: "/projects", title: "Projects" },
  { prefix: "/media", title: "Media" },
  { prefix: "/settings", title: "Settings" },
];

export function getPageTitle(pathname: string): string {
  const match = TITLES.find(
    (t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`)
  );
  return match?.title ?? "OneInfo";
}
