import { createServer } from "node:http";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, relative, sep } from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseGitStatus } from "./core/publishing.mjs";
import { buildTeachingWeek } from "./core/teaching-week.mjs";
import {
  applyVisibilityChanges,
  buildVisibilitySnapshot,
  courseMapRevision,
  lessonIsVisible,
  sha256,
  VisibilityUpdateError
} from "./core/visibility.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/Users/bethanyevittsair2";
const PORT = Number(process.env.BUS123_MISSION_PORT || 8123);
const PUBLIC_PORT = Number(process.env.BUS123_PUBLIC_PORT || 8124);
const BUNDLED_PYTHON = join(HOME_DIR, ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3");
const PUBLIC_REPO = process.env.BUS123_PUBLIC_REPO
  || join(HOME_DIR, "Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology");
const INSTRUCTOR_REPO = process.env.BUS123_INSTRUCTOR_REPO
  || join(HOME_DIR, "Documents/GitHub/BUS123-instructor");

const targets = {
  publicSite: `http://localhost:${PUBLIC_PORT}/`,
  publicRepo: PUBLIC_REPO,
  instructorRepo: INSTRUCTOR_REPO,
  instructorGrading: join(INSTRUCTOR_REPO, "grading"),
  courseMap: join(PUBLIC_REPO, "course-map.json"),
  desktop: join(HOME_DIR, "Desktop"),
  brandTemplate: "https://drive.google.com/file/d/1xty2pm0baSDRKKT1ncCyrVWJrD29cDfm",
  projectInstructions: "https://docs.google.com/document/d/1OxAbv_Hpn7N8xT3Aw7YylfGPatpvmKLI4SZGk4_0m38/edit?usp=drivesdk"
};

const materialRoots = {
  public: targets.publicRepo,
  private: targets.instructorRepo
};

const buildTools = {
  "validate-public": { script: "validate-public-materials.mjs" },
  "regenerate-index": { script: "regenerate-public-index.mjs" },
  "lesson-readiness": { script: "lesson-readiness.mjs" },
  "open-teaching-bundle": { script: "open-teaching-bundle.mjs", openTargets: true }
};

const publishPaths = ["course-map.json", "index.html", "scripts/build-index.mjs"];
const scanExtensions = new Set([".html", ".xlsx", ".pdf", ".zip", ".docx", ".md"]);
const skippedDirs = new Set([".git", "assets", "tmp", "node_modules", "__MACOSX"]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendOptions(response) {
  response.writeHead(204, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*"
  });
  response.end();
}

function sendRedirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function openTarget(target) {
  return new Promise((resolve, reject) => {
    const child = spawn("open", [target], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`open exited with code ${code}`));
    });
  });
}

function runCommand(command, args, options = {}) {
  const { preserveWhitespace = false, ...execOptions } = options;
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024, ...execOptions }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({
        stdout: preserveWhitespace ? stdout : stdout.trim(),
        stderr: preserveWhitespace ? stderr : stderr.trim()
      });
    });
  });
}

function runPublicGit(args, options = {}) {
  return runCommand("git", args, { cwd: targets.publicRepo, ...options });
}

function commandErrorMessage(error) {
  return String(error.stderr || error.stdout || error.message || "Unknown command error").trim();
}

// Helper to make sure paths remain strictly isolated inside their root tracking paths
function isPathInside(candidate, root) {
  const normalizedRoot = normalize(root);
  const normalizedCandidate = normalize(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

async function readOptionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeTextAtomically(path, text) {
  const temporaryPath = `${path}.mission-control-${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, text);
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function classifyMaterial(filePath) {
  const lower = basename(filePath).toLowerCase();
  const extension = extname(lower);

  if (lower.includes("instructor-notes") || lower.includes("teaching-guide") || lower.includes("lesson-guide")) return "instructor-notes";
  if (extension === ".html" && lower.includes("slides")) return "slides";
  if (extension === ".xlsx" && lower.includes("starter")) return "excel-starter";
  if (extension === ".pdf" && (lower.includes("pre-reading") || lower.includes("prereading"))) return "pre-reading-pdf";
  if (extension === ".zip" && lower.includes("qti")) return "qti";
  if (extension === ".xlsx" && lower.includes("key")) return "activity-key";
  if (extension === ".xlsx" && lower.includes("completed")) return "completed";
  if (extension === ".docx" && lower.includes("activity-instructions")) return "activity-instructions";
  if (lower.includes("solution")) return "solution";
  if (extension === ".html" && lower.includes("interactive")) return "interactive";
  return "other";
}

function parseCourseFields(relativePath, fileName) {
  const pathParts = relativePath.split(sep);
  const track = ["INTRO", "EXCEL", "MATH"].includes(pathParts[0]) ? pathParts[0] : "GENERAL";
  const moduleMatch = relativePath.match(/(?:^|[-/])m(\d{2})(?:[-/]|$)/i);
  const lessonMatch = fileName.match(/(?:^|-)l(\d{2})(?:-|\.|$)/i);

  return {
    track,
    module: moduleMatch ? `m${moduleMatch[1]}` : "unassigned",
    lesson: lessonMatch ? `l${lessonMatch[1]}` : "unassigned"
  };
}

async function scanMaterialsForRoot(root, visibility) {
  const materials = [];

  try {
    await stat(root);
  } catch {
    return []; // Return clean array if directory paths don't exist yet
  }

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skippedDirs.has(entry.name)) await walk(join(directory, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      if (entry.name.startsWith("~$")) continue;
      const filePath = join(directory, entry.name);
      const extension = extname(entry.name).toLowerCase();
      if (!scanExtensions.has(extension)) continue;

      const relativePath = relative(root, filePath);
      const type = classifyMaterial(filePath);
      const courseFields = parseCourseFields(relativePath, entry.name);
      const id = Buffer.from(`${visibility}:${relativePath}`).toString("base64url");
      const publicUrl = visibility === "public"
        ? `http://localhost:8124/${relativePath.split(sep).map(encodeURIComponent).join("/")}`
        : "";

      materials.push({
        id,
        visibility,
        type,
        name: entry.name,
        relativePath,
        absolutePath: filePath,
        url: publicUrl,
        ...courseFields
      });
    }
  }

  await walk(root);
  return materials;
}

