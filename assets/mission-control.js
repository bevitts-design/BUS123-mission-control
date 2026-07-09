const log = document.querySelector("#log");
const API_BASE = window.location.hostname === "127.0.0.1" && window.location.port === "8123"
  ? ""
  : "http://localhost:8123";
const materialState = {
  items: [],
  filtersReady: false
};
const instructorState = {
  dashboard: null,
  currentLessonId: "",
  currentFolderId: "",
  todayFolderId: "",
  selectedLessonId: "",
  lessons: []
};
const gradingState = {
  activities: []
};

const actions = {
  "open-canvas": { kind: "navigate", url: "https://endicott.instructure.com/courses/58218" },
  "open-canvas-calendar": { kind: "navigate", url: "https://endicott.instructure.com/calendar?include_contexts=course_58218" },
  "open-public-site": { kind: "navigate", url: "http://localhost:8124/" },
  "open-public-repo": { kind: "open", target: "publicRepo" },
  "open-instructor-repo": { kind: "open", target: "instructorRepo" },
  "open-course-map": { kind: "open", target: "courseMap" },
  "open-drive-template": { kind: "navigate", url: "https://drive.google.com/file/d/1xty2pm0baSDRKKT1ncCyrVWJrD29cDfm" },
  "open-project-instructions": { kind: "navigate", url: "https://docs.google.com/document/d/1OxAbv_Hpn7N8xT3Aw7YylfGPatpvmKLI4SZGk4_0m38/edit?usp=drivesdk" },
  "open-desktop": { kind: "open", target: "desktop" },
  "dry-run-grading": { kind: "grading" },
  "run-grading": { kind: "grading" },
  "refresh-materials": { kind: "refreshMaterials" },
  "refreshInstructor": { kind: "refreshInstructor" },
  "savePrepNotes": { kind: "savePrepNotes" },
  "setCurrentLesson": { kind: "setCurrentLesson" },
  "publishCourseMap": { kind: "publishCourseMap" },
  "openCurrentInstructorFolder": { kind: "openInstructorFolder" },
  "openTodayInstructorFolder": { kind: "openTodayInstructorFolder" }
};

function setActiveView(viewId) {
  const fallback = "today";
  const target = document.querySelector(`#${viewId}`) ? viewId : fallback;
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.viewLink === target);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active-view", view.id === target);
  });
  if (window.location.hash !== `#${target}`) history.replaceState(null, "", `#${target}`);
}

function setupViews() {
  document.querySelectorAll("[data-view-link], [data-view-target]").forEach((control) => {
    control.addEventListener("click", (event) => {
      const viewId = control.dataset.viewLink || control.dataset.viewTarget;
      if (!viewId) return;
      event.preventDefault();
      setActiveView(viewId);
    });
  });

  setActiveView(window.location.hash.replace("#", "") || "today");
}

function writeLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  log.textContent += `\n[${timestamp}] ${message}`;
  log.scrollTop = log.scrollHeight;
}

if (API_BASE) {
  writeLog(`API requests will use ${API_BASE}.`);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.trim().slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`Server returned non-JSON content (${response.status}): ${preview || "empty response"}`);
  }
}

async function postJson(url, payload) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

async function getJson(url) {
  const response = await fetch(`${API_BASE}${url}`);
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function labelFor(value) {
  return value
    ? value
      .replace(/-/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "";
}

function prepStorageKey(lessonId) {
  return `bus123-prep:${lessonId || "unassigned"}`;
}

function getPrepState(lessonId) {
  try {
    return JSON.parse(localStorage.getItem(prepStorageKey(lessonId))) || {};
  } catch {
    return {};
  }
}

function savePrepState(lessonId, state) {
  localStorage.setItem(prepStorageKey(lessonId), JSON.stringify(state));
}

function createStatusPill(label, state = "type") {
  const pill = document.createElement("span");
  pill.className = `pill ${state}`;
  pill.textContent = label;
  return pill;
}

function flattenedLessons(dashboard) {
  return dashboard.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id })));
}

