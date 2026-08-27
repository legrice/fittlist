import assert from "node:assert/strict";
import { objectionableContentError } from "../src/lib/content-safety.ts";

const allowed = [
  "That workout killed me — in the best way.",
  "A killer strength class with a spicy finisher.",
  "Kids’ yoga starts at 10. Parents can stay and watch.",
  "I am going to hurt tomorrow after all those squats.",
];
for (const value of allowed) assert.equal(objectionableContentError(value), null, value);

const blocked = [
  "I'm gonna kill you after class.",
  "I'll shoot you after class.",
  "go k1ll yourself",
  "kill yourself!",
  "I will kill you!",
  "underage nude photos",
  "n1gg3r",
  "n1gg3r!",
];
for (const value of blocked) assert.ok(objectionableContentError(value), value);

console.log("content safety check passed");
