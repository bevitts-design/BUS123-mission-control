# Phase 1 local validation — September 7, 2026

Implemented the Teach/Lessons/Grade/Settings navigation, consolidated lesson workspace, and private file-backed notes. HTML and JavaScript are maintained app sources; no public course regeneration is needed for this app-only change.

## Automated regression checks

`node --test core/*.test.mjs` passes all 10 reported tests/files, including six new notes tests and the existing publishing, readiness, teaching-week, and visibility suites. Notes tests cover persistence, explicit clearing, previous-save recovery data, idempotent migration, conflicting browser records, simultaneous writes, invalid input, corrupt storage, and failed writes. Server and frontend syntax checks pass.

## Browser and API checks

Using an isolated Chrome profile with a disposable copy of instructor materials:

- All 21 lessons populate the picker. Selecting a different lesson leaves the current course lesson unchanged.
- Unsaved drafts remain attached to the correct lesson across navigation; saving survives browser reload.
- Legacy browser notes migrate. A differing private record is preserved and the browser copy remains available for review.
- Previous-save recovery loads a draft and can be saved explicitly.
- A concurrent edit returns a conflict without losing the draft. A simulated failed request retains the draft; retry succeeds.
- The weekly handoff and the main notes form share state and durable storage.
- Export downloads parseable JSON containing saved notes and previous versions.
- Lesson search finds both Capstone lessons, including their private materials. The exact registered grader is selected from the lesson workspace.
- Existing publishing and maintenance views remain reachable; no publish or grading run was performed.
- Cross-origin notes access is rejected, and unknown/traversal lesson IDs cannot write notes.
- Desktop and 760px/390px browser screenshots inspected; no horizontal overflow. Small-screen resource buttons retain readable labels.

Expected HTTP errors occurred only while deliberately testing conflict/failure handling. These are separate from JavaScript runtime errors.

## Scope and limits

No commits, pushes, public course changes, or Canvas changes. No production teaching notes were used for write tests. Existing notes in the instructor's normal browser migrate when that browser opens the updated app at its original local address; other browser profiles are not inspected or silently migrated. Notes are durable local files with one previous version and export, not automatic cross-computer synchronization or an off-device backup.

## Active application verification

After applying the reviewed files, restarted the verified active Mission Control server and checked `http://localhost:8123/#teach` in an isolated browser. All 21 lessons loaded, the notes endpoint returned HTTP 200 with the real private instructor storage path, and the current lesson remained Company Case Studies. Active desktop and 390px screenshots were inspected, with no horizontal overflow and zero console errors or warnings. Existing normal-browser notes still require that browser to open/refresh the updated app for migration.
