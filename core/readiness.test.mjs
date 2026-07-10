import assert from "node:assert/strict";
import {
  CANVAS_MANUAL_WORKFLOW_WARNING,
  classifyStudentMaterials,
  evaluateLessonReadiness,
  isAnswerKeyRequired,
  requiredStudentComponents
} from "./readiness.mjs";

const intro = evaluateLessonReadiness({
  track: "intro",
  publicArtifacts: [{ type: "Slides", path: "intro-slides.html", exists: true }],
  instructorNotes: true
});
assert.equal(intro.status, "Ready to Teach");
assert.deepEqual(intro.blocking, []);
assert.ok(intro.warnings.includes(CANVAS_MANUAL_WORKFLOW_WARNING));
assert.equal(intro.status, "Ready to Teach", "Canvas manual workflow must not block teaching readiness");
assert.ok(!intro.blocking.includes(CANVAS_MANUAL_WORKFLOW_WARNING));

const companyOverview = evaluateLessonReadiness({
  track: "intro",
  publicArtifacts: [{ type: "Company Profiles", path: "company-profiles.html", exists: true }],
  instructorNotes: true
});
assert.equal(companyOverview.status, "Ready to Teach");
assert.deepEqual(companyOverview.blocking, []);
assert.equal(companyOverview.student.primary, true);
assert.equal(companyOverview.student.slides, false);

const math = evaluateLessonReadiness({
  track: "math",
  publicArtifacts: [
    { type: "Slides", exists: true },
    { type: "Pre-reading", exists: true },
    { type: "Starter Workbook", exists: true }
  ],
  instructorNotes: false,
  answerKey: false
});
assert.equal(math.status, "Needs Work");
assert.ok(math.blocking.includes("Instructor notes guide not found"));
assert.ok(math.blocking.includes("Answer key or completed instructor file not found"));

const missingCapstone = evaluateLessonReadiness({ track: "capstone" });
assert.equal(missingCapstone.status, "Not Ready");
assert.ok(missingCapstone.blocking.includes("Student assignment is not listed"));
assert.ok(missingCapstone.blocking.includes("Student workbook is not listed"));

const qtiReady = evaluateLessonReadiness({
  track: "intro",
  publicArtifacts: [{ type: "Slides", exists: true }],
  instructorNotes: true,
  qtiAvailable: true
});
assert.ok(!qtiReady.warnings.includes("QTI status not yet connected"));

const student = classifyStudentMaterials([
  { type: "Slides" },
  { type: "Pre-reading" },
  { type: "Excel Starter" },
  { type: "Interactive" }
]);
assert.deepEqual(student, {
  primary: true,
  slides: true,
  reading: true,
  workbook: true,
  interactive: true,
  assignment: false
});
assert.equal(isAnswerKeyRequired(student), true);
assert.deepEqual(requiredStudentComponents("intro"), { primary: true });
assert.deepEqual(requiredStudentComponents("excel"), { slides: true, reading: true, workbook: true });

console.log("Shared readiness tests passed.");