async function getMaterials() {
  const collections = await Promise.all(
    Object.entries(materialRoots).map(([visibility, root]) => scanMaterialsForRoot(root, visibility))
  );

  return collections
    .flat()
    .sort((a, b) => `${a.visibility}-${a.track}-${a.module}-${a.lesson}-${a.type}-${a.name}`
      .localeCompare(`${b.visibility}-${b.track}-${b.module}-${b.lesson}-${b.type}-${b.name}`));
}

async function readCourseMap() {
  return (await readCourseMapSource()).courseMap;
}

async function readCourseMapSource() {
  const sourceText = await readFile(targets.courseMap, "utf8");
  return {
    sourceText,
    revision: courseMapRevision(sourceText),
    courseMap: JSON.parse(sourceText)
  };
}

async function writeCourseMap(courseMap) {
  await writeTextAtomically(targets.courseMap, `${JSON.stringify(courseMap, null, 2)}\n`);
}

function lessonKey(lesson) {
  return [
    String(lesson.track || "").toUpperCase(),
    lesson.module || "unassigned",
    lesson.lesson || "unassigned"
  ].join("/");
}

function isReleased(status) {
  return !/not released|coming soon|in progress/i.test(status || "");
}

function summarizeArtifacts(items) {
  return items.reduce((summary, item) => {
    summary[item.type] = (summary[item.type] || 0) + 1;
    return summary;
  }, {});
}