function populateSelect(select, values, allLabel) {
  const current = select.value || "all";
  select.innerHTML = `<option value="all">${allLabel}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelFor(value);
    select.append(option);
  });
  select.value = [...select.options].some((option) => option.value === current) ? current : "all";
}

function activityOutputPath(activityId) {
  return `/Users/bethanyevittsair2/Desktop/BUS123 Grades/${activityId || "selected-activity"}`;
}

function renderGradingActivities() {
  const select = document.querySelector("#gradingActivity");
  const output = document.querySelector("#gradeOutputPath");
  const summary = document.querySelector("#gradingSummary");
  if (!select || !summary) return;

  select.innerHTML = "";
  if (!gradingState.activities.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No private graders found";
    select.append(option);
    summary.textContent = "No private grading rubrics were found in BUS123-instructor/grading/graders.";
    return;
  }

  gradingState.activities.forEach((activity) => {
    const option = document.createElement("option");
    option.value = activity.id;
    option.textContent = `${activity.id} - ${activity.title} (${activity.pointsPossible} pts)`;
    select.append(option);
  });

  if (output && !output.dataset.touched) output.value = activityOutputPath(select.value);
  summary.textContent = `${gradingState.activities.length} private grader${gradingState.activities.length === 1 ? "" : "s"} available.`;
}

async function loadGradingActivities() {
  const summary = document.querySelector("#gradingSummary");
  if (summary) summary.textContent = "Loading private grading workflows...";
  const data = await getJson("/api/grading/activities");
  gradingState.activities = data.activities || [];
  renderGradingActivities();
}

function renderMaterials() {
  const list = document.querySelector("#materialsList");
  const summary = document.querySelector("#materialsSummary");
  if (!list || !summary) return;

  const visibility = document.querySelector("#filterVisibility").value;
  const track = document.querySelector("#filterTrack").value;
  const module = document.querySelector("#filterModule").value;
  const lesson = document.querySelector("#filterLesson").value;
  const type = document.querySelector("#filterType").value;

  const filtered = materialState.items
    .filter((item) => {
      return (visibility === "all" || item.visibility === visibility)
        && (track === "all" || item.track === track)
        && (module === "all" || item.module === module)
        && (lesson === "all" || item.lesson === lesson)
        && (type === "all" || item.type === type);
    })
    .sort((a, b) => `${a.type}-${a.visibility}-${a.track}-${a.module}-${a.lesson}-${a.name}`
      .localeCompare(`${b.type}-${b.visibility}-${b.track}-${b.module}-${b.lesson}-${b.name}`));

  summary.textContent = `${filtered.length} of ${materialState.items.length} artifacts shown`;
  list.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "material-row";
    empty.textContent = "No materials match these filters.";
    list.append(empty);
    return;
  }

  let currentType = "";
  filtered.forEach((item) => {
    if (item.type !== currentType) {
      currentType = item.type;
      const group = document.createElement("div");
      group.className = "material-group";
      group.textContent = labelFor(item.type);
      list.append(group);
    }

    const row = document.createElement("article");
    row.className = "material-row";

    const details = document.createElement("div");
    const title = document.createElement("div");
    title.className = "material-title";
    title.innerHTML = `
      <span>${item.name}</span>
      <span class="pill ${item.visibility}">${labelFor(item.visibility)}</span>
      <span class="pill type">${labelFor(item.type)}</span>
    `;

    const meta = document.createElement("div");
    meta.className = "material-meta";
    meta.textContent = `${item.track} / ${labelFor(item.module)} / ${labelFor(item.lesson)} - ${item.relativePath}`;

    details.append(title, meta);

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = item.url ? "Preview" : "Open";
    openButton.dataset.materialId = item.id;

    row.append(details, openButton);
    list.append(row);
  });
}

function setupMaterialFilters() {
  const filterIds = ["filterVisibility", "filterTrack", "filterModule", "filterLesson", "filterType"];
  filterIds.forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("change", renderMaterials);
  });
}

async function loadMaterials() {
  const data = await getJson("/api/materials");
  materialState.items = data.materials || [];
  renderMaterials();
}

function renderCheckItems(container, items) {
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    container.textContent = "No items to display.";
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "check-item";
    row.innerHTML = `<strong>${item.title}</strong><span>${item.meta}</span><em class="${item.state}">${item.status}</em>`;
    container.append(row);
  }
}

function summarizeLessonPrivateArtifacts(lesson) {
  return Object.entries(lesson.privateArtifactsByType || {})
    .map(([type, count]) => `${count} ${labelFor(type)}`)
    .join(", ") || "No private artifacts";
}

function renderCurrentPrep(dashboard) {
  const lessons = flattenedLessons(dashboard);
  instructorState.lessons = lessons;
  const selected = lessons.find((lesson) => lesson.id === instructorState.selectedLessonId)
    || dashboard.currentLesson
    || lessons[0]
    || null;
  if (!selected) return;
  instructorState.currentLessonId = selected.id;
  instructorState.currentFolderId = selected.instructorFolderId || "";
  const title = document.querySelector("#currentLessonTitle");
  const meta = document.querySelector("#currentLessonMeta");
  if (title) title.textContent = selected.title;
  if (meta) meta.textContent = `${selected.key} · ${selected.status} · ${selected.materialCount} public materials`;
  const saved = getPrepState(selected.id);
  const status = document.querySelector("#prepStatus");
  const notes = document.querySelector("#prepNotes");
  if (status) status.value = saved.status || "not-started";
  if (notes) notes.value = saved.notes || "";
  const currentState = document.querySelector("#selectedCurrentState");
  if (currentState) currentState.textContent = selected.isCurrent ? "Current" : "Not current";
  const setCurrent = document.querySelector("#setCurrentLessonButton");
  if (setCurrent) setCurrent.disabled = selected.isCurrent;
  const openFolder = document.querySelector("#openCurrentInstructorFolder");
  if (openFolder) openFolder.disabled = !selected.instructorFolderId;
}

function renderModuleDashboard(dashboard) {
  const container = document.querySelector("#moduleDashboard");
  if (!container) return;
  container.innerHTML = "";
  for (const module of dashboard.modules) {
    const section = document.createElement("section");
    section.className = "module-card";
    const heading = document.createElement("h3");
    heading.textContent = `${module.track} ${module.module}`;
    section.append(heading);
    for (const lesson of module.lessons) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.lessonId = lesson.id;
      button.className = lesson.id === instructorState.currentLessonId ? "selected" : "";
      button.innerHTML = `<strong>${lesson.title}</strong><span>${lesson.status}</span>`;
      section.append(button);
    }
    container.append(section);
  }
}

function renderToday(dashboard) {
  const lesson = dashboard.currentLesson;
  if (!lesson) return;
  document.querySelector("#todayLessonKey").textContent = lesson.key;
  document.querySelector("#todayLessonTitle").textContent = lesson.title;
  document.querySelector("#todayLessonMeta").textContent = `${lesson.status} · ${lesson.materialCount} public materials · ${lesson.privateArtifactCount} private artifacts`;
  instructorState.todayFolderId = lesson.instructorFolderId || "";
  document.querySelector("#todayOpenInstructorFolder").disabled = !lesson.instructorFolderId;
}

function renderInstructorDashboard(dashboard) {
  instructorState.dashboard = dashboard;
  instructorState.currentLessonId = dashboard.currentLesson?.id || "";
  const summary = document.querySelector("#instructorSummary");
  summary.innerHTML = "";
  [
    ["Modules", dashboard.totals.modules],
    ["Lessons", dashboard.totals.lessons],
    ["Current", dashboard.totals.current],
    ["Needs review", dashboard.totals.needsReview],
    ["Private artifacts", dashboard.totals.privateArtifacts]
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    const metric = document.createElement("span");
    metric.className = "metric";
    metric.textContent = label;
    const count = document.createElement("strong");
    count.textContent = value;
    item.append(metric, count);
    summary.append(item);
  });

  renderCurrentPrep(dashboard);

  const canvasItems = dashboard.modules
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.privateArtifactsByType.qti || lesson.status === "Current")
    .map((lesson) => ({
      title: lesson.title,
      meta: `${lesson.key} · ${lesson.privateArtifactsByType.qti || 0} QTI package${lesson.privateArtifactsByType.qti === 1 ? "" : "s"}`,
      status: lesson.privateArtifactsByType.qti ? "Package ready" : "Needs review",
      state: lesson.privateArtifactsByType.qti ? "ready" : "review"
    }));
  renderCheckItems(document.querySelector("#canvasChecklist"), canvasItems);

  const gradingItems = dashboard.modules
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.privateArtifactsByType["activity-key"] || lesson.privateArtifactsByType.solution)
    .map((lesson) => ({
      title: lesson.title,
      meta: `${lesson.key} · ${summarizeLessonPrivateArtifacts(lesson)}`,
      status: "Instructor files",
      state: "ready"
    }));
  renderCheckItems(document.querySelector("#gradingQueue"), gradingItems);

  renderModuleDashboard(dashboard);
  renderToday(dashboard);
}

async function loadInstructorDashboard() {
  const summary = document.querySelector("#instructorSummary");
  if (!summary) return;

  summary.textContent = "Loading instructor dashboard...";
  const dashboard = await getJson("/api/instructor/dashboard");
  renderInstructorDashboard(dashboard);
}

function renderBuildToolResult(result) {
  const output = document.querySelector("#buildToolResult");
  if (!output) return;

  const lines = [
    result.title,
    result.summary,
    "",
    ...(result.details || [])
  ];
  output.textContent = lines.join("\n");
  output.dataset.status = result.status;
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = actions[button.dataset.action];
  if (!action) return;

  try {
    if (action.kind === "navigate") {
      window.location.href = action.url;
      return;
    }

    if (action.kind === "open") {
      const result = await postJson("/api/open", { target: action.target });
      writeLog(result.message);
      return;
    }

    if (action.kind === "grading") {
      const activityId = document.querySelector("#gradingActivity").value;
      const submissionsPath = document.querySelector("#submissionsPath").value;
      const outputPath = document.querySelector("#gradeOutputPath").value;
      button.disabled = true;
      button.textContent = "Running...";
      const result = await postJson("/api/grading/run", { activityId, submissionsPath, outputPath });
      const summary = result.summary;
      const averageLabel = summary.percentBasis === "auto" ? "Average auto score" : "Average";
      document.querySelector("#gradingSummary").textContent = [
        `${summary.count} submission${summary.count === 1 ? "" : "s"} graded.`,
        `${averageLabel}: ${summary.averagePercent}%.`,
        summary.reviewCount ? `${summary.reviewCount} flagged for manual review.` : "No manual review flags.",
        `Excel report: ${summary.reports.workbook}`,
        `Scores: ${summary.reports.scores}`
      ].join(" ");
      writeLog(`${result.message} Excel report: ${summary.reports.workbook}`);
    }

    if (action.kind === "refreshMaterials") {
      await loadMaterials();
      writeLog("Materials console refreshed.");
    }

    if (action.kind === "refreshInstructor") {
      await loadInstructorDashboard();
      writeLog("Instructor dashboard refreshed.");
    }

    if (action.kind === "savePrepNotes") {
      savePrepState(instructorState.currentLessonId, {
        status: document.querySelector("#prepStatus").value,
        notes: document.querySelector("#prepNotes").value,
        updatedAt: new Date().toISOString()
      });
      writeLog("Prep notes saved locally.");
    }

    if (action.kind === "setCurrentLesson") {
      const lessonId = instructorState.currentLessonId;
      if (!lessonId) throw new Error("Choose a lesson before setting the current lesson");
      button.disabled = true;
      button.textContent = "Updating...";
      const result = await postJson("/api/course/current-lesson", { lessonId });
      instructorState.dashboard = result.dashboard;
      instructorState.selectedLessonId = lessonId;
      renderInstructorDashboard(result.dashboard);
      const regenerationStatus = result.regeneration?.status || "unknown";
      writeLog(`Current lesson set to ${result.currentLessonTitle}. Index regeneration: ${regenerationStatus}. Publish to GitHub when ready.`);
    }

    if (action.kind === "publishCourseMap") {
      button.disabled = true;
      button.textContent = "Publishing...";
      const result = await postJson("/api/course/publish", {});
      if (result.dashboard) {
        instructorState.dashboard = result.dashboard;
        renderInstructorDashboard(result.dashboard);
      }
      writeLog(result.message);
      (result.details || []).forEach((detail) => writeLog(detail));
    }

    if (action.kind === "openInstructorFolder") {
      const result = await postJson("/api/instructor/folder/open", { folderId: instructorState.currentFolderId });
      writeLog(result.message);
    }

    if (action.kind === "openTodayInstructorFolder") {
      const result = await postJson("/api/instructor/folder/open", { folderId: instructorState.todayFolderId });
      writeLog(result.message);
    }
  } catch (error) {
    writeLog(`Error: ${error.message}. Make sure Mission Control is running at http://localhost:8123/.`);
  } finally {
    if (action.kind === "grading") {
      button.disabled = false;
      button.textContent = "Run Grader";
    }
    if (action.kind === "setCurrentLesson" && instructorState.dashboard) {
      renderInstructorDashboard(instructorState.dashboard);
    }
    if (action.kind === "publishCourseMap") {
      button.disabled = false;
      button.textContent = "Publish to GitHub";
    }
  }
});

