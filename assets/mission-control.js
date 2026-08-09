import {
  CANVAS_MANUAL_WORKFLOW_WARNING,
  classifyStudentMaterials,
  evaluateLessonReadiness,
  isAnswerKeyRequired
} from "../core/readiness.mjs";

const log = document.querySelector("#log");
const API_BASE = ["http:", "https:"].includes(window.location.protocol)
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
const teachingState = {
  data: null,
  loading: false,
  error: ""
};
const visibilityState = {
  snapshot: null,
  draft: new Map(),
  search: "",
  preflight: null
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
  "refreshTeachingWeek": { kind: "refreshTeachingWeek" },
  "savePrepNotes": { kind: "savePrepNotes" },
  "saveAfterClassHandoff": { kind: "saveAfterClassHandoff" },
  "setCurrentLesson": { kind: "setCurrentLesson" },
  "refreshVisibility": { kind: "refreshVisibility" },
  "saveVisibility": { kind: "saveVisibility" },
  "discardVisibility": { kind: "discardVisibility" },
  "runPublishPreflight": { kind: "runPublishPreflight" },
  "requestCoursePublish": { kind: "requestCoursePublish" },
  "confirmCoursePublish": { kind: "confirmCoursePublish" },
  "cancelCoursePublish": { kind: "cancelCoursePublish" },
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
    const error = new Error(data.error || "Request failed.");
    error.data = data;
    throw error;
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

function selectedLesson(dashboard) {
  const lessons = flattenedLessons(dashboard);
  return lessons.find((lesson) => lesson.id === instructorState.selectedLessonId)
    || dashboard.currentLesson
    || lessons[0]
    || null;
}

function setWorkflowNotice(id, message = "", state = "info") {
  const notice = document.querySelector(`#${id}`);
  if (!notice) return;
  notice.hidden = !message;
  notice.textContent = message;
  notice.dataset.state = state;
}

function visibilityPendingChanges() {
  if (!visibilityState.snapshot) return [];
  return visibilityState.snapshot.lessons
    .map((lesson) => ({
      lesson,
      visible: visibilityState.draft.get(lesson.id) ?? lesson.visible
    }))
    .filter(({ lesson, visible }) => visible !== lesson.visible);
}

function visibleAfterSaveCount() {
  if (!visibilityState.snapshot) return 0;
  return visibilityState.snapshot.lessons
    .filter((lesson) => visibilityState.draft.get(lesson.id) ?? lesson.visible)
    .length;
}

function invalidatePublishPreflight() {
  visibilityState.preflight = null;
  setWorkflowNotice("publishNotice");
  renderPublishPreflight();
}

function setVisibilitySnapshot(snapshot) {
  visibilityState.snapshot = snapshot;
  visibilityState.draft = new Map(snapshot.lessons.map((lesson) => [lesson.id, lesson.visible]));
  visibilityState.preflight = null;
  setWorkflowNotice("publishNotice");
  renderVisibility();
  renderPublishPreflight();
}

function lessonMatchesVisibilitySearch(lesson, group, query) {
  if (!query) return true;
  return [
    lesson.key,
    lesson.title,
    lesson.status,
    lesson.trackLabel,
    lesson.module,
    lesson.caseStudy,
    ...(lesson.skillFocus || []),
    group.label
  ].filter(Boolean).join(" ").toLowerCase().includes(query);
}

function visibilityBadge(label, state = "") {
  const badge = document.createElement("span");
  badge.className = `visibility-status ${state}`.trim();
  badge.textContent = label;
  return badge;
}

function renderVisibilityGroups() {
  const container = document.querySelector("#visibilityGroups");
  const count = document.querySelector("#visibilityCount");
  if (!container || !count) return;
  container.innerHTML = "";

  const snapshot = visibilityState.snapshot;
  if (!snapshot) {
    count.textContent = "Course map unavailable";
    container.textContent = "Mission Control could not load lesson visibility.";
    return;
  }

  const query = visibilityState.search.trim().toLowerCase();
  let shown = 0;
  for (const group of snapshot.groups) {
    const lessons = group.lessons.filter((lesson) => lessonMatchesVisibilitySearch(lesson, group, query));
    if (!lessons.length) continue;
    shown += lessons.length;

    const section = document.createElement("section");
    section.className = "visibility-group";
    const heading = document.createElement("div");
    heading.className = "visibility-group-heading";
    const title = document.createElement("h3");
    title.textContent = group.label;
    const groupCount = document.createElement("span");
    groupCount.textContent = `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`;
    heading.append(title, groupCount);
    section.append(heading);

    for (const lesson of lessons) {
      const desiredVisible = visibilityState.draft.get(lesson.id) ?? lesson.visible;
      const changed = desiredVisible !== lesson.visible;
      const card = document.createElement("article");
      card.className = `visibility-card${changed ? " pending-change" : ""}`;

      const details = document.createElement("div");
      const badges = document.createElement("div");
      badges.className = "visibility-card-badges";
      badges.append(visibilityBadge(lesson.status));
      if (lesson.isCurrent) badges.append(visibilityBadge("Current lesson", "current"));
      badges.append(visibilityBadge(desiredVisible ? "Visible after save" : "Hidden after save", desiredVisible ? "visible" : "hidden"));
      const name = document.createElement("h4");
      name.textContent = lesson.title;
      const meta = document.createElement("p");
      meta.textContent = [lesson.key, lesson.caseStudy, changed ? "Pending local change" : "Matches saved source"]
        .filter(Boolean)
        .join(" · ");
      details.append(badges, name, meta);

      const switchLabel = document.createElement("label");
      switchLabel.className = "visibility-switch";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.role = "switch";
      toggle.checked = desiredVisible;
      toggle.disabled = lesson.isCurrent && desiredVisible;
      toggle.setAttribute("aria-label", `${lesson.title} visibility`);
      if (lesson.isCurrent && desiredVisible) {
        toggle.title = "The current lesson must stay visible. Make another lesson current before hiding it.";
      }
      const toggleText = document.createElement("span");
      toggleText.className = "visibility-switch-text";
      toggleText.textContent = desiredVisible ? "On" : "Off";
      toggle.addEventListener("change", () => {
        visibilityState.draft.set(lesson.id, toggle.checked);
        invalidatePublishPreflight();
        setWorkflowNotice("visibilityNotice");
        renderVisibility();
      });
      switchLabel.append(toggle, toggleText);

      card.append(details, switchLabel);
      section.append(card);
    }
    container.append(section);
  }

  count.textContent = `${shown} shown · ${visibleAfterSaveCount()} of ${snapshot.totals.lessons} visible after save`;
  if (!shown) {
    const empty = document.createElement("div");
    empty.className = "preflight-empty";
    empty.textContent = "No lessons match this search.";
    container.append(empty);
  }
}

function renderVisibilityPending() {
  const summary = document.querySelector("#pendingVisibilitySummary");
  const list = document.querySelector("#pendingVisibilityList");
  const saveButton = document.querySelector("#saveVisibilityButton");
  const discardButton = document.querySelector("#discardVisibilityButton");
  const refreshButton = document.querySelector("#refreshVisibilityButton");
  const preflightButton = document.querySelector("#runPublishPreflightButton");
  if (!summary || !list) return;

  const changes = visibilityPendingChanges();
  list.innerHTML = "";
  summary.classList.toggle("has-changes", changes.length > 0);
  summary.textContent = changes.length
    ? `${changes.length} pending change${changes.length === 1 ? "" : "s"}. After save: ${visibleAfterSaveCount()} lessons visible.`
    : `No pending changes. ${visibleAfterSaveCount()} lessons are visible in the saved source.`;

  for (const change of changes) {
    const row = document.createElement("div");
    row.className = "pending-change-row";
    const action = document.createElement("strong");
    action.textContent = `${change.visible ? "Show" : "Hide"} ${change.lesson.key}`;
    const title = document.createElement("span");
    title.textContent = change.lesson.title;
    row.append(action, title);
    list.append(row);
  }

  if (saveButton) saveButton.disabled = !changes.length;
  if (discardButton) discardButton.disabled = !changes.length;
  if (refreshButton) {
    refreshButton.disabled = changes.length > 0;
    refreshButton.title = changes.length ? "Save or discard the pending draft before reloading." : "Reload course-map.json";
  }
  if (preflightButton) {
    preflightButton.disabled = changes.length > 0 || !visibilityState.snapshot;
    preflightButton.title = changes.length ? "Save or discard the pending visibility draft before preflight." : "Rebuild, validate, fetch origin/main, and review scope";
  }
}

function renderVisibility() {
  renderVisibilityGroups();
  renderVisibilityPending();
}

async function loadCourseVisibility() {
  const snapshot = await getJson("/api/course/visibility");
  setVisibilitySnapshot(snapshot);
  return snapshot;
}

function appendPreflightPath(container, item, included) {
  const row = document.createElement("div");
  row.className = `preflight-path${included ? " included" : ""}`;
  const status = document.createElement("span");
  status.textContent = item.displayStatus;
  const path = document.createElement("span");
  path.textContent = item.path;
  row.append(status, path);
  container.append(row);
}

function renderPublishPreflight() {
  const container = document.querySelector("#publishPreflight");
  const publishButton = document.querySelector("#requestCoursePublishButton");
  const commitInput = document.querySelector("#publishCommitMessage");
  if (!container || !publishButton || !commitInput) return;
  const pending = visibilityPendingChanges();
  const preflight = visibilityState.preflight;
  const commitMessage = commitInput.value.trim();
  publishButton.disabled = !preflight?.canPublish || pending.length > 0 || commitMessage.length < 5 || commitMessage.length > 120 || /[\r\n]/.test(commitMessage);
  container.innerHTML = "";

  if (!preflight) {
    const empty = document.createElement("div");
    empty.className = "preflight-empty";
    empty.textContent = pending.length
      ? "Save or discard the pending lesson-visibility draft before running preflight."
      : "Preflight has not run. Review the repository state before publishing.";
    container.append(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "preflight-summary";
  [
    ["Repository", preflight.repository.path],
    ["Branch", preflight.repository.branch || "Detached"],
    ["Upstream", preflight.repository.upstream || "Unavailable"],
    ["Synchronization", preflight.repository.ahead === 0 && preflight.repository.behind === 0
      ? "Matches origin/main"
      : `${preflight.repository.ahead ?? "?"} ahead / ${preflight.repository.behind ?? "?"} behind`]
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = label;
    const detail = document.createElement("strong");
    detail.textContent = value;
    item.append(name, detail);
    summary.append(item);
  });
  container.append(summary);

  const columns = document.createElement("div");
  columns.className = "preflight-columns";
  const checksColumn = document.createElement("section");
  const checksTitle = document.createElement("h3");
  checksTitle.className = "preflight-section-title";
  checksTitle.textContent = "Safety and validation";
  const checks = document.createElement("div");
  checks.className = "preflight-checks";
  for (const check of preflight.checks) {
    const row = document.createElement("div");
    row.className = "preflight-check";
    row.dataset.state = check.state;
    const title = document.createElement("strong");
    title.textContent = `${check.state === "passed" ? "Passed" : check.state === "blocked" ? "Blocked" : "Info"}: ${check.title}`;
    const detail = document.createElement("span");
    detail.textContent = check.detail;
    row.append(title, detail);
    checks.append(row);
  }
  checksColumn.append(checksTitle, checks);

  const pathsColumn = document.createElement("section");
  const includedTitle = document.createElement("h3");
  includedTitle.className = "preflight-section-title";
  includedTitle.textContent = `Included after confirmation (${preflight.includedChanges.length})`;
  const included = document.createElement("div");
  included.className = "preflight-paths";
  if (preflight.includedChanges.length) {
    preflight.includedChanges.forEach((item) => appendPreflightPath(included, item, true));
  } else {
    const empty = document.createElement("div");
    empty.className = "preflight-empty";
    empty.textContent = "Nothing to publish.";
    included.append(empty);
  }
  pathsColumn.append(includedTitle, included);

  if (preflight.excludedChanges.length) {
    const excludedTitle = document.createElement("h3");
    excludedTitle.className = "preflight-section-title";
    excludedTitle.textContent = `Excluded and untouched (${preflight.excludedChanges.length})`;
    excludedTitle.style.marginTop = "1rem";
    const excluded = document.createElement("div");
    excluded.className = "preflight-paths";
    preflight.excludedChanges.forEach((item) => appendPreflightPath(excluded, item, false));
    pathsColumn.append(excludedTitle, excluded);
  }

  columns.append(checksColumn, pathsColumn);
  container.append(columns);
  setWorkflowNotice(
    "publishNotice",
    preflight.canPublish
      ? "Preflight passed. Review the included paths and commit message, then use Review and Publish for the final confirmation."
      : preflight.blockers.length
        ? `${preflight.blockers.length} publishing blocker${preflight.blockers.length === 1 ? "" : "s"} must be resolved. No files were staged, committed, or pushed.`
        : "Preflight found no reviewed changes to publish.",
    preflight.canPublish ? "success" : preflight.blockers.length ? "error" : "warning"
  );
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
  const selected = selectedLesson(dashboard);
  if (!selected) return;
  instructorState.currentLessonId = selected.id;
  instructorState.currentFolderId = selected.instructorFolderId || "";
  const title = document.querySelector("#currentLessonTitle");
  const meta = document.querySelector("#currentLessonMeta");
  if (title) title.textContent = selected.title;
  if (meta) meta.textContent = `${selected.key} · ${selected.status} · ${selected.isVisible ? "Visible on student site" : "Hidden from student site"} · ${selected.materialCount} public materials`;
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

function renderLessonWorkspace(dashboard) {
  const lesson = selectedLesson(dashboard);
  const title = document.querySelector("#lessonWorkspaceTitle");
  const key = document.querySelector("#lessonWorkspaceKey");
  const meta = document.querySelector("#lessonWorkspaceMeta");
  const list = document.querySelector("#lessonWorkspaceStudentMaterials");
  const instructorList = document.querySelector("#lessonWorkspaceInstructorMaterials");
  const publishingList = document.querySelector("#lessonWorkspacePublishingStatus");
  if (!title || !key || !meta || !list || !instructorList || !publishingList) return;

  if (!lesson) {
    key.textContent = "No lesson selected";
    title.textContent = "Lesson Workspace";
    meta.textContent = "Choose a lesson from the Instructor view.";
    list.textContent = "No student materials to display.";
    instructorList.textContent = "No instructor materials to display.";
    publishingList.textContent = "No publishing status to display.";
    return;
  }

  key.textContent = lesson.key;
  title.textContent = lesson.title;
  meta.textContent = [
    lesson.status,
    lesson.caseStudy,
    `${lesson.materialCount} student material${lesson.materialCount === 1 ? "" : "s"}`
  ].filter(Boolean).join(" · ");

  list.innerHTML = "";
  renderInstructorPackage(lesson, instructorList);
  renderPublishingPackage(lesson, publishingList);
  if (!lesson.publicArtifacts?.length) {
    list.textContent = "No student materials are listed in the course map.";
    return;
  }

  for (const artifact of lesson.publicArtifacts) {
    const row = document.createElement("div");
    row.className = "workspace-material-row";

    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = artifact.type;
    const path = document.createElement("span");
    path.textContent = artifact.path || "No file path listed";
    details.append(name, path);

    const status = document.createElement(artifact.url ? "a" : "span");
    status.className = `pill ${artifact.exists ? "ready" : "review"}`;
    status.textContent = artifact.exists ? "Open" : "Missing";
    if (artifact.url) {
      status.href = artifact.url;
      status.target = "_blank";
      status.rel = "noreferrer";
    }

    row.append(details, status);
    list.append(row);
  }

}

function workspacePillClass(state) {
  if (["Available", "Ready", "Ready to Teach"].includes(state)) return "ready";
  if (["Missing", "Needs Work", "Not Ready"].includes(state)) return "review";
  return "type";
}

function createInstructorMaterialRow({ label, detail, state, materialId = "" }) {
  const row = document.createElement("div");
  row.className = "workspace-material-row";

  const details = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = label;
  const meta = document.createElement("span");
  meta.textContent = detail;
  details.append(name, meta);

  const status = document.createElement(materialId ? "button" : "span");
  status.className = `pill ${workspacePillClass(state)}`;
  status.textContent = materialId ? "Open" : state;
  if (materialId) {
    status.type = "button";
    status.dataset.materialId = materialId;
  }

  row.append(details, status);
  return row;
}

function renderInstructorPackage(lesson, container) {
  container.innerHTML = "";
  const artifacts = lesson.privateArtifacts || [];
  const notes = artifacts.find((artifact) => artifact.type === "instructor-notes");
  const answerTypes = new Set(["activity-key", "solution", "completed"]);
  const answer = artifacts.find((artifact) => answerTypes.has(artifact.type));
  const answerKeyRequired = isAnswerKeyRequired(classifyStudentMaterials(lesson.publicArtifacts || []));

  container.append(createInstructorMaterialRow({
    label: "Instructor Notes Guide",
    detail: notes?.relativePath || "Required private teaching guide not found",
    state: notes ? "Available" : "Missing",
    materialId: notes?.id
  }));

  container.append(createInstructorMaterialRow({
    label: "Answer Key / Completed File",
    detail: answer?.relativePath || (answerKeyRequired ? "Required for this lesson's student activity" : "No answer key required for listed student materials"),
    state: answer ? "Available" : answerKeyRequired ? "Missing" : "Not required",
    materialId: answer?.id
  }));

  const additional = artifacts.filter((artifact) => artifact.id !== notes?.id && artifact.id !== answer?.id);
  for (const artifact of additional) {
    container.append(createInstructorMaterialRow({
      label: labelFor(artifact.type),
      detail: artifact.relativePath,
      state: "Available",
      materialId: artifact.id
    }));
  }
}

function renderPublishingPackage(lesson, container) {
  container.innerHTML = "";
  const publicArtifacts = lesson.publicArtifacts || [];
  const privateArtifacts = lesson.privateArtifacts || [];
  const websiteReady = publicArtifacts.length > 0 && publicArtifacts.every((artifact) => artifact.exists);
  const qti = privateArtifacts.find((artifact) => artifact.type === "qti");
  const answerTypes = new Set(["activity-key", "solution", "completed"]);
  const readiness = evaluateLessonReadiness({
    track: lesson.track,
    publicArtifacts,
    instructorNotes: privateArtifacts.some((artifact) => artifact.type === "instructor-notes"),
    answerKey: privateArtifacts.some((artifact) => answerTypes.has(artifact.type)),
    canvasConnected: false,
    qtiAvailable: Boolean(qti)
  });

  container.append(createInstructorMaterialRow({
    label: "Website",
    detail: websiteReady
      ? "All listed student files are available"
      : publicArtifacts.length
        ? `${lesson.missingPublic?.length || 0} listed student file${lesson.missingPublic?.length === 1 ? "" : "s"} missing`
        : "No student materials are listed in the course map",
    state: websiteReady ? "Ready" : "Needs Work"
  }));

  container.append(createInstructorMaterialRow({
    label: "Canvas",
    detail: `${CANVAS_MANUAL_WORKFLOW_WARNING}.`,
    state: "Manual workflow"
  }));

  container.append(createInstructorMaterialRow({
    label: "Canvas New Quiz / QTI",
    detail: qti?.relativePath || "No QTI package found in the private lesson folder",
    state: qti ? "Available" : "Not generated"
  }));

  container.append(createInstructorMaterialRow({
    label: "Overall Readiness",
    detail: readiness.blocking.length
      ? readiness.blocking.join("; ")
      : "Required Student and Instructor Package components are available",
    state: readiness.status
  }));
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
      button.innerHTML = `<strong>${lesson.title}</strong><span>${lesson.status} · ${lesson.isVisible ? "Visible" : "Hidden"}</span>`;
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
  renderLessonWorkspace(dashboard);

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

function formatLocalUpdate(value) {
  const updated = new Date(value || "");
  if (Number.isNaN(updated.getTime())) return "";
  return ` Saved ${updated.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${updated.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`;
}

function localizeTeachingStep(lesson, step) {
  const saved = getPrepState(lesson.id);
  if (step.id === "prep-notes") {
    const status = saved.status || "not-started";
    const statusMap = {
      ready: ["Ready", "ready"],
      drafting: ["In progress", "attention"],
      "needs-canvas": ["Needs Canvas", "attention"],
      "not-started": ["Not started", "neutral"]
    };
    const [label, state] = statusMap[status] || [labelFor(status), "neutral"];
    return {
      ...step,
      status: label,
      state,
      detail: `${saved.notes?.trim() ? "Private prep notes are saved." : "No private prep notes are saved yet."}${formatLocalUpdate(saved.updatedAt)}`
    };
  }

  if (step.id === "after-class") {
    const hasHandoff = Boolean(saved.handoff?.trim());
    return {
      ...step,
      status: hasHandoff ? "Saved" : "After class",
      state: hasHandoff ? "ready" : "neutral",
      detail: hasHandoff
        ? `Private handoff saved in this lesson's existing prep record.${formatLocalUpdate(saved.handoffUpdatedAt)}`
        : step.detail
    };
  }

  return step;
}

function localTeachingExceptions(data) {
  const exceptions = [];
  for (const lesson of data.lessons || []) {
    const saved = getPrepState(lesson.id);
    const status = saved.status || "not-started";
    const hasExplicitState = Boolean(saved.status);
    if (status === "ready") continue;
    if (lesson.sequence !== 0 && !hasExplicitState) continue;

    const needsCanvas = status === "needs-canvas";
    exceptions.push({
      id: `${lesson.id}:prep-local`,
      lessonId: lesson.id,
      sequence: lesson.sequence,
      severity: "attention",
      category: needsCanvas ? "canvas" : "prep",
      title: needsCanvas
        ? `${lesson.title} is marked Needs Canvas`
        : `${lesson.title} prep is ${status === "drafting" ? "still in progress" : "not marked ready"}`,
      detail: needsCanvas
        ? "Complete the needed action in Canvas manually, then update the existing lesson prep status."
        : "Review the private prep notes and mark the lesson Ready for class when preparation is complete.",
      targetView: "instructor"
    });
  }
  return exceptions;
}

function teachingExceptions(data) {
  const rank = { blocker: 0, attention: 1 };
  return [...(data.exceptions || []), ...localTeachingExceptions(data)].sort((a, b) => {
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)
      || (a.sequence ?? 99) - (b.sequence ?? 99)
      || a.title.localeCompare(b.title);
  });
}

function teachingActionButton({ label, lessonId = "", targetView = "", action = "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "weekly-step-action";
  button.textContent = label;
  if (lessonId) button.dataset.teachLessonId = lessonId;
  if (targetView) button.dataset.teachTargetView = targetView;
  if (action) button.dataset.action = action;
  return button;
}

function weeklyStepActionLabel(step) {
  if (step.id === "student-package") return "Review student files";
  if (step.id === "instructor-package") return "Review private files";
  if (step.id === "prep-notes") return "Open prep notes";
  if (step.id === "canvas") return "Open Canvas Calendar";
  if (step.id === "activity-grader") return "Open grading";
  return "Review";
}

function renderWeeklyStep(lesson, rawStep) {
  const step = localizeTeachingStep(lesson, rawStep);
  const item = document.createElement("li");
  item.className = "weekly-step";
  item.dataset.state = step.state;

  const number = document.createElement("span");
  number.className = "weekly-step-number";
  number.textContent = step.order;
  number.setAttribute("aria-hidden", "true");

  const details = document.createElement("div");
  details.className = "weekly-step-details";
  const titleRow = document.createElement("div");
  titleRow.className = "weekly-step-title";
  const title = document.createElement("strong");
  title.textContent = step.title;
  const status = document.createElement("span");
  status.className = `weekly-step-status ${step.state}`;
  status.textContent = step.status;
  titleRow.append(title, status);
  const detail = document.createElement("p");
  detail.textContent = step.detail;
  details.append(titleRow, detail);

  const actionArea = document.createElement("div");
  actionArea.className = "weekly-step-actions";
  if (step.id === "after-class") {
    const saved = getPrepState(lesson.id);
    const label = document.createElement("label");
    label.htmlFor = `handoff-${lesson.id}`;
    label.textContent = "Private handoff note";
    const input = document.createElement("textarea");
    input.id = `handoff-${lesson.id}`;
    input.rows = 2;
    input.maxLength = 600;
    input.placeholder = "What worked, what needs follow-up, or what to adjust next time?";
    input.value = saved.handoff || "";
    const save = teachingActionButton({ label: "Save Handoff" });
    save.dataset.action = "saveAfterClassHandoff";
    save.dataset.handoffLessonId = lesson.id;
    save.setAttribute("aria-label", `Save after-class handoff for ${lesson.title}`);
    label.append(input);
    actionArea.append(label, save);
  } else if (step.action) {
    actionArea.append(teachingActionButton({
      label: weeklyStepActionLabel(step),
      action: step.action
    }));
  } else if (step.targetView && !(step.id === "activity-grader" && step.hasActivity === false)) {
    actionArea.append(teachingActionButton({
      label: weeklyStepActionLabel(step),
      lessonId: lesson.id,
      targetView: step.targetView
    }));
  }

  item.append(number, details);
  if (actionArea.childElementCount) item.append(actionArea);
  return item;
}

function renderWeeklyLesson(lesson) {
  const card = document.createElement("article");
  card.className = "weekly-lesson-card";
  if (lesson.isCurrent) card.classList.add("current");

  const header = document.createElement("header");
  const heading = document.createElement("div");
  const sequence = document.createElement("span");
  sequence.className = "weekly-sequence";
  sequence.textContent = lesson.sequenceLabel;
  const title = document.createElement("h3");
  title.textContent = lesson.title;
  const meta = document.createElement("p");
  meta.textContent = `${lesson.key} · ${lesson.status || "Unspecified"} · ${lesson.isVisible ? "Visible" : "Hidden"}`;
  heading.append(sequence, title, meta);
  const readiness = document.createElement("span");
  readiness.className = `weekly-readiness ${lesson.readiness.status === "Ready to Teach" ? "ready" : "blocker"}`;
  readiness.textContent = lesson.readiness.status;
  header.append(heading, readiness);

  const list = document.createElement("ol");
  list.className = "weekly-step-list";
  list.setAttribute("aria-label", `Preparation steps for ${lesson.title}`);
  for (const step of lesson.steps || []) list.append(renderWeeklyStep(lesson, step));
  card.append(header, list);
  return card;
}

function exceptionActionLabel(item) {
  if (item.category === "canvas") return "Open Canvas Calendar";
  if (item.category === "grader") return "Open grading";
  if (["visibility", "release"].includes(item.category)) return "Review visibility";
  if (item.category === "prep") return "Open prep notes";
  return "Review lesson";
}

function renderExceptionQueue(data) {
  const queue = document.querySelector("#exceptionQueue");
  const summary = document.querySelector("#exceptionSummary");
  const count = document.querySelector("#exceptionCount");
  if (!queue || !summary || !count) return;

  const exceptions = teachingExceptions(data);
  const blockers = exceptions.filter((item) => item.severity === "blocker").length;
  count.textContent = exceptions.length;
  count.setAttribute("aria-label", `${exceptions.length} exception${exceptions.length === 1 ? "" : "s"}`);
  summary.textContent = exceptions.length
    ? `${blockers} blocker${blockers === 1 ? "" : "s"} and ${exceptions.length - blockers} action${exceptions.length - blockers === 1 ? "" : "s"} need review. Routine ready items stay out of this queue.`
    : "No actionable exceptions in the current three-lesson scope. Continue through each class checklist.";
  queue.innerHTML = "";
  queue.setAttribute("aria-busy", "false");

  if (!exceptions.length) {
    const empty = document.createElement("div");
    empty.className = "exception-empty";
    empty.innerHTML = "<strong>Queue clear</strong><span>Required packages and maintained status checks have no current exceptions.</span>";
    queue.append(empty);
    return;
  }

  for (const item of exceptions) {
    const card = document.createElement("article");
    card.className = `exception-item ${item.severity}`;
    const label = document.createElement("span");
    label.className = "exception-label";
    label.textContent = item.severity === "blocker" ? "Blocker" : labelFor(item.category);
    const title = document.createElement("h3");
    title.textContent = item.title;
    const detail = document.createElement("p");
    detail.textContent = item.detail;
    card.append(label, title, detail);
    if (item.action || item.targetView) {
      const action = teachingActionButton({
        label: exceptionActionLabel(item),
        lessonId: item.lessonId,
        targetView: item.targetView,
        action: item.action
      });
      action.setAttribute("aria-label", `${exceptionActionLabel(item)}: ${item.title}`);
      card.append(action);
    }
    queue.append(card);
  }
}

function renderTeachingWeek(data) {
  teachingState.data = data;
  teachingState.error = "";
  const lessons = document.querySelector("#teachWeekLessons");
  const scope = document.querySelector("#teachWeekScope");
  const count = document.querySelector("#teachWeekLessonCount");
  if (!lessons || !scope || !count) return;

  scope.textContent = `${data.scope} Package and status checks are derived from the current public and private repositories.`;
  count.textContent = `${data.lessons?.length || 0} class${data.lessons?.length === 1 ? "" : "es"}`;
  lessons.innerHTML = "";
  lessons.setAttribute("aria-busy", "false");
  setWorkflowNotice("teachWeekNotice");

  if (!data.lessons?.length) {
    const empty = document.createElement("article");
    empty.className = "weekly-empty";
    empty.textContent = "No current or near-term lessons are available in the maintained course map.";
    lessons.append(empty);
  } else {
    for (const lesson of data.lessons) lessons.append(renderWeeklyLesson(lesson));
  }
  renderExceptionQueue(data);
}

function renderTeachingWeekError(error) {
  teachingState.data = null;
  teachingState.error = error.message;
  const lessons = document.querySelector("#teachWeekLessons");
  const queue = document.querySelector("#exceptionQueue");
  const count = document.querySelector("#teachWeekLessonCount");
  const exceptionCount = document.querySelector("#exceptionCount");
  const scope = document.querySelector("#teachWeekScope");
  const exceptionSummary = document.querySelector("#exceptionSummary");
  if (lessons) {
    lessons.innerHTML = "";
    lessons.setAttribute("aria-busy", "false");
    const message = document.createElement("article");
    message.className = "weekly-error";
    message.textContent = "The weekly plan could not load. Existing Today, Instructor, Materials, Grading, and publishing workflows remain available.";
    lessons.append(message);
  }
  if (queue) {
    queue.innerHTML = '<div class="exception-empty"><strong>Queue unavailable</strong><span>Refresh the weekly plan after the server connection is restored.</span></div>';
    queue.setAttribute("aria-busy", "false");
  }
  if (count) count.textContent = "Unavailable";
  if (exceptionCount) exceptionCount.textContent = "—";
  if (scope) scope.textContent = "The maintained weekly data is temporarily unavailable. Use Refresh Weekly Plan to try again.";
  if (exceptionSummary) exceptionSummary.textContent = "Actionable exceptions are unavailable until the weekly plan reconnects.";
  setWorkflowNotice("teachWeekNotice", `Teach This Week could not load: ${error.message}`, "error");
}

async function loadTeachingWeek() {
  teachingState.loading = true;
  const lessons = document.querySelector("#teachWeekLessons");
  const queue = document.querySelector("#exceptionQueue");
  if (lessons) lessons.setAttribute("aria-busy", "true");
  if (queue) queue.setAttribute("aria-busy", "true");
  try {
    const data = await getJson("/api/teaching/week");
    renderTeachingWeek(data);
    return data;
  } catch (error) {
    renderTeachingWeekError(error);
    throw error;
  } finally {
    teachingState.loading = false;
  }
}

function formatCanvasDate(item) {
  const startsAt = new Date(item.startsAt);
  if (Number.isNaN(startsAt.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(item.allDay ? {} : { hour: "numeric", minute: "2-digit" })
  }).format(startsAt);
}

function renderCanvasWeekAhead(data) {
  const summary = document.querySelector("#weekAheadSummary");
  const list = document.querySelector("#weekAheadList");
  if (!summary || !list) return;

  const items = data.items || [];
  const generated = data.generatedAt ? new Date(data.generatedAt) : null;
  const generatedLabel = generated && !Number.isNaN(generated.getTime())
    ? ` Updated ${generated.toLocaleDateString()}.`
    : "";
  summary.textContent = data.error
    || `${items.length} Canvas item${items.length === 1 ? "" : "s"} in the next ${data.windowDays || 7} days.${generatedLabel}`;
  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "week-ahead-empty";
    empty.textContent = data.error || "No BUS123 Canvas items are scheduled in this window.";
    list.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "week-ahead-row";

    const time = document.createElement("time");
    time.dateTime = item.startsAt || "";
    time.textContent = formatCanvasDate(item);

    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title || "Canvas item";
    const type = document.createElement("span");
    type.textContent = item.type || "Canvas";
    details.append(title, type);

    row.append(time, details);
    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open";
      row.append(link);
    }
    list.append(row);
  }
}

async function loadCanvasWeekAhead() {
  const data = await getJson("/api/canvas/week-ahead");
  renderCanvasWeekAhead(data);
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
      await Promise.all([loadInstructorDashboard(), loadTeachingWeek()]);
      writeLog("Instructor dashboard and weekly teaching plan refreshed.");
    }

    if (action.kind === "refreshTeachingWeek") {
      button.disabled = true;
      button.textContent = "Refreshing…";
      setWorkflowNotice("teachWeekNotice", "Refreshing current repository, Canvas snapshot, and grading readiness…", "warning");
      await loadTeachingWeek();
      writeLog("Teach This Week refreshed from maintained course and instructor data.");
    }

    if (action.kind === "savePrepNotes") {
      const lessonId = instructorState.currentLessonId;
      savePrepState(lessonId, {
        ...getPrepState(lessonId),
        status: document.querySelector("#prepStatus").value,
        notes: document.querySelector("#prepNotes").value,
        updatedAt: new Date().toISOString()
      });
      if (teachingState.data) renderTeachingWeek(teachingState.data);
      writeLog("Prep notes saved locally.");
    }

    if (action.kind === "saveAfterClassHandoff") {
      const lessonId = button.dataset.handoffLessonId;
      if (!lessonId) throw new Error("Choose a lesson before saving an after-class handoff");
      const field = document.querySelector(`#handoff-${lessonId}`);
      if (!field) throw new Error("The after-class handoff field is unavailable");
      const saved = getPrepState(lessonId);
      savePrepState(lessonId, {
        ...saved,
        handoff: field.value.trim(),
        handoffUpdatedAt: new Date().toISOString()
      });
      if (teachingState.data) renderTeachingWeek(teachingState.data);
      writeLog(`After-class handoff saved locally for ${lessonId}.`);
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
      writeLog(`Current lesson set to ${result.currentLessonTitle}. Index regeneration: ${regenerationStatus}. Review Visibility & Publishing when ready.`);
      await loadCourseVisibility();
      await loadTeachingWeek();
    }

    if (action.kind === "refreshVisibility") {
      button.disabled = true;
      button.textContent = "Reloading…";
      await loadCourseVisibility();
      setWorkflowNotice("visibilityNotice", "Reloaded lesson visibility from course-map.json.", "success");
      writeLog("Lesson visibility reloaded from the public course map.");
    }

    if (action.kind === "discardVisibility") {
      const snapshot = visibilityState.snapshot;
      if (!snapshot) return;
      visibilityState.draft = new Map(snapshot.lessons.map((lesson) => [lesson.id, lesson.visible]));
      invalidatePublishPreflight();
      renderVisibility();
      setWorkflowNotice("visibilityNotice", "Discarded the local visibility draft. No source files changed.", "success");
      writeLog("Visibility draft discarded; course-map.json was not changed.");
    }

    if (action.kind === "saveVisibility") {
      const changes = visibilityPendingChanges();
      if (!visibilityState.snapshot || !changes.length) throw new Error("There are no pending visibility changes to save");
      button.disabled = true;
      button.textContent = "Saving and rebuilding…";
      setWorkflowNotice("visibilityNotice", "Saving the reviewed visibility draft and rebuilding the local student preview…", "warning");
      const result = await postJson("/api/course/visibility", {
        revision: visibilityState.snapshot.revision,
        changes: changes.map(({ lesson, visible }) => ({ lessonId: lesson.id, visible }))
      });
      setVisibilitySnapshot(result.visibility);
      setWorkflowNotice("visibilityNotice", result.message, "success");
      await loadInstructorDashboard();
      await loadTeachingWeek();
      writeLog(result.message);
      writeLog("GitHub publishing was not run. Use Publishing Preflight when the local preview is ready.");
    }

    if (action.kind === "runPublishPreflight") {
      if (visibilityPendingChanges().length) throw new Error("Save or discard pending visibility changes before preflight");
      button.disabled = true;
      button.textContent = "Running preflight…";
      setWorkflowNotice("publishNotice", "Rebuilding, validating, fetching origin/main, and checking the reviewed Git scope…", "warning");
      visibilityState.preflight = await postJson("/api/course/publish-preflight", {});
      renderPublishPreflight();
      writeLog(visibilityState.preflight.canPublish
        ? `Publishing preflight passed for ${visibilityState.preflight.includedChanges.length} reviewed path(s).`
        : "Publishing preflight completed without staging, committing, or pushing; review the displayed blockers or clean state.");
    }

    if (action.kind === "requestCoursePublish") {
      const preflight = visibilityState.preflight;
      if (!preflight?.canPublish) throw new Error("Run a passing publishing preflight before confirmation");
      const dialog = document.querySelector("#publishConfirmationDialog");
      const summary = document.querySelector("#publishConfirmationSummary");
      const paths = document.querySelector("#publishConfirmationPaths");
      summary.textContent = `Mission Control will re-run every safety check, stage only ${preflight.includedChanges.length} reviewed path${preflight.includedChanges.length === 1 ? "" : "s"}, create one commit on main, and push origin/main.`;
      paths.innerHTML = "";
      preflight.includedChanges.forEach((item) => {
        const row = document.createElement("div");
        row.className = "confirmation-path";
        row.textContent = `${item.displayStatus}: ${item.path}`;
        paths.append(row);
      });
      dialog.showModal();
    }

    if (action.kind === "cancelCoursePublish") {
      document.querySelector("#publishConfirmationDialog")?.close();
    }

    if (action.kind === "confirmCoursePublish") {
      const preflight = visibilityState.preflight;
      if (!preflight?.canPublish) throw new Error("The reviewed preflight is no longer available");
      button.disabled = true;
      button.textContent = "Rechecking and publishing…";
      const result = await postJson("/api/course/publish", {
        confirmed: true,
        reviewToken: preflight.reviewToken,
        commitMessage: document.querySelector("#publishCommitMessage").value.trim()
      });
      document.querySelector("#publishConfirmationDialog")?.close();
      visibilityState.preflight = null;
      if (result.visibility) setVisibilitySnapshot(result.visibility);
      if (result.dashboard) renderInstructorDashboard(result.dashboard);
      setWorkflowNotice("publishNotice", result.message, "success");
      renderPublishPreflight();
      writeLog(result.message);
      (result.publishedPaths || []).forEach((path) => writeLog(`Published reviewed path: ${path}`));
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
    if (action.kind === "saveVisibility" || action.kind === "refreshVisibility") {
      setWorkflowNotice("visibilityNotice", error.message, "error");
    }
    if (["runPublishPreflight", "requestCoursePublish", "confirmCoursePublish"].includes(action.kind)) {
      if (error.data?.preflight) {
        visibilityState.preflight = error.data.preflight;
        renderPublishPreflight();
      }
      setWorkflowNotice("publishNotice", error.message, "error");
    }
    writeLog(`Error: ${error.message}. Make sure Mission Control is running at http://localhost:8123/.`);
  } finally {
    if (action.kind === "grading") {
      button.disabled = false;
      button.textContent = "Run Grader";
    }
    if (action.kind === "setCurrentLesson" && instructorState.dashboard) {
      renderInstructorDashboard(instructorState.dashboard);
    }
    if (action.kind === "refreshVisibility") {
      button.disabled = visibilityPendingChanges().length > 0;
      button.textContent = "Reload Course Map";
    }
    if (action.kind === "saveVisibility") {
      button.textContent = "Save and Rebuild";
      renderVisibilityPending();
    }
    if (action.kind === "runPublishPreflight") {
      button.textContent = "Run Publishing Preflight";
      renderVisibilityPending();
    }
    if (action.kind === "confirmCoursePublish") {
      button.disabled = false;
      button.textContent = "Commit and Push Main";
    }
    if (action.kind === "refreshTeachingWeek") {
      button.disabled = false;
      button.textContent = "Refresh Weekly Plan";
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

document.querySelector("#visibilitySearch")?.addEventListener("input", (event) => {
  visibilityState.search = event.target.value;
  renderVisibilityGroups();
});

document.querySelector("#publishCommitMessage")?.addEventListener("input", () => {
  renderPublishPreflight();
});

window.addEventListener("beforeunload", (event) => {
  if (!visibilityPendingChanges().length) return;
  event.preventDefault();
  event.returnValue = "";
});

document.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-teach-target-view]");
  if (!control) return;
  const lessonId = control.dataset.teachLessonId;
  if (lessonId) instructorState.selectedLessonId = lessonId;
  if (instructorState.dashboard) renderInstructorDashboard(instructorState.dashboard);
  setActiveView(control.dataset.teachTargetView);
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

loadCourseVisibility().catch((error) => {
  writeLog(`Lesson visibility error: ${error.message}.`);
  setWorkflowNotice("visibilityNotice", "Lesson visibility could not load from course-map.json.", "error");
  renderVisibility();
});

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

loadTeachingWeek().catch((error) => {
  writeLog(`Teach This Week error: ${error.message}.`);
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
