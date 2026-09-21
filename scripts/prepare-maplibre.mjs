import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const source = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
const target = new URL("../public/maplibre/", import.meta.url);
await mkdir(target, { recursive: true });
// v6's module worker imports its shared module. Keep both in lockstep with npm.
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(source, file), new URL(file, target));
}
