import { readFile } from "node:fs/promises";

const [swift, web, shareHub] = await Promise.all([
  readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/nav.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ShareHubScreen.tsx", import.meta.url), "utf8"),
]);

const fail = (message) => {
  throw new Error(`Native navigation contract failed: ${message}`);
};

const requiredWebFragments = [
  'id: "following" as const',
  'href: "/feed"',
  'label: "Calendar"',
  '{ id: "discover", href: "/discover", icon: "search", label: "Discover" }',
  'id: "calendar", href: profileHref ?? "/you", icon: "account_circle", label: "Profile"',
  '{ id: "share", href: coach ? "/coachshare" : "/membershare", icon: "reply", label: "Share" }',
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
  "document.documentElement.dataset.nativeShareProtocol = '2';",
  'if target == "cancel"',
  'URLSession.shared.downloadTask(with: request)',
  'requestId: requestId',
  'status: "share-ready"',
  'status: "complete"',
  'status: "cancelled"',
  'activeShareFile(from: cachedURL)',
];
const requiredShareHubFragments = [
  'handler?.postMessage({ target:"cancel" });',
  'detail.requestId === activeRequestId',
  'dataset.nativeShareProtocol === "2"',
  'nativeExportRequestId.current = requestId',
];

for (const fragment of requiredWebFragments) {
  if (!web.includes(fragment)) fail(`web navigation is missing ${fragment}`);
}
const orderedWebIDs = ['id: "following"', 'id: "discover"', 'id: "calendar"', 'id: "share"'];
for (let index = 1; index < orderedWebIDs.length; index += 1) {
  if (web.indexOf(orderedWebIDs[index - 1]) >= web.indexOf(orderedWebIDs[index]))
    fail(`web navigation order should be following, discover, calendar, share`);
}
for (const fragment of requiredSwiftFragments) {
  if (!swift.includes(fragment)) fail(`SceneDelegate is missing ${fragment}`);
}
for (const fragment of requiredShareHubFragments) {
  if (!shareHub.includes(fragment)) fail(`Share editor is missing ${fragment}`);
}

console.log("Native navigation/share contract: web dock aligned and export lifecycle guarded");
