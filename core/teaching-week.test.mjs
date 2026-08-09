import assert from "node:assert/strict";
import { buildTeachingWeek, CANVAS_FRESHNESS_HOURS } from "./teaching-week.mjs";

const now = new Date("2026-08-09T14:00:00.000Z");
const readyPrivateArtifacts = [
  { id: "notes", type: "instructor-notes", relativePath: "INTRO/M01/notes.md" }
];

function lesson(overrides = {}) {
  return {
    id: "intro-m01-l01",
    key: "INTRO/M01/L01",
    track: "intro",
    title: "Course Introduction",
    status: "Live",
    displayOrder: 10,
    isCurrent: true,
    isVisible: true,
    isReleased: true,
    publicArtifacts: [{ type: "Slides", path: "INTRO/M01/slides.html", exists: true }],
    privateArtifacts: readyPrivateArtifacts,
    ...overrides
  };
}

function dashboard(lessons) {
  return {
    course: { currentLessonId: "intro-m01-l01" },
    currentLesson: lessons.find((item) => item.id === "intro-m01-l01"),
    lessons
  };
}

const freshCanvas = {
  available: true,
  generatedAt: new Date(now.getTime() - (CANVAS_FRESHNESS_HOURS - 1) * 3_600_000).toISOString(),
  items: []
};

const ordered = buildTeachingWeek({
  dashboard: dashboard([
    lesson({ id: "math-m01-l01", key: "MATH/M01/L01", track: "math", title: "Math", displayOrder: 30, isCurrent: false, publicArtifacts: [
      { type: "Slides", path: "slides.html", exists: true },
      { type: "Reading", path: "reading.pdf", exists: true },
      { type: "Starter Workbook", path: "starter.xlsx", exists: true }
    ], privateArtifacts: [
      ...readyPrivateArtifacts,
      { id: "answer", type: "activity-key", relativePath: "MATH/M01/key.xlsx" }
    ] }),
    lesson({ id: "intro-m01-l02", key: "INTRO/M01/L02", title: "Orientation", displayOrder: 20, isCurrent: false }),
    lesson()
  ]),
  gradingActivities: [{ id: "bus123-math-m01-l01", title: "Math grader", pointsPossible: 20 }],
  canvasWeekAhead: freshCanvas,
  now
});

assert.deepEqual(
  ordered.lessons.map((item) => item.id),
  ["intro-m01-l01", "intro-m01-l02", "math-m01-l01"],
  "Weekly scope must follow course-map display order from the current lesson"
);
assert.deepEqual(
  ordered.lessons[0].steps.map((step) => step.order),
  [1, 2, 3, 4, 5, 6],
  "Each lesson must expose the approved preparation sequence"
);
assert.equal(ordered.lessons[2].steps[4].status, "Ready", "An exact private grader should satisfy the grader check");
assert.equal(ordered.exceptions.some((item) => item.category === "canvas"), false, "A fresh Canvas snapshot should not become an exception");

const blocked = buildTeachingWeek({
  dashboard: dashboard([
    lesson({
      publicArtifacts: [{ type: "Slides", path: "missing.html", exists: false }],
      privateArtifacts: []
    }),
    lesson({
      id: "math-m01-l01",
      key: "MATH/M01/L01",
      track: "math",
      title: "Basic Math",
      displayOrder: 20,
      isCurrent: false,
      isVisible: false,
      status: "Coming Soon",
      isReleased: false,
      publicArtifacts: [
        { type: "Slides", path: "slides.html", exists: true },
        { type: "Reading", path: "reading.pdf", exists: true },
        { type: "Starter Workbook", path: "starter.xlsx", exists: true }
      ],
      privateArtifacts: [
        ...readyPrivateArtifacts,
        { id: "answer", type: "completed", relativePath: "MATH/M01/completed.xlsx" }
      ]
    })
  ]),
  gradingActivities: [],
  canvasWeekAhead: {
    available: true,
    generatedAt: "2026-06-01T14:00:00.000Z",
    items: []
  },
  now
});

assert.equal(blocked.lessons[0].readiness.status, "Needs Work");
assert.equal(blocked.exceptions[0].severity, "blocker", "Package blockers must lead the exception queue");
assert(blocked.exceptions.some((item) => item.category === "visibility"), "Hidden near-term lessons must be surfaced");
assert(blocked.exceptions.some((item) => item.category === "release"), "Unreleased near-term lessons must be surfaced");
assert(blocked.exceptions.some((item) => item.category === "grader"), "Activities without an exact grader need a confirmed grading plan");
assert(blocked.exceptions.some((item) => item.category === "canvas"), "A stale Canvas snapshot must be surfaced as a manual action");
assert.equal(blocked.lessons[0].readiness.blocking.some((item) => item.includes("Canvas")), false, "Manual Canvas work must not block lesson readiness");

const unavailable = buildTeachingWeek({
  dashboard: dashboard([lesson()]),
  canvasWeekAhead: { available: false, generatedAt: null, items: [] },
  now
});
assert.equal(unavailable.canvas.stale, true);
assert.match(unavailable.canvas.detail, /Open Canvas Calendar/i);

const empty = buildTeachingWeek({
  dashboard: { course: { currentLessonId: "missing" }, currentLesson: null, lessons: [] },
  canvasWeekAhead: freshCanvas,
  now
});
assert.deepEqual(empty.lessons, [], "An empty dashboard should return a stable empty weekly scope");

console.log("Teach This Week model tests passed.");
