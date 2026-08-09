# BUS123 Mission Control

Private local control panel for BUS123 course-material workflows.

Mission Control serves:

- The control panel at `http://localhost:8123/`
- A local preview of the public student-facing course map at `http://localhost:8124/`

The Desktop app starts one detached Node process for both services and opens the control panel in the default browser.

Canvas remains a manual publishing and verification workflow. Institutional admin restrictions prevent automated token access, so Mission Control shows this limitation as a warning without blocking **Ready to Teach**.

## Teach This Week

The dedicated **Teach This Week** view turns the maintained lesson and readiness data into a current-plus-next-two workflow.

- Lesson order, release status, and visibility come directly from the public repository's `course-map.json`.
- Student and Instructor Package checks are derived from the current public and private repositories using the shared readiness policy.
- Each class follows the same six-step sequence: student package, instructor package, prep notes, manual Canvas action, activity/grader readiness, and after-class handoff.
- Prep status, prep notes, and after-class handoff use the existing per-lesson private browser record. Mission Control does not create a second lesson catalog or copy those notes into tracked files.
- The Exception Queue includes only actionable package blockers, near-term release/visibility gaps, stale or unavailable Canvas context, explicit prep gaps, and lessons with an activity but no exact private grader.
- Canvas remains manual. A stale week-ahead snapshot is elevated for attention, but Mission Control never claims to upload, publish, or verify Canvas.

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
