import { readFile } from "node:fs/promises";

const [swift, web] = await Promise.all([
  readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/nav.ts", import.meta.url), "utf8"),
]);

const fail = (message) => {
  throw new Error(`Native navigation contract failed: ${message}`);
};

const requiredWebFragments = [
  'id: "following" as const',
  'href: "/feed"',
  'label: "Calendar"',
  '{ id: "share", href: coach ? "/coachshare" : "/membershare", icon: "reply", label: "Share" }',
  '{ id: "discover", href: "/discover", icon: "search", label: "Discover" }',
  'id: "calendar", href: profileHref ?? "/you", icon: "person", label: "You"',
];
const requiredSwiftFragments = [
  'private let tabIDs = ["following", "discover", "calendar", "share"]',
  'private let fallbackRoutes = ["/feed", "/discover", "/you", "/membershare"]',
  'item("Calendar", "calendar", 0)',
  'item("Discover", "magnifyingglass", 1)',
  'item("Profile", "person.crop.circle", 2)',
  'item("Share", "arrowshape.turn.up.right", 3)',
  'navigate(tabID: "following", fallback: "/feed")',
  'let activeTags = ["following": 0, "discover": 1, "calendar": 2, "share": 3]',
  'headerView.isHidden = true',
  'tabBar.isHidden = true',
];

for (const fragment of requiredWebFragments) {
  if (!web.includes(fragment)) fail(`web navigation is missing ${fragment}`);
}
for (const fragment of requiredSwiftFragments) {
  if (!swift.includes(fragment)) fail(`SceneDelegate is missing ${fragment}`);
}

console.log("Native navigation contract: headerless web dock aligned");