async function getInstructorDashboard() {
  const courseMap = await readCourseMap();
  const materials = await getMaterials();
  const tracksById = new Map((courseMap.tracks ?? []).map((track) => [track.id, track]));
  const currentLessonId = courseMap.course?.currentLessonId || "";
  const modules = new Map();

  for (const lesson of courseMap.lessons ?? []) {
    const track = tracksById.get(lesson.track) || {};
    const trackFolder = track.folder || String(lesson.track || "").toUpperCase();
    const moduleKey = `${trackFolder}/${lesson.module || "unassigned"}`;
    const publicMaterials = lesson.materials ?? [];
    const lessonValue = String(lesson.lesson || "").toLowerCase();
    const privateArtifacts = materials.filter((item) => {
      return item.visibility === "private"
        && item.track === trackFolder
        && item.module.toUpperCase() === String(lesson.module || "").toUpperCase()
        && (item.lesson === lessonValue || item.lesson === "unassigned");
    });
    const missingPublic = [];
    const publicArtifacts = [];

    for (const material of publicMaterials) {
      const materialPath = join(targets.publicRepo, material.path || "");
      let exists = false;
      if (!material.path || !isPathInside(materialPath, targets.publicRepo)) {
        missingPublic.push(material.type || "Material");
      } else {
        try {
          exists = (await stat(materialPath)).isFile();
        } catch {}
        if (!exists) missingPublic.push(material.type || basename(material.path || "material"));
      }

      publicArtifacts.push({
        type: material.type || "Material",
        path: material.path || "",
        exists,
        url: exists
          ? `${targets.publicSite}${String(material.path).split("/").map(encodeURIComponent).join("/")}`
          : ""
      });
    }

    const instructorFolder = join(targets.instructorRepo, trackFolder, lesson.module || "");
    let instructorFolderExists = false;
    try {
      instructorFolderExists = (await stat(instructorFolder)).isDirectory();
    } catch {}

    const dashboardLesson = {
      id: lesson.id,
      track: lesson.track,
      key: lessonKey(lesson),
      title: lesson.title || lesson.id,
      status: lesson.status || "Unspecified",
      displayOrder: lesson.displayOrder,
      isCurrent: lesson.id === currentLessonId,
      isVisible: lessonIsVisible(lesson),
      isReleased: isReleased(lesson.status),
      caseStudy: lesson.caseStudy,
      skillFocus: lesson.skillFocus ?? [],
      materialCount: publicMaterials.length,
      publicArtifacts,
      missingPublic,
      privateArtifactCount: privateArtifacts.length,
      privateArtifacts: privateArtifacts.map(({ absolutePath, ...artifact }) => artifact),
      privateArtifactsByType: summarizeArtifacts(privateArtifacts),
      instructorFolderExists,
      instructorFolderId: instructorFolderExists ? Buffer.from(instructorFolder).toString("base64url") : ""
    };

    if (!modules.has(moduleKey)) {
      modules.set(moduleKey, {
        id: moduleKey,
        track: track.label || trackFolder,
        trackFolder,
        module: lesson.module || "Unassigned",
        lessons: [],
        counts: { ready: 0, review: 0, current: 0 }
      });
    }

    const module = modules.get(moduleKey);
    module.lessons.push(dashboardLesson);
    if (dashboardLesson.isCurrent) module.counts.current += 1;
    if (dashboardLesson.missingPublic.length || !dashboardLesson.instructorFolderExists) module.counts.review += 1;
    else module.counts.ready += 1;
  }

  const moduleList = [...modules.values()].sort((a, b) => a.id.localeCompare(b.id));
  const dashboardLessonsById = new Map(
    moduleList.flatMap((module) => module.lessons).map((lesson) => [lesson.id, lesson])
  );
  const lessons = (courseMap.lessons ?? [])
    .map((lesson) => dashboardLessonsById.get(lesson.id))
    .filter(Boolean);
  return {
    course: courseMap.course,
    currentLesson: lessons.find((lesson) => lesson.isCurrent) || null,
    totals: {
      modules: moduleList.length,
      lessons: lessons.length,
      current: lessons.filter((lesson) => lesson.isCurrent).length,
      needsReview: lessons.filter((lesson) => lesson.missingPublic.length || !lesson.instructorFolderExists).length,
      privateArtifacts: materials.filter((item) => item.visibility === "private").length
    },
    lessons,
    modules: moduleList
  };
}

async function handleStatus(response) {
  let publicConnected = false;
  let instructorDetected = false;

  try {
    const publicStat = await stat(targets.publicRepo);
    publicConnected = publicStat.isDirectory();
  } catch {}

  try {
    const instructorStat = await stat(targets.instructorRepo);
    instructorDetected = instructorStat.isDirectory();
  } catch {}

  sendJson(response, 200, { publicConnected, instructorDetected });
}

async function handleInstructorDashboard(response) {
  sendJson(response, 200, await getInstructorDashboard());
}

async function getCourseVisibilitySnapshot() {
  const source = await readCourseMapSource();
  return buildVisibilitySnapshot(source.courseMap, { revision: source.revision });
}

async function handleCourseVisibility(response) {
  sendJson(response, 200, await getCourseVisibilitySnapshot());
}

async function handleCourseVisibilityUpdate(request, response) {
  const body = await readRequestJson(request);
  const source = await readCourseMapSource();

  if (!body.revision || body.revision !== source.revision) {
    sendJson(response, 409, {
      error: "course-map.json changed after this visibility view loaded. Reload the lesson list before saving so newer work is not overwritten.",
      code: "stale-course-map"
    });
    return;
  }

  let update;
  try {
    update = applyVisibilityChanges(source.courseMap, body.changes);
  } catch (error) {
    const statusCode = error instanceof VisibilityUpdateError && error.code === "stale-lesson" ? 409 : 400;
    sendJson(response, statusCode, {
      error: error.message,
      code: error.code || "invalid-visibility-change"
    });
    return;
  }

  const publicIndexPath = join(targets.publicRepo, "index.html");
  const originalIndex = await readOptionalFile(publicIndexPath);
  let courseMapWritten = false;

  try {
    await writeCourseMap(update.courseMap);
    courseMapWritten = true;
    const regeneration = await runBuildToolScript(buildTools["regenerate-index"].script);
    if (regeneration.status === "error") {
      throw new Error(regeneration.summary || "Public index regeneration failed.");
    }

    sendJson(response, 200, {
      status: "saved",
      message: `Saved ${update.applied.length} lesson visibility change${update.applied.length === 1 ? "" : "s"} and rebuilt the student homepage locally. Nothing was committed or pushed.`,
      applied: update.applied,
      regeneration,
      visibility: await getCourseVisibilitySnapshot()
    });
  } catch (error) {
    const rollbackErrors = [];
    if (courseMapWritten) {
      try {
        await writeTextAtomically(targets.courseMap, source.sourceText);
      } catch (rollbackError) {
        rollbackErrors.push(`course-map rollback failed: ${rollbackError.message}`);
      }
    }
    if (originalIndex) {
      try {
        await writeFile(publicIndexPath, originalIndex);
      } catch (rollbackError) {
        rollbackErrors.push(`index rollback failed: ${rollbackError.message}`);
      }
    }

    sendJson(response, 500, {
      error: rollbackErrors.length
        ? `Save and rebuild failed, and rollback needs attention. ${error.message} ${rollbackErrors.join(" ")}`
        : `Save and rebuild failed, so the course map and generated homepage were restored. ${error.message}`,
      code: rollbackErrors.length ? "rollback-incomplete" : "save-rolled-back"
    });
  }
}

