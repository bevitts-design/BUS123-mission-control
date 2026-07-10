# BUS123 Course Operating System Documentation

This folder contains the working documentation for the BUS123 Course Operating System.

## Core Files

- `01_System_Architecture.md` — overview of repositories, data sources, publishing targets, and workflows.
- `02_Master_Lesson_Inventory.md` — human-readable snapshot derived from the public course map.

## Canonical Sources

- `course.yaml` in Mission Control defines the course and repository roles.
- `course-map.json` in the public BUS123 repository is the authoritative lesson catalog.
- `core/readiness.mjs` defines the shared readiness policy.
- Private lesson artifacts remain authoritative in `BUS123-instructor`.

Reports and inventories may be generated from those sources, but generated CSV, JSON, or Markdown files are not edited as competing sources of truth.

## Operating Principle

Edit data once. Publish everywhere.

The student website, Mission Control, Canvas workflows, QTI generation, and validation tools should consume the public course map and shared readiness policy.
