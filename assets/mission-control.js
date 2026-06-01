const log = document.querySelector("#log");
const API_BASE = window.location.protocol === "file:" ? "http://localhost:8123" : "";
const materialState = {
  items: [],
  filtersReady: false
};

const actions = {
  "open-canvas": { kind: "navigate", url: "https://endicott.instructure.com/courses/58218" },
  "open-public-site": { kind: "navigate", url: "http://localhost:8124/" },
  "open-public-repo": { kind: "open", target: "publicRepo" },
  "open-instructor-repo": { kind: "open", target: "instructorRepo" },
  "open-course-map": { kind: "open", target: "courseMap" },
  "open-drive-template": { kind: "navigate", url: "https://drive.google.com/file/d/1xty2pm0baSDRKKT1ncCyrVWJrD29cDfm" },
  "open-project-instructions": { kind: "navigate", url: "https://docs.google.com/document/d/1OxAbv_Hpn7N8xT3Aw7YylfGPatpvmKLI4SZGk4_0m38/edit?usp=drivesdk" },
  "open-desktop": { kind: "open", target: "desktop" },
  "dry-run-grading": { kind: "grading" },
  "refresh-materials": { kind: "refreshMaterials" }
};

function writeLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  log.textContent += `\n[${timestamp}] ${message}`;
  log.scrollTop = log.scrollHeight;
}

if (window.location.protocol === "file:") {
  writeLog("Opened as a file. Buttons will use the local server at http://localhost:8123; if they fail, start the Mission Control server and open that URL.");
}

async function postJson(url, payload) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

async function getJson(url) {
  const response = await fetch(`${API_BASE}${url}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function labelFor(value) {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function renderMaterials() {
  const list = document.querySelector("#materialsList");
  const summary = document.querySelector("#materialsSummary");
  if (!list || !summary) return;

  const visibility = document.querySelector("#filterVisibility").value;
  const module = document.querySelector("#filterModule").value;
  const lesson = document.querySelector("#filterLesson").value;
  const type = document.querySelector("#filterType").value;

  const filtered = materialState.items
    .filter((item) => {
      return (visibility === "all" || item.visibility === visibility)
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
  const filterIds = ["filterVisibility", "filterModule", "filterLesson", "filterType"];
  filterIds.forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("change", renderMaterials);
  });
}

async function loadMaterials() {
  const summary = document.querySelector("#materialsSummary");
  if (!summary) return;

  summary.textContent = "Scanning public and private materials...";
  const data = await getJson("/api/materials");
  materialState.items = data.materials;

  populateSelect(document.querySelector("#filterVisibility"), [...new Set(data.materials.map((item) => item.visibility))].sort(), "All materials");
  populateSelect(document.querySelector("#filterModule"), [...new Set(data.materials.map((item) => item.module))].sort(), "All modules");
  populateSelect(document.querySelector("#filterLesson"), [...new Set(data.materials.map((item) => item.lesson))].sort(), "All lessons");
  populateSelect(document.querySelector("#filterType"), [...new Set(data.materials.map((item) => item.type))].sort(), "All types");

  if (!materialState.filtersReady) {
    setupMaterialFilters();
    materialState.filtersReady = true;
  }

  renderMaterials();
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
      const assignment = document.querySelector("#assignment").value;
      const folderPath = document.querySelector("#folderPath").value;
      const result = await postJson("/api/grading/dry-run", { assignment, folderPath });
      writeLog(result.message);
    }

    if (action.kind === "refreshMaterials") {
      await loadMaterials();
      writeLog("Materials console refreshed.");
    }
  } catch (error) {
    writeLog(`Error: ${error.message}. Make sure Mission Control is running at http://localhost:8123/.`);
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

loadMaterials().catch((error) => {
  writeLog(`Materials console error: ${error.message}.`);
  const summary = document.querySelector("#materialsSummary");
  if (summary) summary.textContent = "Materials console could not load.";
});
