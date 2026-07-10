# BUS123 Lesson Workspace

## Purpose

The Lesson Workspace is the lesson-centered home for preparing, teaching, reviewing, and publishing one BUS123 lesson. Finder and Windows Explorer remain available for file browsing, but the Lesson Workspace organizes files by instructional purpose rather than folder location.

## Primary Question

> What lesson are you working on, and what still needs to be done before it is ready to teach?

## Default Experience

When Mission Control opens, it should show either:

- the current lesson from `course-map.json`; or
- a lesson picker when no current lesson has been selected.

The current lesson should remain synchronized across the Desktop and Web Editions through shared course data.

## Screen Structure

### Lesson Header

- Track, module, and lesson code
- Lesson title
- Business case
- Release status
- Ready-to-Teach status
- Last reviewed date
- Profile and edition indicator

### Student Package

Display each public component with a clear status and action:

- Website entry
- Slides
- Reading
- Starter workbook
- Interactive activity
- Assignment or project handout
- Supporting downloads

Desktop actions may include **Open**, **Preview**, and **Show in Folder**.

Web actions may include **Open Public Link**, **Download**, or **Unavailable in Web Edition**.

### Instructor Package

Display private teaching components:

- Instructor Notes Guide
- Answer key
- Completed workbook
- Demo plan
- Common student mistakes
- Timing guide
- Canvas notes
- Assessment source materials

Desktop Edition may open these local files. Web Edition must require authenticated access before showing private metadata or file links.

### Publishing Package

- Website status
- Canvas page/module status
- Assignment status
- Canvas New Quiz status
- QTI package status
- Git/GitHub synchronization status
- Last published date

### Course Health

Show blocking issues separately from enhancements:

- **Blocking:** required file missing, broken public link, instructor notes missing, required answer key missing.
- **Warning:** interactive missing, Canvas requires the manual workflow because institutional admin restrictions prevent automated token access, QTI not generated, timing guide missing.
- **Complete:** required components present and accessible.

## Core Actions

### Desktop Edition

- Open Teaching Bundle
- Open Slides
- Open Student Workbook
- Open Instructor Notes
- Open Answer Key
- Open Lesson Folder
- Run Course Health
- Generate QTI
- Prepare Canvas Package
- Publish approved website changes

### Web Edition

- Review lesson status
- Open public resources
- View Course Health report
- Review Canvas and QTI status
- Edit permitted lesson metadata
- Add planning notes
- Trigger authenticated server-side validation
- Prepare or review a pull request

## Profiles

### Teaching

Full access to configured public and private repositories and local teaching tools.

### Development

Uses development or test data and blocks accidental production publishing.

### Travel

Permits public-data review and planning when private repositories or local teaching files are unavailable.

### Demo

Uses sample data and hides private course content.

## Responsive Design

The Web Edition must work in current Chrome and Edge on Windows, as well as Safari and Chrome on macOS. The workspace should collapse into vertically stacked package cards on narrower screens.

## First Implementation Slice

The first functional Lesson Workspace should:

1. Use the selected/current lesson from the existing instructor dashboard.
2. Show Student Package and Instructor Package status from current repository scans.
3. Show blocking and warning counts.
4. Provide existing open-file and open-folder actions.
5. Keep Canvas as a visible, non-blocking manual-workflow warning while institutional admin restrictions prevent token access; keep QTI as a status placeholder until its workflow is complete.

Visual polish follows after the workflow and data are reliable.
