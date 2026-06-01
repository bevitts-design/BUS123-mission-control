import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, normalize, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url"; // Change #1: Added import for URL to path conversions

const PORT = 8123;
const PUBLIC_PORT = 8124;
// Change #1: Using fileURLToPath to safely calculate the root directory path across different OS environments
const ROOT = fileURLToPath(new URL(".", import.meta.url));

// Change #2: Resolved user directory dynamically so it's not permanently frozen to a single profile string
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/Users/bethanyevittsair2";

const targets = {
  publicSite: "http://localhost:8124/",
  publicRepo: join(HOME_DIR, "Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology"),
  instructorRepo: join(HOME_DIR, "Documents/GitHub/BUS123-instructor"),
  courseMap: join(HOME_DIR, "Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology/course-map.json"),
  desktop: join(HOME_DIR, "Desktop"),
  brandTemplate: "https://drive.google.com/file/d/1xty2pm0baSDRKKT1ncCyrVWJrD29cDfm",
  projectInstructions: "https://docs.google.com/document/d/1OxAbv_Hpn7N8xT3Aw7YylfGPatpvmKLI4SZGk4_0m38/edit?usp=drivesdk"
};

const materialRoots = {
  public: targets.publicRepo,
  private: targets.instructorRepo
};

const scanExtensions = new Set([".html", ".xlsx", ".pdf", ".zip"]);
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

// Change #3 (Part A): Added logic handler function to explicitly check connection telemetry paths
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

async function handleGradingDryRun(request, response) {
  const body = await readRequestJson(request);
  const folderPath = String(body.folderPath || "");
  const assignment = String(body.assignment || "placeholder");

  if (!folderPath.startsWith(targets.desktop)) {
    sendJson(response, 400, { error: "For now, submissions must be inside the Desktop folder." });
    return;
  }

  sendJson(response, 200, {
    message: `Dry run ready for ${assignment}. Folder accepted: ${folderPath}. Next step is wiring this to the real grading script.`
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

    // Change #3 (Part B): Registered the status check API endpoint to interface with UI hooks
    if (request.method === "GET" && request.url === "/api/status") {
      await handleStatus(response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/open") {
      await handleOpen(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/grading/dry-run") {
      await handleGradingDryRun(request, response);
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
