import { evaluateLessonReadiness } from "./readiness.mjs";

export const TEACHING_WEEK_LESSON_LIMIT = 3;
export const CANVAS_FRESHNESS_HOURS = 36;

const answerArtifactTypes = new Set(["activity-key", "solution", "completed"]);
const severityOrder = { blocker: 0, attention: 1 };

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dashboardLessons(dashboard = {}) {
  const lessons = Array.isArray(dashboard.lessons)
    ? dashboard.lessons
    : (dashboard.modules || []).flatMap((module) => module.lessons || []);

  return lessons
    .map((lesson, sourceIndex) => ({ lesson, sourceIndex }))
    .sort((a, b) => {
      const aOrder = Number.isFinite(Number(a.lesson.displayOrder)) ? Number(a.lesson.displayOrder) : a.sourceIndex;
      const bOrder = Number.isFinite(Number(b.lesson.displayOrder)) ? Number(b.lesson.displayOrder) : b.sourceIndex;
      return aOrder - bOrder || a.sourceIndex - b.sourceIndex;
    })
    .map(({ lesson }) => lesson);
}

function packageReadiness(lesson) {
  const privateArtifacts = lesson.privateArtifacts || [];
  const qti = privateArtifacts.find((artifact) => artifact.type === "qti");
  const instructorNotes = privateArtifacts.find((artifact) => artifact.type === "instructor-notes");
  const answerKey = privateArtifacts.find((artifact) => answerArtifactTypes.has(artifact.type));
  const readiness = evaluateLessonReadiness({
    track: lesson.track,
    publicArtifacts: lesson.publicArtifacts || [],
    instructorNotes: Boolean(instructorNotes),
    answerKey: Boolean(answerKey),
    canvasConnected: false,
    qtiAvailable: Boolean(qti)
  });

  return { readiness, instructorNotes, answerKey, qti };
}

function studentPackageStep(lesson, readiness) {
  const blockers = readiness.blocking.filter((item) => item.startsWith("Student ") || item.startsWith("Missing public file:"));
  return {
    id: "student-package",
    order: 1,
    title: "Verify student package",
    status: blockers.length ? "Blocked" : "Ready",
    state: blockers.length ? "blocker" : "ready",
    detail: blockers.length
      ? blockers.join("; ")
      : `${lesson.publicArtifacts?.length || 0} listed student artifact${lesson.publicArtifacts?.length === 1 ? "" : "s"} verified from the public repository.`,
    targetView: "lesson-workspace"
  };
}

function instructorPackageStep(readiness, instructorNotes, answerKey) {
  const blockers = readiness.blocking.filter((item) => item.startsWith("Instructor ") || item.startsWith("Answer key"));
  const available = Number(Boolean(instructorNotes)) + Number(Boolean(answerKey));
  return {
    id: "instructor-package",
    order: 2,
    title: "Verify instructor package",
    status: blockers.length ? "Blocked" : "Ready",
    state: blockers.length ? "blocker" : "ready",
    detail: blockers.length
      ? blockers.join("; ")
      : `${available} required private artifact type${available === 1 ? "" : "s"} verified without exposing private content.`,
    targetView: "lesson-workspace"
  };
}

