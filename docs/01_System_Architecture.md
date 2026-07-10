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
- Public repository `course-map.json` — authoritative lesson catalog, current lesson, ordering, public metadata, and student-material paths.
- Mission Control `core/readiness.mjs` — authoritative readiness policy and evaluation logic shared by the validator and Lesson Workspace.
- Private instructor lesson folders — authoritative instructor notes, answer keys, QTI packages, and other private teaching artifacts.

CSV, JSON reports, and Markdown inventories may be generated for review or export, but they are derived artifacts and must not become competing editable lesson catalogs.

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
