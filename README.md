# BUS123 Mission Control

Private local control panel for BUS123 course-material workflows.

Mission Control serves:

- The control panel at `http://localhost:8123/`
- A local preview of the public student-facing course map at `http://localhost:8124/`

The Desktop app starts one detached Node process for both services and opens the control panel in the default browser.

Canvas remains a manual publishing and verification workflow. Institutional admin restrictions prevent automated token access, so Mission Control shows this limitation as a warning without blocking **Ready to Teach**.

## Teaching workspace

The default **Teach** screen combines the selected lesson's student materials, private teaching guide and answer materials, prep and after-class notes, exact matching grader, and student-access tools. **Lessons** provides a searchable catalog and an expandable individual-file browser. **Grade** and **Settings & Maintenance** retain grading and technical tools. Older Today, Instructor, Lesson Workspace, and Teach This Week links route to Teach.

Choosing a lesson changes only the workspace selection. **Make Current** is the explicit action that changes the public course's current lesson; existing save, rebuild, and publishing protections still apply. The weekly current-plus-next-two projection is expandable within Teach and remains derived from `course-map.json`.

### Private notes and recovery

- `GET/POST /api/instructor/notes` reads/writes one JSON file per known lesson under `BUS123-instructor/.mission-control/notes/`. Notes never go into Mission Control or public course outputs. This hidden directory is excluded from the material scanner.
- **Save Notes** saves preparation status, prep notes, and after-class notes. A visible message distinguishes unsaved drafts, confirmed saves, and failures. Unsaved drafts stay with their lesson while browsing; closing/reloading warns while drafts remain.
- Each successful update keeps the previous record as `<lesson-id>.previous.json`. **Review previous save** loads that copy as an unsaved draft; Save Notes explicitly restores it. **Export saved notes** downloads a private JSON snapshot including previous versions, not unsaved drafts.
- Saves check revisions and serialize writes per lesson. A stale window cannot silently replace a newer record. **Reload saved notes** fetches the saved version; discarding an unsaved draft requires confirmation. Corrupt or unwritable storage reports an error instead of claiming success.
- On opening the app, legacy `bus123-prep:<lesson-id>` records from that browser and origin are imported only if no different private record exists. Import is idempotent. Original browser records are retained; **Review browser copy** lets the instructor compare by loading one as a draft. Other browsers/computers must open the app themselves for their old records to be discovered.
- These are private local files, not automatic cross-computer synchronization or an off-device backup. Include the private instructor folder in the instructor's normal backup workflow; no commit, push, or cloud sync happens on Save Notes.

The Canvas calendar remains a maintained snapshot. Mission Control does not claim to upload, publish, or verify Canvas. Local material availability is not proof of live website deployment.

## Lesson Visibility and GitHub Publishing

The dedicated **Visibility & Publish** view reads lesson names, release statuses, ordering, and visibility from the public repository's `course-map.json`.

- A missing `visible` field remains backward-compatible and means the lesson is visible.
- A lesson appears on the generated student homepage unless its source record contains `"visible": false`.
- Switches create an in-browser draft. The pending-changes panel shows the exact lessons that would be shown or hidden.
- **Save and Rebuild** checks that `course-map.json` has not changed since load, writes only the reviewed visibility changes, and regenerates the local public preview. A failed build restores the original source map and generated homepage.
- The current lesson cannot be hidden; make another lesson current first.
- Saving never stages, commits, or pushes.

GitHub publication is a separate workflow. **Run Publishing Preflight** rebuilds and validates again, fetches `origin/main`, verifies that local `main` is synchronized, rejects inherited staged work, and lists every included and excluded path. Publication requires a one-line commit message, a matching preflight fingerprint, and a final confirmation dialog. The server then stages only the displayed BUS123 public paths; it never uses `git add -A`.

A successful push does not prove that GitHub Pages has deployed. Deployment remains a separate asynchronous step.

## Repository Contents

- `server.mjs`: local HTTP server, API endpoints, material scan, and public preview
- `index.html`: Mission Control interface
- `assets/`: interface styles and JavaScript
- `launchers/BUS123-Mission-Control.app/`: Desktop launcher source bundle
- `launchers/BUS123MissionControl.iconset/`: launcher icon source assets

Runtime logs are written to `logs/` and intentionally excluded from Git.

## Install the Desktop App

From this repository:

```sh
rm -rf "$HOME/Desktop/BUS123 Mission Control.app"
cp -R "launchers/BUS123-Mission-Control.app" "$HOME/Desktop/BUS123 Mission Control.app"
```

Then open `BUS123 Mission Control.app` from the Desktop.

## Local Paths

The launcher expects these sibling repositories:

```text
~/Documents/GitHub/BUS123-mission-control-active
~/Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology
~/Documents/GitHub/BUS123-instructor
```

Keep this repository private. It contains instructor workflow tooling and local operational details that do not belong in the public student-facing course-materials repository.

For disposable development checks or another supported computer, the server accepts `BUS123_PUBLIC_REPO`, `BUS123_INSTRUCTOR_REPO`, `BUS123_MISSION_PORT`, and `BUS123_PUBLIC_PORT` environment overrides. Normal Desktop use needs none of these; the existing sibling-repository paths and ports `8123`/`8124` remain the defaults.
