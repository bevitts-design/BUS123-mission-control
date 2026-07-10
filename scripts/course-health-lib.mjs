import fs from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

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

function classifyStudentMaterials(lesson) {
  const materials = lesson.materials ?? [];
  const types = new Set(materials.map((item) => normalize(item.type)));
  return {
    slides: [...types].some((type) => type.includes("slide")),
    reading: [...types].some((type) => type.includes("reading")),
    workbook: [...types].some((type) => type.includes("workbook") || type.includes("excel")),
    interactive: [...types].some((type) => type.includes("interactive")),
    assignment: [...types].some((type) => type.includes("assignment") || type.includes("project") || type.includes("homework"))
  };
}

function trackRequirements(track) {
  if (track === "math" || track === "excel") {
    return { slides: true, reading: true, workbook: true };
  }
  if (track === "capstone") {
    return { assignment: true, workbook: true };
  }
  return { slides: true };
}

function statusFor(blocking, warnings) {
  if (blocking.length >= 3) return "Not Ready";
  if (blocking.length) return "Needs Work";
  if (warnings.length) return "Almost Ready";
  return "Ready to Teach";
}

function resultStatus(lessons) {
  if (lessons.some((lesson) => lesson.status === "Not Ready")) return "error";
  if (lessons.some((lesson) => lesson.status !== "Ready to Teach")) return "warning";
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
    const blocking = [];
    const warnings = [];
    const student = classifyStudentMaterials(lesson);
    const required = trackRequirements(lesson.track);

    for (const [component, isRequired] of Object.entries(required)) {
      if (isRequired && !student[component]) blocking.push(`Student ${component} is not listed`);
    }

    for (const material of lesson.materials ?? []) {
      if (!material.path || !await pathExists(join(publicRoot, material.path))) {
        blocking.push(`Missing public file: ${material.path || material.type || "unnamed material"}`);
      }
    }

    const instructorNotes = findInstructorFile(instructorFiles, lesson, [
      /instructor-notes/,
      /teaching-guide/,
      /lesson-guide/,
      /instructor/
    ]);

    const answerKeyNeeded = student.workbook || student.assignment || student.interactive;
    const answerKey = findInstructorFile(instructorFiles, lesson, [
      /answer-key/,
      /activity-key/,
      /solution/,
      /completed/,
      /solutions/,
      /key$/
    ]);

    if (!instructorNotes) blocking.push("Instructor notes guide not found");
    if (answerKeyNeeded && !answerKey) blocking.push("Answer key or completed instructor file not found");

    if (!student.interactive) warnings.push("No interactive activity listed");
    warnings.push("Canvas status not yet connected");
    warnings.push("QTI status not yet connected");

    lessons.push({
      id: lesson.id,
      label: `${String(lesson.track || "").toUpperCase()} ${lesson.module || ""} ${lesson.lesson || ""} - ${lesson.title || lesson.id}`,
      status: statusFor(blocking, warnings),
      blocking,
      warnings,
      studentPackage: student,
      instructorPackage: {
        instructorNotes: instructorNotes ? relative(instructorRoot, instructorNotes) : null,
        answerKey: answerKey ? relative(instructorRoot, answerKey) : null,
        answerKeyNeeded
      }
    });
  }

  const counts = lessons.reduce((totals, lesson) => {
    totals[lesson.status] = (totals[lesson.status] || 0) + 1;
    return totals;
  }, {});

  const details = lessons.map((lesson) => {
    const missing = lesson.blocking.length ? ` | Missing: ${lesson.blocking.join("; ")}` : "";
    return `${lesson.status.toUpperCase()}: ${lesson.label}${missing}`;
  });

  return {
    tool: "lesson-readiness",
    title: "Check Lesson Readiness",
    status: resultStatus(lessons),
    summary: `${counts["Ready to Teach"] || 0} ready, ${counts["Almost Ready"] || 0} almost ready, ${counts["Needs Work"] || 0} need work, ${counts["Not Ready"] || 0} not ready.`,
    details,
    lessons,
    counts
  };
}
