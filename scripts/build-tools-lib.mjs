import fs from "node:fs/promises";
import { basename, isAbsolute, join, normalize, relative, sep } from "node:path";

const skippedDirs = new Set([".git", "node_modules", "tmp", "__MACOSX"]);
const privateNamePatterns = [
  { pattern: /(?:^|[-_ ])(?:activity[-_ ]?key|answer[-_ ]?key|key)(?:[-_. ]|$)/i, label: "answer or activity key" },
  { pattern: /(?:^|[-_ ])solution(?:[-_. ]|$)/i, label: "solution file" },
  { pattern: /qti/i, label: "Canvas QTI package" },
  { pattern: /(?:^|[-_ ])grading(?:[-_. ]|$)/i, label: "grading file" },
  { pattern: /(?:^|[-_ ])instructor(?:[-_. ]|$)/i, label: "instructor file" }
];

function result(tool, title, status, summary, details = [], extra = {}) {
  return { tool, title, status, summary, details, ...extra };
}

function isPathInside(candidate, root) {
  const normalizedRoot = normalize(root);
  const normalizedCandidate = normalize(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function issue(level, message, path = "") {
  return { level, message, path };
}

async function pathExists(path) {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readCourseMap(publicRoot) {
  const courseMapPath = join(publicRoot, "course-map.json");
  return {
    courseMapPath,
    data: JSON.parse(await fs.readFile(courseMapPath, "utf8"))
  };
}

async function walkFiles(root) {
  const files = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skippedDirs.has(entry.name)) await walk(join(directory, entry.name));
        continue;
      }

      if (entry.isFile()) files.push(join(directory, entry.name));
    }
  }

  await walk(root);
  return files;
}

function formatIssue(item) {
  return `${item.level.toUpperCase()}: ${item.message}${item.path ? ` (${item.path})` : ""}`;
}

export async function validatePublicMaterials({ publicRoot }) {
  const errors = [];
  const warnings = [];
  let data;

  try {
    ({ data } = await readCourseMap(publicRoot));
  } catch (error) {
    errors.push(issue("error", `Could not read course-map.json: ${error.message}`));
    return result(
      "validate-public",
      "Validate Public Materials",
      "error",
      "Validation could not read the public course map.",
      errors.map(formatIssue),
      { errors, warnings }
    );
  }

  const trackIds = new Set((data.tracks ?? []).map((track) => track.id));
  const lessons = data.lessons ?? [];
  const seenLessonIds = new Set();

  for (const lesson of lessons) {
    if (!lesson.id) {
      errors.push(issue("error", "A lesson is missing its id."));
    } else if (seenLessonIds.has(lesson.id)) {
      errors.push(issue("error", `Duplicate lesson id: ${lesson.id}`));
    } else {
      seenLessonIds.add(lesson.id);
    }

    if (!trackIds.has(lesson.track)) {
      errors.push(issue("error", `Lesson ${lesson.id || "(missing id)"} uses unknown track: ${lesson.track || "(missing)"}`));
    }

    if (!lesson.status) {
      warnings.push(issue("warning", `Lesson ${lesson.id || "(missing id)"} has no release status.`));
    }

    for (const material of lesson.materials ?? []) {
      if (!material.path) {
        errors.push(issue("error", `Lesson ${lesson.id || "(missing id)"} has a material without a path.`));
        continue;
      }

      const absolutePath = join(publicRoot, material.path);
      if (isAbsolute(material.path) || !isPathInside(absolutePath, publicRoot)) {
        errors.push(issue("error", `Material path escapes the public repo for lesson ${lesson.id}.`, material.path));
        continue;
      }

      if (!await pathExists(absolutePath)) {
        errors.push(issue("error", `Missing ${material.type || "material"} for lesson ${lesson.id}.`, material.path));
      }
    }
  }

  if (!data.course?.currentLessonId) {
    warnings.push(issue("warning", "No current lesson is selected."));
  } else if (!seenLessonIds.has(data.course.currentLessonId)) {
    errors.push(issue("error", `Current lesson id does not exist: ${data.course.currentLessonId}`));
  }

  for (const filePath of await walkFiles(publicRoot)) {
    const relativePath = relative(publicRoot, filePath);
    const fileName = basename(filePath);
    const match = privateNamePatterns.find(({ pattern }) => pattern.test(fileName));
    if (match) warnings.push(issue("warning", `Possible private ${match.label} found in the public repo.`, relativePath));
  }

  const details = [
    `${lessons.length} lessons checked.`,
    `${errors.length} blocking error${errors.length === 1 ? "" : "s"}.`,
    `${warnings.length} review warning${warnings.length === 1 ? "" : "s"}.`,
    ...errors.map(formatIssue),
    ...warnings.map(formatIssue)
  ];

  return result(
    "validate-public",
    "Validate Public Materials",
    errors.length ? "error" : warnings.length ? "warning" : "success",
    errors.length
      ? "Validation found blocking course-map problems."
      : warnings.length
        ? "Validation passed with files to review."
        : "Validation passed with no issues.",
    details,
    { errors, warnings }
  );
}

export async function openTeachingBundle({ publicRoot, instructorRoot }) {
  const { data } = await readCourseMap(publicRoot);
  const currentLesson = (data.lessons ?? []).find((lesson) => lesson.id === data.course?.currentLessonId);

  if (!currentLesson) {
    return result(
      "open-teaching-bundle",
      "Open Current Teaching Bundle",
      "error",
      "The current lesson is not set to a valid lesson id.",
      []
    );
  }

  const track = (data.tracks ?? []).find((item) => item.id === currentLesson.track);
  const publicTargets = [];
  for (const material of currentLesson.materials ?? []) {
    const path = join(publicRoot, material.path);
    if (await pathExists(path)) publicTargets.push({ label: material.type || basename(path), path });
  }

  const instructorFolder = join(instructorRoot, track?.folder || String(currentLesson.track || "").toUpperCase(), currentLesson.module);
  const openTargets = [...publicTargets];
  if (await pathExists(instructorFolder)) openTargets.push({ label: "Instructor folder", path: instructorFolder });

  const details = openTargets.map((target) => `OPEN: ${target.label} - ${target.path}`);
  return result(
    "open-teaching-bundle",
    "Open Current Teaching Bundle",
    openTargets.length ? "success" : "warning",
    `${currentLesson.title}: ${openTargets.length} teaching-bundle target${openTargets.length === 1 ? "" : "s"} ready to open.`,
    details,
    { lesson: currentLesson, openTargets }
  );
}

export async function regeneratePublicIndex({ publicRoot }) {
  const validation = await validatePublicMaterials({ publicRoot });
  if (validation.errors.length) {
    return result(
      "regenerate-index",
      "Regenerate Course Map Page",
      "error",
      "Index regeneration stopped because validation found blocking errors.",
      validation.details,
      { validation }
    );
  }

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const scriptPath = join(publicRoot, "scripts", "build-index.mjs");
  await run(process.execPath, [scriptPath], { cwd: publicRoot });

  return result(
    "regenerate-index",
    "Regenerate Course Map Page",
    validation.warnings.length ? "warning" : "success",
    validation.warnings.length
      ? "Public index regenerated. Validation warnings still need review."
      : "Public index regenerated successfully.",
    [`Updated ${join(publicRoot, "index.html")}.`, ...validation.details],
    { validation }
  );
}

export function parseRoots(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    values.set(argv[index], argv[index + 1]);
  }

  return {
    publicRoot: values.get("--public-root"),
    instructorRoot: values.get("--instructor-root")
  };
}

export function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