function canvasContext(canvasWeekAhead = {}, now = new Date()) {
  const generated = new Date(canvasWeekAhead.generatedAt || "");
  const generatedTime = generated.getTime();
  const nowTime = new Date(now).getTime();
  const hasValidDate = Number.isFinite(generatedTime) && Number.isFinite(nowTime);
  const ageHours = hasValidDate ? Math.max(0, (nowTime - generatedTime) / 3_600_000) : null;
  const available = canvasWeekAhead.available !== false;
  const stale = !available || ageHours === null || ageHours > CANVAS_FRESHNESS_HOURS;
  const itemCount = Array.isArray(canvasWeekAhead.items) ? canvasWeekAhead.items.length : 0;

  let detail;
  if (!available) {
    detail = "The week-ahead snapshot is unavailable. Open Canvas Calendar and review the class manually.";
  } else if (stale) {
    const ageLabel = ageHours === null ? "an unknown time" : `${Math.floor(ageHours / 24)} day${Math.floor(ageHours / 24) === 1 ? "" : "s"}`;
    detail = `The week-ahead snapshot was updated ${ageLabel} ago. Refresh the maintained snapshot, then verify Canvas manually.`;
  } else if (itemCount) {
    detail = `${itemCount} Canvas calendar item${itemCount === 1 ? "" : "s"} loaded; verify dates, links, and publication manually.`;
  } else {
    detail = "No Canvas items are listed in the fresh snapshot; verify the course and calendar manually.";
  }

  return {
    available,
    stale,
    itemCount,
    ageHours: ageHours === null ? null : Number(ageHours.toFixed(1)),
    generatedAt: hasValidDate ? generated.toISOString() : null,
    detail
  };
}

function canvasStep(context) {
  return {
    id: "canvas",
    order: 4,
    title: "Complete the manual Canvas action",
    status: context.stale ? "Refresh needed" : "Manual review",
    state: context.stale ? "attention" : "manual",
    detail: context.detail,
    action: "open-canvas-calendar"
  };
}

function matchingGrader(lesson, gradingActivities = []) {
  const expectedIds = new Set([normalize(lesson.id), normalize(`bus123-${lesson.id}`)]);
  return gradingActivities.find((activity) => expectedIds.has(normalize(activity.id))) || null;
}

function activityStep(lesson, readiness, answerKey, gradingActivities) {
  const hasActivity = readiness.student.workbook || readiness.student.assignment || readiness.student.interactive;
  if (!hasActivity) {
    return {
      id: "activity-grader",
      order: 5,
      title: "Confirm activity and grader readiness",
      status: "Not required",
      state: "neutral",
      detail: "No workbook, assignment, or interactive activity is listed for this lesson.",
      targetView: "grading",
      grader: null,
      hasActivity
    };
  }

  const grader = matchingGrader(lesson, gradingActivities);
  const blocked = readiness.answerKeyRequired && !answerKey;
  const state = blocked ? "blocker" : grader ? "ready" : "attention";
  const status = blocked ? "Blocked" : grader ? "Ready" : "Confirm plan";
  const detail = blocked
    ? "The required private answer key or completed instructor file is missing."
    : grader
      ? `${grader.title || grader.id} is available in the private grading workflow.`
      : "The instructor answer file is available, but no exact private grader is registered; confirm the manual grading plan.";

  return {
    id: "activity-grader",
    order: 5,
    title: "Confirm activity and grader readiness",
    status,
    state,
    detail,
    targetView: "grading",
    grader: grader ? {
      id: grader.id,
      title: grader.title || grader.id,
      pointsPossible: grader.pointsPossible || 0
    } : null,
    hasActivity
  };
}

function preparationSteps({ lesson, readiness, instructorNotes, answerKey, canvas, gradingActivities }) {
  return [
    studentPackageStep(lesson, readiness),
    instructorPackageStep(readiness, instructorNotes, answerKey),
    {
      id: "prep-notes",
      order: 3,
      title: "Review prep notes",
      status: "Local check",
      state: "neutral",
      detail: "Uses this lesson's existing private browser prep record.",
      targetView: "instructor"
    },
    canvasStep(canvas),
    activityStep(lesson, readiness, answerKey, gradingActivities),
    {
      id: "after-class",
      order: 6,
      title: "Leave an after-class handoff",
      status: "After class",
      state: "neutral",
      detail: "Save one concise private note for the next teaching pass. This stays in the existing lesson prep record."
    }
  ];
}

