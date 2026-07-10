# BUS123 Lesson Package Specification

## Purpose

The Lesson Package Specification defines what it means for a BUS123 lesson to be complete, teachable, and publishable.

The goal is to move beyond asking whether a lesson has a website card and instead ask:

> Can this lesson be taught successfully, with the correct materials available to students and the correct support materials available to the instructor?

## Core Concept

Each lesson is made of three coordinated packages:

1. **Student Package** — public materials students need.
2. **Instructor Package** — private teaching materials the instructor needs.
3. **Publishing Package** — operational metadata used by Mission Control, Canvas, QTI workflows, and validators.

Together these define the full lesson package.

---

## 1. Student Package

**Repository:** `bevitts-design/BUS123-Solving-Business-Problems-with-Technology`

**Visibility:** Public

**Purpose:** Everything a student needs to prepare for, participate in, and complete the lesson.

### Required Student Files

| Component | Required | Notes |
|---|---:|---|
| Website entry | Yes | Lesson card on the course hub. |
| Lesson page or material link | Yes | Slides, activity, project page, or other primary launch point. |
| Slides | Usually | Required unless the lesson is intentionally activity-only. |
| Reading or pre-reading | Usually | May be waived for some activity or capstone lessons. |
| Starter workbook | Usually | Required for Excel/math lessons that involve spreadsheet work. |
| Assignment/project handout | When applicable | Especially for capstone or deliverable-based lessons. |
| Interactive activity | Optional | Encouraged when it improves practice or exploration. |
| Supporting downloads | Optional | Datasets, templates, reference sheets, examples. |

### Student Package Readiness

A lesson is **Student Ready** when students can open the website and access everything they need without instructor intervention.

Minimum Student Ready requirements:

- website entry exists
- all listed student-facing links work
- required slides/materials are available
- required workbook or activity files are available
- files are named consistently and stored in the correct public folder

---

## 2. Instructor Package

**Repository:** `bevitts-design/BUS123-instructor`

**Visibility:** Private

**Purpose:** Everything the instructor needs to teach, assess, troubleshoot, and adapt the lesson.

### Required Instructor Files

| Component | Required | Notes |
|---|---:|---|
| Instructor Notes Guide | Yes | Teaching plan for the lesson. |
| Answer key | Yes | Required when students complete workbook, quiz, or calculation work. |
| Completed workbook | Recommended | Useful for demos, review, and grading. |
| Teaching objectives | Yes | What the lesson is designed to accomplish. |
| Common student mistakes | Yes | Helps with live teaching and support. |
| Live demo plan | Recommended | Especially for Excel, Canvas, and interactive activities. |
| Timing guide | Recommended | Suggested class pacing. |
| Canvas notes | Recommended | Canvas module, assignment, discussion, or quiz notes. |
| Quiz source/questions | Optional | Source material for New Quizzes and QTI generation. |
| QTI package | Optional for now | Moving toward required for lessons with quizzes. |

### Instructor Package Readiness

A lesson is **Instructor Ready** when the instructor can walk into class and teach without hunting for missing support files.

Minimum Instructor Ready requirements:

- instructor notes guide exists
- answer key exists where student work has correct/incorrect answers
- completed workbook exists where useful
- common student mistakes or teaching tips are documented
- Canvas/QTI status is known, even if not complete

For INTRO lessons, the required primary student teaching material may be either a slide deck or a purpose-built company-profiles overview. The readiness check must preserve that distinction rather than reporting a profiles page as slides.

---

## 3. Publishing Package

**Repository:** `bevitts-design/BUS123-mission-control`

**Visibility:** Public unless it references instructor-only content directly

**Purpose:** Operational metadata used by the Course Operating System.

### Publishing Metadata

Each lesson should eventually track:

| Field | Purpose |
|---|---|
| lesson_id | Stable machine-readable lesson identifier. |
| track | Intro, Business Math, Excel, or Capstone. |
| module | Module number. |
| lesson_code | Human-readable lesson code. |
| title | Lesson title. |
| business_case | Associated case company or scenario. |
| skills | Skills practiced in the lesson. |
| learning_outcomes | Outcomes students should meet. |
| student_package_status | Student Ready / Missing Items / Not Started. |
| instructor_package_status | Instructor Ready / Missing Items / Not Started. |
| canvas_status | Not audited / Draft / Published / Needs update. |
| qti_status | Not started / Draft / Generated / Imported / Published. |
| website_status | Draft / Live / Hidden / Archived. |
| ready_to_teach | Yes / Almost / No. |
| last_updated | Last reviewed or modified date. |
| notes | Operational notes. |

---

## Readiness Levels

### Student Ready

Students can access and use the lesson materials independently.

### Instructor Ready

Instructor has the notes, answer keys, completed files, and teaching guidance needed for class.

### Canvas Ready

Canvas pages, assignments, files, due dates, and quizzes are prepared and published as needed.

### QTI Ready

Canvas New Quiz or QTI package exists and has been checked.

### Ready to Teach

The lesson has enough complete student-facing and instructor-facing materials to be taught confidently.

A lesson can be **Ready to Teach** even if optional enhancements are missing, but missing required files should block readiness.

---

## Course Health Implications

The Course Health validator should report lesson readiness by package:

```text
Math M05 — Payroll and Depreciation

Student Package:      Complete
Instructor Package:   Missing answer key
Publishing Package:   QTI not generated

Overall: Needs Work
```

This is more useful than a generic broken-link report because it connects missing files to teaching readiness.

---

## File Placement Rules

### Public Student Materials

Student-facing files belong in the public student website repository.

Examples:

- slides
- readings
- starter workbooks
- student project handouts
- interactive activities
- reference sheets

### Private Instructor Materials

Instructor-only files belong in the private instructor repository.

Examples:

- answer keys
- completed workbooks
- instructor notes
- grading notes
- assessment source files
- private Canvas planning notes

### Mission Control Metadata

Operational files belong in the Mission Control repository.

Examples:

- course manifest
- lesson inventory
- validation reports
- publishing status
- templates
- automation tools

---

## Standard Lesson Lifecycle

```text
Idea
  ↓
Lesson Design
  ↓
Student Package
  ↓
Instructor Package
  ↓
Canvas Setup
  ↓
QTI / New Quiz Setup
  ↓
Course Health Check
  ↓
Ready to Teach
```

---

## Guiding Principle

Every lesson should be designed as a complete package, not as a loose collection of files.

The Course Operating System should make missing components visible before they become teaching problems.
