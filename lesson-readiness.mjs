import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/Users/bethanyevittsair2";
const PUBLIC_REPO = join(HOME_DIR, "Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology");
const INSTRUCTOR_REPO = join(HOME_DIR, "Documents/GitHub/BUS123-instructor");
const PUBLIC_INDEX = join(PUBLIC_REPO, "index.html");
const REQUIREMENTS_PATH = join(ROOT, "data/lesson-requirements.json");
const REPORT_DIR = join(ROOT, "reports");
const JSON_REPORT = join(REPORT_DIR, "course-health.json");
const MARKDOWN_REPORT = join(REPORT_DIR, "course-health.md");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function decodeHtml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function parseLessons(html) {
  const lessons = [];
  const articlePattern = /<article\s+([^>]*data-lesson[^>]*)>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articlePattern.exec(html))) {
    const opening = match[1];
    const body = match[2];
    const lessonId = attribute(opening, "id");
    const track = attribute(opening, "data-track");
    const trackLabel = attribute(opening, "data-track-label");
    const status = attribute(opening, "data-status");
    const materials = attribute(opening, "data-materials").split(/\s+/).filter(Boolean);
    const code = stripTags(body.match(/<div class="code">([\s\S]*?)<\/div>/i)?.[1] || "");
    const title = stripTags(body.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || "");
    const businessCase = stripTags(body.match(/<div class="lesson-header">[\s\S]*?<\/div>\s*<p>([\s\S]*?)<\/p>/i)?.[1] || "");
    const skills = stripTags(body.match(/<div class="skills">([\s\S]*?)<\/div>/i)?.[1] || "");
    const links = [];
    const linkPattern = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    while ((linkMatch = linkPattern.exec(body))) {
      links.push({ href: decodeHtml(linkMatch[1]), label: stripTags(linkMatch[2]) });
    }

    lessons.push({ lessonId, track, trackLabel, status, materials, code, title, businessCase, skills, links });
  }

  return lessons;
}

async function walkFiles(root) {
  const files = [];
  if (!(await exists(root))) return files;

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "__MACOSX"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(full);
    }
  }

  await walk(root);
  return files;
}

