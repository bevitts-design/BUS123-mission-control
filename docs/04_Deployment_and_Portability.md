# BUS123 Mission Control: Deployment and Portability

## Architecture Decision

BUS123 Mission Control will be designed as two coordinated editions:

1. **Desktop Edition** — full local-file and automation access.
2. **Web Edition** — browser-based access from Mac or Windows for planning, review, status, and lightweight course management.

GitHub remains the system of record for course configuration, lesson data, documentation, and version history.

---

## 1. Desktop Edition

### Purpose

The Desktop Edition supports workflows that require direct access to files, applications, scripts, and private repositories on the instructor's computer.

### Primary Capabilities

- Scan local public and private GitHub repositories.
- Run Course Health checks against local files.
- Open slides, workbooks, readings, instructor notes, and answer keys.
- Launch Excel and other desktop applications.
- Run grading scripts.
- Generate QTI packages locally.
- Open teaching bundles.
- Commit and publish approved changes through Git/GitHub.

### Supported Platforms

- macOS is the current development platform.
- Windows support should be maintained wherever practical.
- Machine-specific paths must not be hard-coded into shared course data.

### Local Configuration

Each computer should eventually have a local configuration file that is not committed to GitHub, for example:

```yaml
computer:
  platform: macos
  public_repo: /Users/name/Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology
  instructor_repo: /Users/name/Documents/GitHub/BUS123-instructor
  mission_control_repo: /Users/name/Documents/GitHub/BUS123-mission-control
  excel_app: /Applications/Microsoft Excel.app
```

A Windows version might use:

```yaml
computer:
  platform: windows
  public_repo: C:\Users\name\Documents\GitHub\BUS123-Solving-Business-Problems-with-Technology
  instructor_repo: C:\Users\name\Documents\GitHub\BUS123-instructor
  mission_control_repo: C:\Users\name\Documents\GitHub\BUS123-mission-control
```

The shared application must read paths from configuration or environment variables instead of assuming one specific username or operating system.

---

## 2. Web Edition

### Purpose

The Web Edition provides secure browser access from any modern computer, including Windows machines that do not have the local BUS123 repositories cloned.

### Initial Capabilities

- View the current lesson.
- Browse the lesson inventory.
- View Course Health reports generated from repository data.
- Review Student Package, Instructor Package, and Publishing Package status.
- View the roadmap and documentation.
- Review Canvas and QTI status.
- Open public student resources.
- Download authorized files when appropriate.

### Later Capabilities

- Edit approved lesson metadata.
- Update planning notes.
- Trigger GitHub-based validation workflows.
- Generate QTI packages through a secure server-side workflow.
- Prepare Canvas publishing packages.
- Review changes and open pull requests.

### Capabilities the Web Edition Should Not Assume

A browser cannot safely perform every Desktop Edition action. The Web Edition should not assume it can:

- open a local Finder or Windows Explorer folder;
- launch a local Excel workbook directly;
- scan uncommitted files on a computer;
- run private local grading scripts;
- access a private repository without authentication;
- expose answer keys or instructor-only files publicly.

Where appropriate, the Web Edition should offer a download, repository link, or a request that can be completed later in the Desktop Edition.

---

## Shared Core

Both editions should use the same core concepts and data structures.

### Shared Sources of Truth

- `course.yaml` — global course configuration.
- Public repository `course-map.json` — structured lesson and public-material data.
- Mission Control documentation and templates.
- Versioned Course Health rules.
- Canvas and QTI status metadata.

### Shared Application Logic

Validation and readiness logic should be separated from the user interface so it can run in:

- the local Node.js Desktop Edition;
- a GitHub Actions workflow;
- a future secure web service;
- automated tests.

The interface may differ, but the readiness rules should remain consistent.

---

## Security and Privacy

### Public Data

The Web Edition may safely display:

- public lesson titles;
- public website links;
- public slides, readings, and starter workbooks;
- general readiness status;
- course structure and public metadata.

### Private Data

Instructor-only resources require authentication and strict access control:

- answer keys;
- completed workbooks;
- instructor notes;
- grading rubrics and grading output;
- assessment source files;
- private Canvas planning notes.

Private file contents must never be copied into the public repository or deployed to a public web host.

### Preferred Web Security Model

The Web Edition should eventually use authenticated access connected to GitHub or another trusted identity provider. Until authentication is implemented, any deployed web version must be treated as public and limited to public data only.

---

## Cross-Platform Design Rules

1. Use Node.js and browser-standard JavaScript for shared logic where practical.
2. Use `node:path` instead of manually composing macOS or Windows paths.
3. Avoid hard-coded usernames and absolute paths in committed code.
4. Store local paths in ignored configuration files or environment variables.
5. Treat shell commands such as macOS `open` as platform adapters, not shared core logic.
6. Keep validation logic independent of Finder, Windows Explorer, Excel, or the browser interface.
7. Test the Web Edition in current versions of Chrome and Edge on Windows.
8. Do not expose private-repository data through a static public website.

---

## Proposed Repository Structure

```text
BUS123-mission-control/
├── course.yaml
├── docs/
├── core/
│   ├── course-health.mjs
│   ├── lesson-model.mjs
│   └── qti/
├── desktop/
│   ├── server.mjs
│   ├── platform/
│   │   ├── macos.mjs
│   │   └── windows.mjs
│   └── local-config.example.yaml
├── web/
│   ├── index.html
│   ├── assets/
│   └── README.md
├── scripts/
└── data/
```

The existing application does not need to be reorganized immediately. This is the target structure to guide future changes without disrupting the working Desktop Edition.

---

## Delivery Plan

### Phase 1 — Stabilize Desktop Edition

- Preserve the currently working local Mission Control application.
- Remove hard-coded computer paths gradually.
- Complete the lesson-centered Course Health model.
- Build the Lesson Workspace.
- Add local configuration and platform detection.

### Phase 2 — Extract Shared Core

- Move Course Health and lesson-model logic into reusable modules.
- Add automated tests.
- Ensure the shared logic has no macOS-only dependencies.
- Generate portable JSON reports.

### Phase 3 — Read-Only Web Edition

- Deploy public course structure and readiness summaries.
- Support Windows and Mac browsers.
- Include links to public resources.
- Exclude all private file contents until secure authentication is available.

### Phase 4 — Authenticated Web Edition

- Add secure login.
- Read authorized private repository metadata.
- Permit controlled edits and GitHub pull-request workflows.
- Add server-side QTI and Canvas preparation tools.

---

## New-Computer Setup Goal

A new Mac or Windows computer should eventually require only:

1. Install Git and Node.js.
2. Clone the permitted BUS123 repositories.
3. Copy `local-config.example.yaml` to an ignored local configuration file.
4. Enter the local repository paths.
5. Start Mission Control.

The course itself must remain intact in GitHub even when Mission Control is not installed.

---

## Guiding Principle

**GitHub owns the durable course data. Mission Control provides the best interface for working with it.**

The Desktop and Web Editions should complement each other rather than trying to provide identical capabilities.
