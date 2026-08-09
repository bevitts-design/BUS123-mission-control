import assert from "node:assert/strict";
import {
  applyVisibilityChanges,
  buildVisibilitySnapshot,
  courseMapRevision,
  lessonIsVisible,
  VisibilityUpdateError
} from "./visibility.mjs";

const source = `${JSON.stringify({
  course: { code: "BUS123", currentLessonId: "intro-m01-l01" },
  tracks: [{ id: "intro", label: "Intro" }, { id: "math", label: "Business Math" }],
  lessons: [
    {
      id: "intro-m01-l01",
      track: "intro",
      module: "M01",
      lesson: "L01",
      title: "Course Introduction",
      status: "Live",
      displayOrder: 10,
      futureField: { preserve: true }
    },
    {
      id: "math-m01-l01",
      track: "math",
      module: "M01",
      lesson: "L01",
      title: "Business Math",
      status: "Coming Soon",
      visible: false,
      displayOrder: 20
    }
  ]
}, null, 2)}\n`;

const map = JSON.parse(source);
assert.equal(lessonIsVisible(map.lessons[0]), true, "An omitted visible field must remain backward-compatible and visible.");
assert.equal(lessonIsVisible(map.lessons[1]), false);

const snapshot = buildVisibilitySnapshot(map, { revision: courseMapRevision(source) });
assert.equal(snapshot.totals.lessons, 2);
assert.equal(snapshot.totals.visible, 1);
assert.equal(snapshot.totals.hidden, 1);
assert.equal(snapshot.groups.length, 2);
assert.equal(snapshot.lessons[0].isCurrent, true);
assert.equal(snapshot.lessons[0].visibilityExplicit, false);

const update = applyVisibilityChanges(map, [{ lessonId: "math-m01-l01", visible: true }]);
assert.equal(update.courseMap.lessons[1].visible, true);
assert.deepEqual(update.courseMap.lessons[0].futureField, { preserve: true });
assert.equal(map.lessons[1].visible, false, "Visibility updates must not mutate the loaded snapshot.");

assert.throws(
  () => applyVisibilityChanges(map, [{ lessonId: "intro-m01-l01", visible: false }]),
  (error) => error instanceof VisibilityUpdateError && error.code === "current-lesson-hidden"
);
assert.throws(
  () => applyVisibilityChanges(map, [{ lessonId: "math-m01-l01", visible: "yes" }]),
  /must be true or false/
);
assert.throws(
  () => applyVisibilityChanges(map, [{ lessonId: "missing", visible: true }]),
  /no longer exists/
);

console.log("Lesson visibility safety tests passed.");
