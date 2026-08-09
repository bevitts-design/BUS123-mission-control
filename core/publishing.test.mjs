import assert from "node:assert/strict";
import { parseGitStatus } from "./publishing.mjs";

const paths = ["course-map.json", "index.html", "scripts/build-index.mjs"];
const changes = parseGitStatus([
  " M scripts/build-index.mjs",
  "M  course-map.json",
  "?? notes.txt",
  " D index.html"
].join("\n"), paths);

assert.deepEqual(
  changes.map(({ path, staged, unstaged, deleted, publishPath }) => ({ path, staged, unstaged, deleted, publishPath })),
  [
    { path: "scripts/build-index.mjs", staged: false, unstaged: true, deleted: false, publishPath: true },
    { path: "course-map.json", staged: true, unstaged: false, deleted: false, publishPath: true },
    { path: "notes.txt", staged: false, unstaged: true, deleted: false, publishPath: false },
    { path: "index.html", staged: false, unstaged: true, deleted: true, publishPath: true }
  ]
);

console.log("Publishing status parser tests passed.");