async function handleCurrentLessonUpdate(request, response) {
  const body = await readRequestJson(request);
  const nextLessonId = String(body.lessonId || "").trim();
  const source = await readCourseMapSource();
  const courseMap = source.courseMap;
  const lessons = courseMap.lessons ?? [];
  const nextLesson = lessons.find((lesson) => lesson.id === nextLessonId);

  if (!nextLesson) {
    sendJson(response, 400, { error: "Choose a valid lesson before updating the current lesson." });
    return;
  }

  if (!lessonIsVisible(nextLesson)) {
    sendJson(response, 409, {
      error: "A hidden lesson cannot become the current student lesson. Turn its visibility on and save first."
    });
    return;
  }

  const previousLessonId = courseMap.course?.currentLessonId || "";
  if (!courseMap.course) courseMap.course = {};
  courseMap.course.currentLessonId = nextLesson.id;
  const publicIndexPath = join(targets.publicRepo, "index.html");
  const originalIndex = await readOptionalFile(publicIndexPath);
  let regeneration;

  try {
    await writeCourseMap(courseMap);
    regeneration = await runBuildToolScript(buildTools["regenerate-index"].script);
    if (regeneration.status === "error") throw new Error(regeneration.summary);
  } catch (error) {
    const rollbackErrors = [];
    try {
      await writeTextAtomically(targets.courseMap, source.sourceText);
    } catch (rollbackError) {
      rollbackErrors.push(`course-map rollback failed: ${rollbackError.message}`);
    }
    if (originalIndex) {
      try {
        await writeFile(publicIndexPath, originalIndex);
      } catch (rollbackError) {
        rollbackErrors.push(`index rollback failed: ${rollbackError.message}`);
      }
    }
    sendJson(response, 500, {
      error: rollbackErrors.length
        ? `Current-lesson rebuild failed and rollback needs attention. ${error.message} ${rollbackErrors.join(" ")}`
        : `Current lesson was not changed because the public rebuild failed. ${error.message}`
    });
    return;
  }

  const dashboard = await getInstructorDashboard();

  sendJson(response, 200, {
    previousLessonId,
    currentLessonId: nextLesson.id,
    currentLessonTitle: nextLesson.title || nextLesson.id,
    regeneration,
    dashboard
  });
}

async function publicPathFingerprint(changes) {
  const fingerprints = [];
  for (const change of changes) {
    const filePath = join(targets.publicRepo, change.path);
    let digest = "missing";
    try {
      const file = await stat(filePath);
      digest = file.isFile() ? sha256(await readFile(filePath)) : "directory";
    } catch (error) {
      if (error.code !== "ENOENT") digest = `unreadable:${error.code || error.message}`;
    }
    fingerprints.push({ status: change.status, path: change.path, digest });
  }
  return fingerprints;
}