document.querySelector("#gradingActivity")?.addEventListener("change", (event) => {
  const output = document.querySelector("#gradeOutputPath");
  if (output && !output.dataset.touched) output.value = activityOutputPath(event.target.value);
});

document.querySelector("#gradeOutputPath")?.addEventListener("input", (event) => {
  event.target.dataset.touched = "true";
});

document.addEventListener("click", (event) => {
  const picker = event.target.closest("[data-lesson-id]");
  if (!picker) return;
  instructorState.selectedLessonId = picker.dataset.lessonId;
  if (picker.dataset.viewTarget) setActiveView(picker.dataset.viewTarget);
  if (instructorState.dashboard) renderInstructorDashboard(instructorState.dashboard);
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-build-tool]");
  if (!button) return;

  const buttons = [...document.querySelectorAll("button[data-build-tool]")];
  const output = document.querySelector("#buildToolResult");
  buttons.forEach((item) => {
    item.disabled = true;
  });
  if (output) {
    output.textContent = `Running ${button.textContent}...`;
    output.dataset.status = "running";
  }

  try {
    const result = await postJson("/api/tools/run", { tool: button.dataset.buildTool });
    renderBuildToolResult(result);
    writeLog(result.summary);
    if (button.dataset.buildTool === "regenerate-index") await loadMaterials();
  } catch (error) {
    renderBuildToolResult({
      title: button.textContent,
      summary: `Error: ${error.message}`,
      status: "error",
      details: []
    });
    writeLog(`Build tool error: ${error.message}.`);
  } finally {
    buttons.forEach((item) => {
      item.disabled = false;
    });
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-material-id]");
  if (!button) return;

  try {
    const result = await postJson("/api/materials/open", { id: button.dataset.materialId });
    writeLog(result.message);
  } catch (error) {
    writeLog(`Error: ${error.message}.`);
  }
});

setupViews();
setupMaterialFilters();

loadMaterials().catch((error) => {
  writeLog(`Materials console error: ${error.message}.`);
  const summary = document.querySelector("#materialsSummary");
  if (summary) summary.textContent = "Materials console could not load.";
});

loadInstructorDashboard().catch((error) => {
  writeLog(`Instructor dashboard error: ${error.message}.`);
  const summary = document.querySelector("#instructorSummary");
  if (summary) summary.textContent = "Instructor dashboard could not load.";
});

loadCanvasWeekAhead().catch((error) => {
  writeLog(`Canvas week-ahead error: ${error.message}.`);
  renderCanvasWeekAhead({
    generatedAt: null,
    items: [],
    error: "Canvas week-ahead data could not load."
  });
});

loadGradingActivities().catch((error) => {
  writeLog(`Grading workflow error: ${error.message}.`);
  const summary = document.querySelector("#gradingSummary");
  if (summary) summary.textContent = "Private grading workflows could not load.";
});
