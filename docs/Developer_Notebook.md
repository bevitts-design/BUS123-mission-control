# BUS123 Developer Notebook

This notebook records the coding concepts and development workflow used to build Mission Control. It is written as a practical reference for learning while we work.

## Lesson 1: How the Mission Control interface works

Mission Control's browser interface uses three kinds of files:

- `index.html` defines what appears on the page: navigation links, headings, buttons, and content areas.
- `assets/mission-control.css` controls presentation: colors, spacing, layout, and responsive behavior.
- `assets/mission-control.js` controls behavior: switching views, loading course data, running actions, and updating the page.

### The first Lesson Workspace change

The first increment adds a navigation link and a placeholder view in `index.html`. It intentionally does not load lesson data yet.

The navigation link uses two matching values:

```html
<a href="#lesson-workspace" data-view-link="lesson-workspace">Lesson Workspace</a>
```

The corresponding view uses that same identifier:

```html
<section id="lesson-workspace" class="view">
```

`assets/mission-control.js` already knows how to match `data-view-link` with a view `id`, so no JavaScript change is required for this first increment.

### Safe development workflow

1. Create a feature branch.
2. Make one small change.
3. Run Mission Control and test the change.
4. Review the changed files in GitHub Desktop.
5. Commit only after the change works.
6. Push the feature branch; merge into `main` only after approval.

### Test for this increment

1. Restart Mission Control with the desktop shortcut.
2. Open `http://localhost:8123/`.
3. Select **Lesson Workspace** in the left navigation.
4. Confirm the placeholder displays three planned package areas.
5. Select **Today** and confirm the existing view still works.
