import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, relative, sep } from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 8123;
const PUBLIC_PORT = 8124;
const ROOT = fileURLToPath(new URL(".", import.meta.url));

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/Users/bethanyevittsair2";
const BUNDLED_PYTHON = join(HOME_DIR, ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3");

const targets = {
  publicSite: "http://localhost:8124/",
  publicRepo: join(HOME_DIR, "Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology"),
  instructorRepo: join(HOME_DIR, "Documents/GitHub/BUS123-instructor"),
  instructorGrading: join(HOME_DIR, "Documents/GitHub/BUS123-instructor/grading"),
  courseMap: join(HOME_DIR, "Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology/course-map.json"),
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

const scanExtensions = new Set([".html", ".xlsx", ".pdf", ".zip", ".docx"]);
const skippedDirs = new Set([".git", "assets", "tmp", "node_modules", "__MACOSX"]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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

// Helper to make sure paths remain strictly isolated inside their root tracking paths
function isPathInside(candidate, root) {
  const normalizedRoot = normalize(root);
  const normalizedCandidate = normalize(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function classifyMaterial(filePath) {
  const lower = basename(filePath).toLowerCase();
  const extension = extname(lower);

  if (extension === ".html" && lower.includes("slides")) return "slides";
  if (extension === ".xlsx" && lower.includes("starter")) return "excel-starter";
  if (extension === ".pdf" && (lower.includes("pre-reading") || lower.includes("prereading"))) return "pre-reading-pdf";
  if (extension === ".zip" && lower.includes("qti")) return "qti";
  if (extension === ".xlsx" && lower.includes("key")) return "activity-key";
  if (extension === ".docx" && lower.includes("activity-instructions")) return "activity-instructions";
  if (extension === ".pdf" && lower.includes("solution")) return "solution";
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
  return JSON.parse(await readFile(targets.courseMap, "utf8"));
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

    for (const material of publicMaterials) {
      const materialPath = join(targets.publicRepo, material.path || "");
      if (!material.path || !isPathInside(materialPath, targets.publicRepo)) {
        missingPublic.push(material.type || "Material");
        continue;
      }

      try {
        const materialStat = await stat(materialPath);
        if (!materialStat.isFile()) missingPublic.push(material.type || basename(material.path));
      } catch {
        missingPublic.push(material.type || basename(material.path || "material"));
      }
    }

    const instructorFolder = join(targets.instructorRepo, trackFolder, lesson.module || "");
    let instructorFolderExists = false;
    try {
      instructorFolderExists = (await stat(instructorFolder)).isDirectory();
    } catch {}

    const dashboardLesson = {
      id: lesson.id,
      key: lessonKey(lesson),
      title: lesson.title || lesson.id,
      status: lesson.status || "Unspecified",
      isCurrent: lesson.id === currentLessonId,
      isReleased: isReleased(lesson.status),
      caseStudy: lesson.caseStudy,
      skillFocus: lesson.skillFocus ?? [],
      materialCount: publicMaterials.length,
      missingPublic,
      privateArtifactCount: privateArtifacts.length,
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
  const lessons = moduleList.flatMap((module) => module.lessons);
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

async function handleCanvasWeekAhead(response) {
  const weekAheadPath = join(targets.publicRepo, "assets/canvas-week-ahead.json");

  try {
    const text = await readFile(weekAheadPath, "utf8");
    const data = JSON.parse(text);
    sendJson(response, 200, {
      ...data,
      sourcePath: relative(targets.publicRepo, weekAheadPath),
      available: true
    });
  } catch (error) {
    sendJson(response, 200, {
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
    });
  }
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
  const average = count
    ? rows.reduce((sum, row) => sum + Number(row.percent || 0), 0) / count
    : 0;

  return {
    count,
    reviewCount,
    averagePercent: Number(average.toFixed(1)),
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