async function collectCoursePublishPreflight({ refreshRemote = true, rebuild = true } = {}) {
  const checks = [];
  const blockers = [];
  const addCheck = (title, state, detail) => {
    const check = { title, state, detail };
    checks.push(check);
    if (state === "blocked") blockers.push(check);
  };

  let regeneration = null;
  if (rebuild) {
    try {
      regeneration = await runBuildToolScript(buildTools["regenerate-index"].script);
      addCheck(
        "Rebuild and validation",
        regeneration.status === "error" ? "blocked" : "passed",
        regeneration.status === "warning"
          ? `${regeneration.summary} Non-blocking warnings remain visible in Tools.`
          : regeneration.summary
      );
    } catch (error) {
      addCheck("Rebuild and validation", "blocked", commandErrorMessage(error));
    }
  }

  if (refreshRemote) {
    try {
      await runPublicGit(["fetch", "origin", "main"]);
      addCheck("Remote refresh", "passed", "Fetched origin/main before reviewing synchronization.");
    } catch (error) {
      addCheck("Remote refresh", "blocked", `Could not fetch origin/main: ${commandErrorMessage(error)}`);
    }
  }

  let status = [];
  let branch = "";
  let upstream = "";
  let headSHA = "";
  let originSHA = "";
  let remoteURL = "";
  let ahead = null;
  let behind = null;

  try {
    status = parseGitStatus(
      (await runPublicGit(["status", "--porcelain=v1"], { preserveWhitespace: true })).stdout,
      publishPaths
    );
    branch = (await runPublicGit(["branch", "--show-current"])).stdout;
    headSHA = (await runPublicGit(["rev-parse", "--short", "HEAD"])).stdout;
    remoteURL = (await runPublicGit(["remote", "get-url", "origin"])).stdout;
    try {
      upstream = (await runPublicGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).stdout;
    } catch {}
    try {
      originSHA = (await runPublicGit(["rev-parse", "--short", "origin/main"])).stdout;
      const counts = (await runPublicGit(["rev-list", "--left-right", "--count", "HEAD...origin/main"])).stdout
        .split(/\s+/)
        .map(Number);
      [ahead, behind] = counts;
    } catch {}
  } catch (error) {
    addCheck("Git repository", "blocked", commandErrorMessage(error));
  }

  addCheck(
    "Branch",
    branch === "main" ? "passed" : "blocked",
    branch === "main" ? "Publishing target is main." : branch ? `Current branch is ${branch}; switch to main before publishing.` : "The checkout is in detached HEAD state."
  );
  addCheck(
    "Upstream",
    upstream === "origin/main" ? "passed" : "blocked",
    upstream === "origin/main" ? "main tracks origin/main." : `Expected origin/main, found ${upstream || "no upstream"}.`
  );
  addCheck(
    "Synchronization",
    ahead === 0 && behind === 0 ? "passed" : "blocked",
    ahead === null || behind === null
      ? "Could not compare HEAD with origin/main."
      : ahead === 0 && behind === 0
        ? "Local main matches the fetched origin/main before publication."
        : `Local main is ${ahead} commit${ahead === 1 ? "" : "s"} ahead and ${behind} commit${behind === 1 ? "" : "s"} behind origin/main.`
  );

  const requiredPaths = ["course-map.json", "index.html", "scripts/build-index.mjs"];
  const missingRequired = [];
  for (const path of requiredPaths) {
    try {
      const file = await stat(join(targets.publicRepo, path));
      if (!file.isFile()) missingRequired.push(path);
    } catch {
      missingRequired.push(path);
    }
  }
  addCheck(
    "Required public sources",
    missingRequired.length ? "blocked" : "passed",
    missingRequired.length ? `Missing: ${missingRequired.join(", ")}.` : "Course map, generated homepage, and homepage builder are present."
  );

  const stagedChanges = status.filter((item) => item.staged);
  addCheck(
    "Existing staged work",
    stagedChanges.length ? "blocked" : "passed",
    stagedChanges.length
      ? `Pre-staged paths must be reviewed outside Mission Control first: ${stagedChanges.map((item) => item.path).join(", ")}.`
      : "The Git index is clean; Mission Control has not inherited someone else's staged scope."
  );

  const includedChanges = status.filter((item) => item.publishPath);
  const excludedChanges = status.filter((item) => !item.publishPath);
  const deletedIncluded = includedChanges.filter((item) => item.deleted);
  addCheck(
    "Reviewed publication scope",
    deletedIncluded.length ? "blocked" : includedChanges.length ? "passed" : "info",
    deletedIncluded.length
      ? `Mission Control will not publish deleted required paths: ${deletedIncluded.map((item) => item.path).join(", ")}.`
      : includedChanges.length
        ? `${includedChanges.length} allowed path${includedChanges.length === 1 ? "" : "s"} will be staged only after confirmation.`
        : "No BUS123 course-map or generated-homepage changes are waiting to publish."
  );
  addCheck(
    "Excluded local work",
    "info",
    excludedChanges.length
      ? `${excludedChanges.length} unrelated path${excludedChanges.length === 1 ? " is" : "s are"} excluded and will remain untouched.`
      : "No unrelated public-repository changes were detected."
  );

  const workspaceFingerprint = await publicPathFingerprint(status);
  const reviewToken = sha256(JSON.stringify({
    branch,
    upstream,
    headSHA,
    originSHA,
    workspaceFingerprint
  }));

  return {
    generatedAt: new Date().toISOString(),
    canPublish: blockers.length === 0 && includedChanges.length > 0,
    reviewToken,
    repository: {
      path: targets.publicRepo,
      branch,
      upstream,
      headSHA,
      originSHA,
      remoteURL,
      ahead,
      behind
    },
    checks,
    blockers,
    includedChanges: includedChanges.map(({ path, displayStatus, status: code }) => ({ path, displayStatus, code })),
    excludedChanges: excludedChanges.map(({ path, displayStatus, status: code, staged }) => ({ path, displayStatus, code, staged })),
    regeneration
  };
}

