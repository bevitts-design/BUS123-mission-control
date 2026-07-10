import fs from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { evaluateLessonReadiness } from "../core/readiness.mjs";

const skippedDirs = new Set([".git", "node_modules", "tmp", "__MACOSX"]);

async function pathExists(path) {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root) {
  const files = [];
  if (!root || !await pathExists(root)) return files;

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skippedDirs.has(entry.name)) await walk(join(directory, entry.name));
        continue;
      }
      if (entry.isFile() && !entry.name.startsWith("~$")) files.push(join(directory, entry.name));
    }
  }

  await walk(root);
  return files;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function lessonTokens(lesson) {
  return [
    lesson.id,
    `${lesson.track}-${lesson.module}-${lesson.lesson}`,
    lesson.title
  ].map(normalize).filter(Boolean);
}

function matchesLesson(filePath, lesson) {
  const fileName = normalize(basename(filePath, extname(filePath)));
  return lessonTokens(lesson).some((token) => token && fileName.includes(token));
}

function findInstructorFile(files, lesson, patterns) {
  return files.find((filePath) => {
    if (!matchesLesson(filePath, lesson)) return false;
    const fileName = normalize(basename(filePath, extname(filePath)));
    return patterns.some((pattern) => pattern.test(fileName));
  }) || null;
}

function resultStatus(lessons) {
  if (lessons.some((lesson) => lesson.status === "Not Ready")) return "error";
  if (lessons.some((lesson) => lesson.status !== "Ready to Teach" || lesson.warnings.length)) return "warning";
  return "success";
}

export async function courseHealth({ publicRoot, instructorRoot }) {
  const courseMapPath = join(publicRoot, "course-map.json");
  let courseMap;
  try {
    courseMap = JSON.parse(await fs.readFile(courseMapPath, "utf8"));
  } catch (error) {
    return {
      tool: "lesson-readiness",
      title: "Check Lesson Readiness",
      status: "error",
      summary: "Course Health could not read the public course map.",
      details: [`ERROR: ${error.message}`],
      lessons: [],
      counts: {}
    };
  }

  const instructorFiles = await walkFiles(instructorRoot);
  const lessons = [];

  for (const lesson of courseMap.lessons ?? []) {
    const publicArtifacts = await Promise.all((lesson.materials ?? []).map(async (material) => ({
      ...material,
      exists: Boolean(material.path) && await pathExists(join(publicRoot, material.path))
    })));

    const instructorNotes = findInstructorFile(instructorFiles, lesson, [
      /instructor-notes/,
      /teaching-guide/,
      /lesson-guide/,
      /instructor/
    ]);

    const answerKey = findInstructorFile(instructorFiles, lesson, [
      /answer-key/,
      /activity-key/,
      /solution/,
      /completed/,
      /solutions/,
      /key$/
    ]);
    const qti = findInstructorFile(instructorFiles, lesson, [/qti/, /quiz/]);

    const readiness = evaluateLessonReadiness({
      track: lesson.track,
      publicArtifacts,
      instructorNotes: Boolean(instructorNotes),
      answerKey: Boolean(answerKey),
      canvasConnected: false,
      qtiAvailable: Boolean(qti)
    });

    lessons.push({
      id: lesson.id,
      label: `${String(lesson.track || "").toUpperCase()} ${lesson.module || ""} ${lesson.lesson || ""} - ${lesson.title || lesson.id}`,
      status: readiness.status,
      blocking: readiness.blocking,
      warnings: readiness.warnings,
      studentPackage: readiness.student,
      instructorPackage: {
        instructorNotes: instructorNotes ? relative(instructorRoot, instructorNotes) : null,
        answerKey: answerKey ? relative(instructorRoot, answerKey) : null,
        answerKeyNeeded: readiness.answerKeyRequired
      },
      qtiPackage: qti ? relative(instructorRoot, qti) : null
    });
  }

  const counts = lessons.reduce((totals, lesson) => {
    totals[lesson.status] = (totals[lesson.status] || 0) + 1;
    return totals;
  }, {});

  const details = lessons.map((lesson) => {
    const missing = lesson.blocking.length ? ` | Missing: ${lesson.blocking.join("; ")}` : "";
    const warning = lesson.warnings.length ? ` | Warnings: ${lesson.warnings.join("; ")}` : "";
    return `${lesson.status.toUpperCase()}: ${lesson.label}${missing}${warning}`;
  });
  const warningCount = lessons.filter((lesson) => lesson.warnings.length).length;

  return {
    tool: "lesson-readiness",
    title: "Check Lesson Readiness",
    status: resultStatus(lessons),
    summary: `${counts["Ready to Teach"] || 0} ready to teach, ${counts["Needs Work"] || 0} need work, ${counts["Not Ready"] || 0} not ready; ${warningCount} with warnings.`,
    details,
    lessons,
    counts
  };
}
