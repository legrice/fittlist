import { readFile } from "node:fs/promises";

const [swift, web, shareHub, styles, navBar] = await Promise.all([
  readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/nav.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ShareHubScreen.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../src/components/NavBar.tsx", import.meta.url), "utf8"),
]);

const fail = (message) => {
  throw new Error(`Native navigation contract failed: ${message}`);
};

const requiredWebFragments = [
  'id: "following" as const',
  'href: "/feed"',
  'label: "Home"',
  '{ id: "calendar", href: "/calendar", icon: "calendar_month", label: "Calendar" }',
  '{ id: "discover", href: "/discover", icon: "search", label: "Search" }',
  '{ id: "share", href: coach ? "/coachshare" : "/membershare", icon: "reply", label: "Share" }',
];
const requiredSwiftFragments = [
  'private let tabIDs = ["following", "calendar", "discover", "share"]',
  'private let fallbackRoutes = ["/feed", "/calendar", "/discover", "/membershare"]',
  'item("Home", "house", 0)',
  'item("Calendar", "calendar", 1)',
  'item("Search", "magnifyingglass", 2)',
  'item("Share", "arrowshape.turn.up.right", 3)',
  'navigate(tabID: "following", fallback: "/feed")',
  'let activeTags = ["following": 0, "calendar": 1, "discover": 2, "share": 3]',
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
const requiredMobileDockFragments = [
  'className="navwrap"',
  ':is(.screen.hasnav, .screen.hasnav > .pad, .pub.hasnav .profwrap) > .navwrap',
];

for (const fragment of requiredWebFragments) {
  if (!web.includes(fragment)) fail(`web navigation is missing ${fragment}`);
}
const orderedWebIDs = ['id: "following"', 'id: "calendar"', 'id: "discover"', 'id: "share"'];
for (let index = 1; index < orderedWebIDs.length; index += 1) {
  if (web.indexOf(orderedWebIDs[index - 1]) >= web.indexOf(orderedWebIDs[index]))
    fail(`web navigation order should be following, calendar, discover, share`);
}
for (const fragment of requiredSwiftFragments) {
  if (!swift.includes(fragment)) fail(`SceneDelegate is missing ${fragment}`);
}
for (const fragment of requiredShareHubFragments) {
  if (!shareHub.includes(fragment)) fail(`Share editor is missing ${fragment}`);
}
for (const fragment of requiredMobileDockFragments) {
  if (!`${navBar}\n${styles}`.includes(fragment))
    fail(`mobile dock shell coverage is missing ${fragment}`);
}

console.log("Native navigation/share contract: web dock aligned and export lifecycle guarded");