function lessonExceptions(lesson, sequence, readiness, activity) {
  const exceptions = [];
  if (readiness.blocking.length) {
    exceptions.push({
      id: `${lesson.id}:package`,
      lessonId: lesson.id,
      sequence,
      severity: "blocker",
      category: "package",
      title: `${lesson.title} has ${readiness.blocking.length} required package gap${readiness.blocking.length === 1 ? "" : "s"}`,
      detail: readiness.blocking.join("; "),
      targetView: "lesson-workspace"
    });
  }

  if (lesson.isVisible === false) {
    exceptions.push({
      id: `${lesson.id}:visibility`,
      lessonId: lesson.id,
      sequence,
      severity: sequence === 0 ? "blocker" : "attention",
      category: "visibility",
      title: `${lesson.title} is hidden from students`,
      detail: "Review the lesson in Visibility & Publish. No visibility change occurs from this queue.",
      targetView: "visibility-publishing"
    });
  }

  if (lesson.isReleased === false) {
    exceptions.push({
      id: `${lesson.id}:release`,
      lessonId: lesson.id,
      sequence,
      severity: sequence === 0 ? "blocker" : "attention",
      category: "release",
      title: `${lesson.title} is not marked released`,
      detail: `The maintained course-map status is “${lesson.status || "Unspecified"}.” Review the release plan before class.`,
      targetView: "visibility-publishing"
    });
  }

  if (activity.hasActivity && activity.state === "attention") {
    exceptions.push({
      id: `${lesson.id}:grader`,
      lessonId: lesson.id,
      sequence,
      severity: "attention",
      category: "grader",
      title: `${lesson.title} needs a confirmed grading plan`,
      detail: activity.detail,
      targetView: "grading"
    });
  }

  return exceptions;
}

function sortExceptions(exceptions) {
  return [...exceptions].sort((a, b) => {
    return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
      || (a.sequence ?? 99) - (b.sequence ?? 99)
      || a.title.localeCompare(b.title);
  });
}

export function buildTeachingWeek({
  dashboard = {},
  gradingActivities = [],
  canvasWeekAhead = {},
  now = new Date(),
  lessonLimit = TEACHING_WEEK_LESSON_LIMIT
} = {}) {
  const ordered = dashboardLessons(dashboard);
  const currentLessonId = dashboard.currentLesson?.id || dashboard.course?.currentLessonId || "";
  const currentIndex = Math.max(0, ordered.findIndex((lesson) => lesson.id === currentLessonId));
  const scopedLessons = ordered.slice(currentIndex, currentIndex + Math.max(1, lessonLimit));
  const canvas = canvasContext(canvasWeekAhead, now);
  const exceptions = [];

  const lessons = scopedLessons.map((lesson, sequence) => {
    const { readiness, instructorNotes, answerKey, qti } = packageReadiness(lesson);
    const steps = preparationSteps({ lesson, readiness, instructorNotes, answerKey, canvas, gradingActivities });
    const activity = steps.find((step) => step.id === "activity-grader");
    exceptions.push(...lessonExceptions(lesson, sequence, readiness, activity));

    return {
      id: lesson.id,
      key: lesson.key,
      title: lesson.title,
      status: lesson.status,
      displayOrder: lesson.displayOrder,
      isCurrent: lesson.id === currentLessonId,
      isVisible: lesson.isVisible !== false,
      isReleased: lesson.isReleased !== false,
      sequence,
      sequenceLabel: sequence === 0 ? "Current class" : sequence === 1 ? "Next class" : `Class +${sequence}`,
      readiness: {
        status: readiness.status,
        blocking: readiness.blocking,
        qtiAvailable: Boolean(qti)
      },
      steps
    };
  });

  if (canvas.stale) {
    exceptions.push({
      id: "canvas:week-ahead",
      lessonId: currentLessonId,
      sequence: -1,
      severity: "attention",
      category: "canvas",
      title: "Canvas week-ahead context needs a manual refresh",
      detail: canvas.detail,
      action: "open-canvas-calendar"
    });
  }

  return {
    generatedAt: new Date(now).toISOString(),
    currentLessonId,
    scope: "Current lesson plus the next two lessons in course-map display order.",
    canvas,
    lessons,
    exceptions: sortExceptions(exceptions)
  };
}
