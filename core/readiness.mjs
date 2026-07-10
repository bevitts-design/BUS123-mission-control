export const READINESS_POLICY = Object.freeze({
  trackRequirements: Object.freeze({
    intro: Object.freeze({ slides: true }),
    math: Object.freeze({ slides: true, reading: true, workbook: true }),
    excel: Object.freeze({ slides: true, reading: true, workbook: true }),
    capstone: Object.freeze({ assignment: true, workbook: true })
  }),
  answerKeyRequiredWhen: Object.freeze(["workbook", "assignment", "interactive"])
});

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function classifyStudentMaterials(artifacts = []) {
  const types = new Set(artifacts.map((artifact) => normalize(artifact.type)));
  return {
    slides: [...types].some((type) => type.includes("slide")),
    reading: [...types].some((type) => type.includes("reading")),
    workbook: [...types].some((type) => type.includes("workbook") || type.includes("excel")),
    interactive: [...types].some((type) => type.includes("interactive")),
    assignment: [...types].some((type) => type.includes("assignment") || type.includes("project") || type.includes("homework"))
  };
}

export function requiredStudentComponents(track) {
  return READINESS_POLICY.trackRequirements[normalize(track)] || {};
}

export function isAnswerKeyRequired(studentComponents) {
  return READINESS_POLICY.answerKeyRequiredWhen.some((component) => Boolean(studentComponents?.[component]));
}

function readinessStatus(blocking) {
  if (blocking.length >= 3) return "Not Ready";
  if (blocking.length) return "Needs Work";
  return "Ready to Teach";
}

export function evaluateLessonReadiness({
  track,
  publicArtifacts = [],
  instructorNotes = false,
  answerKey = false,
  canvasConnected = false,
  qtiAvailable = false
} = {}) {
  const student = classifyStudentMaterials(publicArtifacts);
  const required = requiredStudentComponents(track);
  const blocking = [];
  const warnings = [];

  for (const [component, isRequired] of Object.entries(required)) {
    if (isRequired && !student[component]) blocking.push(`Student ${component} is not listed`);
  }

  for (const artifact of publicArtifacts) {
    if (artifact.exists === false) {
      blocking.push(`Missing public file: ${artifact.path || artifact.type || "unnamed material"}`);
    }
  }

  const answerKeyRequired = isAnswerKeyRequired(student);
  if (!instructorNotes) blocking.push("Instructor notes guide not found");
  if (answerKeyRequired && !answerKey) blocking.push("Answer key or completed instructor file not found");

  if (!student.interactive) warnings.push("No interactive activity listed");
  if (!canvasConnected) warnings.push("Canvas status not yet connected");
  if (!qtiAvailable) warnings.push("QTI status not yet connected");

  return {
    status: readinessStatus(blocking),
    blocking: [...new Set(blocking)],
    warnings: [...new Set(warnings)],
    student,
    answerKeyRequired
  };
}