async function handleCoursePublishPreflight(response) {
  sendJson(response, 200, await collectCoursePublishPreflight({ refreshRemote: true, rebuild: true }));
}

function validCommitMessage(value) {
  return value.length >= 5 && value.length <= 120 && !/[\r\n]/.test(value);
}

async function handleCoursePublish(request, response) {
  const body = await readRequestJson(request);
  const reviewToken = String(body.reviewToken || "");
  const commitMessage = String(body.commitMessage || "").trim();

  if (body.confirmed !== true) {
    sendJson(response, 400, { error: "Publishing requires an explicit confirmation from the reviewed preflight screen." });
    return;
  }
  if (!reviewToken) {
    sendJson(response, 400, { error: "Run publishing preflight before confirming publication." });
    return;
  }
  if (!validCommitMessage(commitMessage)) {
    sendJson(response, 400, { error: "Enter a one-line commit message between 5 and 120 characters." });
    return;
  }

  const preflight = await collectCoursePublishPreflight({ refreshRemote: true, rebuild: true });
  if (!preflight.canPublish) {
    sendJson(response, 409, {
      error: "Publishing safety checks no longer pass. Review the refreshed preflight before trying again.",
      preflight
    });
    return;
  }
  if (preflight.reviewToken !== reviewToken) {
    sendJson(response, 409, {
      error: "The reviewed files or repository state changed after preflight. Review the refreshed scope and confirm again.",
      preflight
    });
    return;
  }

  const reviewedPaths = preflight.includedChanges.map((item) => item.path).sort();
  let commit = "";
  try {
    await runPublicGit(["add", "--", ...reviewedPaths]);
    const stagedPaths = (await runPublicGit(["diff", "--cached", "--name-only"])).stdout
      .split("\n")
      .map((path) => path.trim())
      .filter(Boolean)
      .sort();
    if (JSON.stringify(stagedPaths) !== JSON.stringify(reviewedPaths)) {
      await runPublicGit(["restore", "--staged", "--", ...reviewedPaths]).catch(() => {});
      sendJson(response, 409, {
        error: `Staged paths did not exactly match the reviewed scope. Expected ${reviewedPaths.join(", ") || "none"}; found ${stagedPaths.join(", ") || "none"}. No commit was created.`
      });
      return;
    }

    await runPublicGit(["commit", "-m", commitMessage, "--", ...reviewedPaths]);
    commit = (await runPublicGit(["rev-parse", "--short", "HEAD"])).stdout;
    await runPublicGit(["push", "origin", "main"]);

    sendJson(response, 200, {
      status: "published",
      message: `Commit ${commit} was pushed to origin/main. GitHub Pages deployment is separate and may still be running.`,
      branch: "main",
      commit,
      publishedPaths: reviewedPaths,
      dashboard: await getInstructorDashboard(),
      visibility: await getCourseVisibilitySnapshot()
    });
  } catch (error) {
    if (!commit) {
      await runPublicGit(["restore", "--staged", "--", ...reviewedPaths]).catch(() => {});
    }
    sendJson(response, 500, {
      error: commit
        ? `Commit ${commit} was created locally, but the push did not complete: ${commandErrorMessage(error)}. Do not retry blindly; inspect synchronization first.`
        : `Publish stopped before a commit was created: ${commandErrorMessage(error)}.`
    });
  }
}

async function getCanvasWeekAhead() {
  const weekAheadPath = join(targets.publicRepo, "assets/canvas-week-ahead.json");

  try {
    const text = await readFile(weekAheadPath, "utf8");
    const data = JSON.parse(text);
    return {
      ...data,
      sourcePath: relative(targets.publicRepo, weekAheadPath),
      available: true
    };
  } catch (error) {
    return {
      generatedAt: null,
      source: "Canvas Calendar iCal",
      courseId: "58218",
      courseMatch: "BUS123",
      timezone: "America/New_York",
      windowDays: 7,
      items: [],
      sourcePath: relative(targets.publicRepo, weekAheadPath),
      available: false,
      error: `Could not read public week-ahead data: ${error.message}`
    };
  }
}

async function handleCanvasWeekAhead(response) {
  sendJson(response, 200, await getCanvasWeekAhead());
}