function materialFlags(lesson) {
  const text = lesson.materials.join(" ").toLowerCase();
  return {
    slides: text.includes("slides"),
    reading: text.includes("reading"),
    workbook: text.includes("workbook"),
    interactive: text.includes("interactive"),
    homeworkProject: text.includes("homework") || text.includes("project")
  };
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function findPrivateMatch(files, lessonId, patterns) {
  const normalizedFiles = files.map(path => ({ path, name: normalizeName(basename(path, extname(path))) }));
  const normalizedId = normalizeName(lessonId);

  for (const pattern of patterns) {
    const expected = normalizeName(pattern.replace("{LESSON_ID}", lessonId).replace(extname(pattern), ""));
    const direct = normalizedFiles.find(file => file.name === expected);
    if (direct) return direct.path;
  }

  return normalizedFiles.find(file => file.name.includes(normalizedId))?.path || null;
}

function requiredState(requirement, present) {
  if (requirement !== "required") return { required: false, pass: true };
  return { required: true, pass: Boolean(present) };
}

function overallStatus(errors, warnings) {
  if (errors >= 3) return "Not Ready";
  if (errors >= 1) return "Needs Work";
  if (warnings >= 1) return "Almost Ready";
  return "Ready to Teach";
}

function scoreStatus(status) {
  return {
    "Ready to Teach": 100,
    "Almost Ready": 85,
    "Needs Work": 55,
    "Not Ready": 20
  }[status] || 0;
}

function markdownReport(report) {
  const lines = [
    "# BUS123 Course Health Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `- Lessons checked: **${report.summary.lessons}**`,
    `- Ready to Teach: **${report.summary.ready}**`,
    `- Almost Ready: **${report.summary.almostReady}**`,
    `- Needs Work: **${report.summary.needsWork}**`,
    `- Not Ready: **${report.summary.notReady}**`,
    `- Average readiness score: **${report.summary.averageScore}%**`,
    "",
    "## Lesson Results",
    "",
    "| Lesson | Status | Score | Missing required | Warnings |",
    "|---|---|---:|---|---|"
  ];

  for (const lesson of report.lessons) {
    const missing = lesson.errors.length ? lesson.errors.join("; ") : "—";
    const warnings = lesson.warnings.length ? lesson.warnings.join("; ") : "—";
    lines.push(`| ${lesson.code} — ${lesson.title} | ${lesson.overallStatus} | ${lesson.score}% | ${missing} | ${warnings} |`);
  }

  lines.push("", "## Details", "");
  for (const lesson of report.lessons) {
    lines.push(`### ${lesson.code} — ${lesson.title}`, "");
    lines.push(`**Overall:** ${lesson.overallStatus} (${lesson.score}%)`, "");
    lines.push(`- Student package: ${lesson.studentPackage.status}`);
    lines.push(`- Instructor package: ${lesson.instructorPackage.status}`);
    lines.push(`- Public links checked: ${lesson.studentPackage.linksChecked}`);
    if (lesson.errors.length) lines.push(`- Missing required: ${lesson.errors.join("; ")}`);
    if (lesson.warnings.length) lines.push(`- Warnings: ${lesson.warnings.join("; ")}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  if (!(await exists(PUBLIC_INDEX))) {
    throw new Error(`Public course index not found: ${PUBLIC_INDEX}`);
  }

  const [html, requirementsText, instructorFiles] = await Promise.all([
    readFile(PUBLIC_INDEX, "utf8"),
    readFile(REQUIREMENTS_PATH, "utf8"),
    walkFiles(INSTRUCTOR_REPO)
  ]);

  const requirements = JSON.parse(requirementsText);
  const lessons = parseLessons(html);
  const results = [];

  for (const lesson of lessons) {
    const errors = [];
    const warnings = [];
    const flags = materialFlags(lesson);
    const defaults = requirements.trackDefaults[lesson.track] || {};

    const linkResults = [];
    for (const link of lesson.links) {
      if (/^https?:\/\//i.test(link.href)) {
        linkResults.push({ ...link, exists: true, external: true });
        continue;
      }
      const path = join(PUBLIC_REPO, link.href);
      const linkExists = await exists(path);
      linkResults.push({ ...link, path, exists: linkExists, external: false });
      if (!linkExists) errors.push(`Missing public file: ${link.href}`);
    }

    for (const component of ["slides", "reading", "workbook", "homeworkProject"]) {
      const state = requiredState(defaults[component], flags[component]);
      if (state.required && !state.pass) errors.push(`Required ${component} is not listed`);
    }

    if (!lesson.links.length) errors.push("No student-facing material links");

    const notesMatch = findPrivateMatch(
      instructorFiles,
      lesson.lessonId,
      requirements.privateFilePatterns.instructorNotes
    );
    const answerKeyMatch = findPrivateMatch(
      instructorFiles,
      lesson.lessonId,
      requirements.privateFilePatterns.answerKey
    );

    if (!notesMatch) errors.push("Instructor notes guide not found");

    const answerKeyRequired = flags.workbook || flags.homeworkProject || flags.interactive;
    if (answerKeyRequired && !answerKeyMatch) errors.push("Answer key or completed file not found");

    if (!flags.interactive) warnings.push("No interactive activity listed");
    warnings.push("Canvas status not yet connected");
    warnings.push("QTI status not yet connected");

    const status = overallStatus(errors.length, warnings.length);
    const score = Math.max(0, scoreStatus(status) - Math.min(errors.length * 5, 20));

    results.push({
      lessonId: lesson.lessonId,
      code: lesson.code,
      title: lesson.title,
      track: lesson.trackLabel,
      overallStatus: status,
      score,
      errors,
      warnings,
      studentPackage: {
        status: linkResults.every(link => link.exists) && lesson.links.length ? "Complete" : "Missing Items",
        linksChecked: linkResults.length,
        links: linkResults
      },
      instructorPackage: {
        status: notesMatch && (!answerKeyRequired || answerKeyMatch) ? "Complete" : "Missing Items",
        instructorNotes: notesMatch ? relative(INSTRUCTOR_REPO, notesMatch) : null,
        answerKey: answerKeyMatch ? relative(INSTRUCTOR_REPO, answerKeyMatch) : null,
        answerKeyRequired
      },
      publishingPackage: {
        websiteStatus: lesson.status,
        canvasStatus: "Not audited",
        qtiStatus: "Not started"
      }
    });
  }

  const summary = {
    lessons: results.length,
    ready: results.filter(item => item.overallStatus === "Ready to Teach").length,
    almostReady: results.filter(item => item.overallStatus === "Almost Ready").length,
    needsWork: results.filter(item => item.overallStatus === "Needs Work").length,
    notReady: results.filter(item => item.overallStatus === "Not Ready").length,
    averageScore: results.length
      ? Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length)
      : 0
  };

  const report = {
    generatedAt: new Date().toISOString(),
    paths: { publicRepo: PUBLIC_REPO, instructorRepo: INSTRUCTOR_REPO },
    summary,
    lessons: results
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    writeFile(JSON_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(MARKDOWN_REPORT, markdownReport(report), "utf8")
  ]);

  console.log(`Course Health complete: ${summary.ready}/${summary.lessons} Ready to Teach`);
  console.log(`JSON report: ${JSON_REPORT}`);
  console.log(`Markdown report: ${MARKDOWN_REPORT}`);
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
