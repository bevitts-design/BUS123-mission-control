# BUS123 Course Operating System Architecture

## Purpose

The BUS123 Course Operating System organizes course content, student-facing materials, instructor workflows, Canvas publishing, and Canvas New Quizzes/QTI generation around a single source of truth.

## Confirmed Course Structure

| Track | Modules | Public |
|---|---:|---|
| Intro | 3 | Yes |
| Business Math | 12 | Yes |
| Excel | 4 | Yes |
| Capstone | 2 | Yes |

Total lessons: **21**.

## Repositories

### Student Website

`bevitts-design/BUS123-Solving-Business-Problems-with-Technology`

Public student-facing course hub. Contains the main `index.html`, lesson pages, slides, readings, workbooks, and interactive activities.

### Instructor Repository

`bevitts-design/BUS123-instructor`

Private instructor-only repository. Intended for answer keys, grading support, assessment materials, planning notes, and materials that should not be public.

### Mission Control

`bevitts-design/BUS123-mission-control`

Course operating system repository. Contains configuration, documentation, structured data, future validation tools, QTI builder, publishing workflows, and semester rollover tools.

## Canonical Data Sources

- Mission Control `course.yaml` — global course configuration and repository roles.
- Public repository `course-map.json` — authoritative lesson catalog, current lesson, ordering, lesson visibility, public metadata, and student-material paths. Lessons are visible by default and are omitted from the generated homepage only when `visible` is explicitly `false`.
- Mission Control `core/readiness.mjs` — authoritative readiness policy and evaluation logic shared by the validator and Lesson Workspace.
- Mission Control `core/teaching-week.mjs` — pure weekly projection that selects the current lesson plus the next two lessons in course-map order, applies the shared readiness policy, associates exact private graders, and builds a focused exception queue. It does not persist lesson state.
- Private instructor lesson folders — authoritative instructor notes, answer keys, QTI packages, and other private teaching artifacts.
- Public `assets/canvas-week-ahead.json` — maintained read-only Canvas calendar snapshot. Its freshness is surfaced for manual review; it is not proof of Canvas publication or an automated Canvas connection.

CSV, JSON reports, and Markdown inventories may be generated for review or export, but they are derived artifacts and must not become competing editable lesson catalogs.

## Weekly Teaching Projection

`GET /api/teaching/week` derives a disposable teaching plan at request time from the instructor dashboard, private grading registry, and Canvas week-ahead snapshot. The browser overlays the existing per-lesson local prep record for prep status and after-class handoff. Neither the endpoint nor the view writes course-map, visibility, public output, Canvas, or Git state.

The exception queue is intentionally narrower than a status dashboard: it includes required package gaps, near-term release or visibility issues, stale Canvas context, explicit local prep gaps, and unconfirmed activity/grader plans. Ready routine items stay in the per-class checklist.

## Lesson as Atomic Unit

Each lesson should eventually track:

- website entry
- learning outcomes
- business case
- slides
- reading
- starter workbook
- interactive activity
- Canvas module
- Canvas assignment
- Canvas New Quiz
- QTI package
- instructor notes

## Planned Subsystems

1. Course Validator — checks links, missing files, inconsistent metadata, and publishing gaps.
2. Website Publisher — generates or updates website lesson cards from the inventory.
3. Canvas Workflow — prepares Canvas modules, assignments, pages, and publishing checklists.
4. Canvas New Quizzes / QTI Builder — generates Canvas-importable QTI packages, starting with multiple choice.
5. Semester Rollover — updates semester labels, statuses, and course references.
6. Mission Control Dashboard — instructor-facing interface for validation and publishing.

## Guiding Principle

Edit data once. Publish everywhere.
