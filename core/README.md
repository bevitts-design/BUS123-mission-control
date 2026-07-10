# BUS123 Shared Core

The `core/` folder is the cross-platform engine shared by the Desktop and future Web Editions of Mission Control.

## Responsibilities

- Course and lesson data models
- Course Health and readiness rules
- Configuration loading
- QTI generation logic
- Validation rules
- Portable JSON report generation

## Boundaries

Shared-core modules must not directly:

- launch Finder or Windows Explorer;
- open Excel;
- depend on macOS `open` commands;
- assume a specific username or absolute path;
- expose private instructor content to a public web client.

Platform-specific behavior belongs in Desktop Edition adapters. Browser-specific behavior belongs in the Web Edition.

## Modules

`config.mjs` loads an ignored local configuration file, environment-variable overrides, and cross-platform default repository paths. The existing server will be migrated to use it after the configuration is tested locally.

`readiness.mjs` is the authoritative readiness policy and evaluator shared by the Desktop validator and Lesson Workspace. Optional Canvas, QTI, and interactive warnings remain visible but do not block **Ready to Teach** when all required Student and Instructor Package components exist.

Run its focused regression test with:

```bash
node core/readiness.test.mjs
```
