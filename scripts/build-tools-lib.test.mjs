import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePublicMaterials } from "./build-tools-lib.mjs";

const publicRoot = await mkdtemp(join(tmpdir(), "bus123-validation-"));
try {
  const map = {
    course: { currentLessonId: "math-m09-l01" },
    tracks: [{ id: "math" }],
    lessons: [{
      id: "math-m09-l01", track: "math", status: "Live",
      materials: [
        { type: "Slides", path: "https://canva.link/example" },
        { type: "Slides", path: "HTTP://example.com/slides" },
        { type: "Reading", path: "reading.pdf" }
      ]
    }]
  };
  const validate = async () => {
    await writeFile(join(publicRoot, "course-map.json"), JSON.stringify(map));
    return validatePublicMaterials({ publicRoot });
  };
  await writeFile(join(publicRoot, "reading.pdf"), "fixture");
  assert.equal((await validate()).status, "success", "Web links and existing local files should pass.");

  map.lessons[0].materials.push({ type: "Workbook", path: "missing.xlsx" });
  let result = await validate();
  assert.equal(result.status, "error");
  assert.deepEqual(result.errors.map(item => item.path), ["missing.xlsx"], "Missing local files must still block validation.");

  map.lessons[0].materials = [
    { type: "Reading", path: "../outside.pdf" },
    { type: "Reading", path: join(publicRoot, "reading.pdf") }
  ];
  result = await validate();
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every(item => /escapes the public repo/.test(item.message)), "Unsafe local paths must still be rejected.");

  map.lessons[0].materials = [{ type: "Slides" }];
  result = await validate();
  assert.match(result.errors[0].message, /without a path/);
  console.log("Public material validation tests passed.");
} finally {
  await rm(publicRoot, { recursive: true, force: true });
}