async function handleInstructorFolderOpen(request, response) {
  const body = await readRequestJson(request);
  const folderPath = Buffer.from(String(body.folderId || ""), "base64url").toString("utf8");

  if (!folderPath || !isPathInside(folderPath, targets.instructorRepo)) {
    sendJson(response, 403, { error: "Folder is outside the instructor repository." });
    return;
  }

  try {
    const folderStat = await stat(folderPath);
    if (!folderStat.isDirectory()) throw new Error("Not a folder");
  } catch {
    sendJson(response, 404, { error: "Instructor folder not found." });
    return;
  }

  await openTarget(folderPath);
  sendJson(response, 200, { message: `Opened instructor folder: ${relative(targets.instructorRepo, folderPath) || "root"}.` });
}

async function handleOpen(request, response) {
  const body = await readRequestJson(request);
  const target = targets[body.target];
  if (!target) {
    sendJson(response, 400, { error: "Unknown target." });
    return;
  }

  await openTarget(target);
  sendJson(response, 200, { message: `Opened ${body.target}.` });
}

function safeActivityId(value) {
  const activityId = String(value || "");
  return /^[a-z0-9][a-z0-9-]*$/.test(activityId) ? activityId : "";
}

async function getGradingActivities() {
  const gradersRoot = join(targets.instructorGrading, "graders");
  const activities = [];

  try {
    const entries = await readdir(gradersRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const activityId = safeActivityId(entry.name);
      if (!activityId) continue;

      const rubricPath = join(gradersRoot, activityId, "rubric.json");
      try {
        const rubric = JSON.parse(await readFile(rubricPath, "utf8"));
        activities.push({
          id: activityId,
          title: rubric.title || activityId,
          pointsPossible: rubric.points_possible || 0,
          rubricPath: relative(targets.instructorRepo, rubricPath)
        });
      } catch {}
    }
  } catch {}

  return activities.sort((a, b) => a.id.localeCompare(b.id));
}

async function handleGradingActivities(response) {
  sendJson(response, 200, { activities: await getGradingActivities() });
}

async function handleTeachingWeek(response) {
  const [dashboard, gradingActivities, canvasWeekAhead] = await Promise.all([
    getInstructorDashboard(),
    getGradingActivities(),
    getCanvasWeekAhead()
  ]);
  sendJson(response, 200, buildTeachingWeek({
    dashboard,
    gradingActivities,
    canvasWeekAhead,
    now: new Date()
  }));
}

function defaultGradeOutputPath(activityId) {
  return join(targets.desktop, "BUS123 Grades", activityId);
}

function resolveUserPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "~") return HOME_DIR;
  if (raw.startsWith("~/")) return join(HOME_DIR, raw.slice(2));
  return normalize(raw);
}

function validateSubmissionFolder(folderPath) {
  if (!folderPath || !isPathInside(folderPath, targets.desktop)) {
    return "Submissions must be in a folder on the Desktop.";
  }
  return "";
}

function validateOutputFolder(folderPath) {
  const defaultRoot = join(targets.desktop, "BUS123 Grades");
  const privateOutputRoot = join(targets.instructorGrading, "output");
  if (!folderPath || (!isPathInside(folderPath, defaultRoot) && !isPathInside(folderPath, privateOutputRoot))) {
    return "Output must be inside Desktop/BUS123 Grades or the private grading/output folder.";
  }
  return "";
}

function runGradingScript({ activityId, submissionsPath, outputPath }) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(targets.instructorGrading, "scripts", "grade_activity.py");
    execFile(BUNDLED_PYTHON, [
      scriptPath,
      "--activity", activityId,
      "--submissions", submissionsPath,
      "--out", outputPath
    ], { cwd: targets.instructorRepo, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (character === "\"") {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}

async function summarizeScores(outputPath) {
  const scoresPath = join(outputPath, "scores.csv");
  const feedbackPath = join(outputPath, "feedback.csv");
  const auditPath = join(outputPath, "audit.json");
  const workbookPath = join(outputPath, "grade-report.xlsx");
  const text = await readFile(scoresPath, "utf8");
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0] || "");
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });

  const count = rows.length;
  const reviewCount = rows.filter((row) => row.manual_review === "yes").length;
  const percentBasis = rows.find((row) => row.percent_basis)?.percent_basis || "overall";
  const average = count
    ? rows.reduce((sum, row) => sum + Number(row.percent || 0), 0) / count
    : 0;

  return {
    count,
    reviewCount,
    averagePercent: Number(average.toFixed(1)),
    percentBasis,
    reports: {
      workbook: workbookPath,
      scores: scoresPath,
      feedback: feedbackPath,
      audit: auditPath
    }
  };
}

async function handleGradingRun(request, response) {
  const body = await readRequestJson(request);
  const activityId = safeActivityId(body.activityId);
  if (!activityId) {
    sendJson(response, 400, { error: "Choose a valid grading activity." });
    return;
  }

  const rubricPath = join(targets.instructorGrading, "graders", activityId, "rubric.json");
  if (!isPathInside(rubricPath, join(targets.instructorGrading, "graders"))) {
    sendJson(response, 403, { error: "Grading activity is outside the private graders folder." });
    return;
  }

  try {
    const rubricStat = await stat(rubricPath);
    if (!rubricStat.isFile()) throw new Error("Missing rubric");
  } catch {
    sendJson(response, 404, { error: "Private grading rubric not found." });
    return;
  }

  const submissionsPath = resolveUserPath(body.submissionsPath);
  const outputPath = resolveUserPath(body.outputPath) || defaultGradeOutputPath(activityId);
  const submissionError = validateSubmissionFolder(submissionsPath);
  const outputError = validateOutputFolder(outputPath);
  if (submissionError || outputError) {
    sendJson(response, 400, { error: submissionError || outputError });
    return;
  }

  try {
    const submissionsStat = await stat(submissionsPath);
    if (!submissionsStat.isDirectory()) throw new Error("Not a directory");
  } catch {
    sendJson(response, 404, { error: "Submissions folder not found." });
    return;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const run = await runGradingScript({ activityId, submissionsPath, outputPath });
  const summary = await summarizeScores(outputPath);

  sendJson(response, 200, {
    activityId,
    message: run.stdout || `Graded ${summary.count} submission(s).`,
    summary
  });
}

async function handleMaterials(response) {
  const materials = await getMaterials();
  sendJson(response, 200, {
    materials: materials.map(({ absolutePath, ...material }) => material)
  });
}

async function handleMaterialOpen(request, response) {
  const body = await readRequestJson(request);
  const materials = await getMaterials();
  const material = materials.find((item) => item.id === body.id);

  if (!material) {
    sendJson(response, 404, { error: "Material not found." });
    return;
  }

  const root = materialRoots[material.visibility];
  if (!root || !isPathInside(material.absolutePath, root)) {
    sendJson(response, 403, { error: "Material is outside allowed course folders." });
    return;
  }

  await openTarget(material.url || material.absolutePath);
  sendJson(response, 200, { message: `Opened ${material.name}.` });
}

function runBuildToolScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(ROOT, "scripts", scriptName);
    execFile(process.execPath, [
      scriptPath,
      "--public-root", targets.publicRepo,
      "--instructor-root", targets.instructorRepo
    ], { cwd: ROOT, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Build tool returned invalid output: ${stdout.trim() || stderr.trim() || "no output"}`));
      }
    });
  });
}

async function handleBuildToolRun(request, response) {
  const body = await readRequestJson(request);
  const tool = buildTools[body.tool];
  if (!tool) {
    sendJson(response, 400, { error: "Unknown build tool." });
    return;
  }

  const result = await runBuildToolScript(tool.script);
  if (tool.openTargets && result.status !== "error") {
    for (const target of result.openTargets ?? []) {
      await openTarget(target.path);
    }
  }

  sendJson(response, 200, result);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(ROOT, requestedPath));

  if (!filePath.startsWith(normalize(ROOT))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function servePublicStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${PUBLIC_PORT}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = normalize(join(targets.publicRepo, requestedPath));

  if (!isPathInside(filePath, targets.publicRepo)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendOptions(response);
      return;
    }

    if (request.method === "GET" && (request.url === "/api" || request.url === "/api/")) {
      sendRedirect(response, "/");
      return;
    }

    if (request.method === "GET" && request.url === "/api/status") {
      await handleStatus(response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/instructor/dashboard") {
      await handleInstructorDashboard(response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/teaching/week") {
      await handleTeachingWeek(response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/course/visibility") {
      await handleCourseVisibility(response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/course/visibility") {
      await handleCourseVisibilityUpdate(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/course/current-lesson") {
      await handleCurrentLessonUpdate(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/course/publish-preflight") {
      await handleCoursePublishPreflight(response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/course/publish") {
      await handleCoursePublish(request, response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/canvas/week-ahead") {
      await handleCanvasWeekAhead(response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/open") {
      await handleOpen(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/grading/dry-run") {
      await handleGradingRun(request, response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/grading/activities") {
      await handleGradingActivities(response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/grading/run") {
      await handleGradingRun(request, response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/materials") {
      await handleMaterials(response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/materials/open") {
      await handleMaterialOpen(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/instructor/folder/open") {
      await handleInstructorFolderOpen(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/tools/run") {
      await handleBuildToolRun(request, response);
      return;
    }

    if (request.method === "GET") {
      await serveStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`BUS123 Mission Control running at http://localhost:${PORT}/`);
});

const publicServer = createServer(async (request, response) => {
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      await servePublicStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  } catch {
    response.writeHead(500);
    response.end("Internal server error");
  }
});

publicServer.listen(PUBLIC_PORT, "127.0.0.1", () => {
  console.log(`BUS123 public preview running at http://localhost:${PUBLIC_PORT}/`);
});
