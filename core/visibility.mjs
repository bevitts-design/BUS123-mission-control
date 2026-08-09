import { createHash } from "node:crypto";

export class VisibilityUpdateError extends Error {
  constructor(message, code = "invalid-visibility-change") {
    super(message);
    this.name = "VisibilityUpdateError";
    this.code = code;
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function courseMapRevision(sourceText) {
  return sha256(sourceText);
}

export function lessonIsVisible(lesson) {
  return lesson?.visible !== false;
}

function orderedLessons(lessons) {
  return lessons
    .map((lesson, index) => ({ lesson, index }))
    .sort((a, b) =>
      (a.lesson.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.lesson.displayOrder ?? Number.MAX_SAFE_INTEGER)
      || a.index - b.index
    )
    .map(({ lesson }) => lesson);
}

export function buildVisibilitySnapshot(courseMap, { revision = "" } = {}) {
  const tracks = new Map((courseMap.tracks ?? []).map((track) => [track.id, track]));
  const currentLessonId = courseMap.course?.currentLessonId || "";
  const groups = new Map();
  const lessons = [];

  for (const lesson of orderedLessons(courseMap.lessons ?? [])) {
    const track = tracks.get(lesson.track) || {};
    const moduleId = String(lesson.module || "Unassigned");
    const groupId = `${lesson.track || "unassigned"}/${moduleId}`;
    const visible = lessonIsVisible(lesson);
    const item = {
      id: lesson.id,
      key: [String(lesson.track || "").toUpperCase(), lesson.module, lesson.lesson].filter(Boolean).join("/"),
      title: lesson.title || lesson.id,
      trackId: lesson.track || "",
      trackLabel: track.label || lesson.track || "Unassigned",
      module: moduleId,
      status: lesson.status || "Unspecified",
      caseStudy: lesson.caseStudy || "",
      skillFocus: lesson.skillFocus ?? [],
      isCurrent: lesson.id === currentLessonId,
      visible,
      visibilityExplicit: typeof lesson.visible === "boolean"
    };

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        trackId: item.trackId,
        trackLabel: item.trackLabel,
        module: moduleId,
        label: `${item.trackLabel} ${moduleId}`,
        lessons: []
      });
    }

    groups.get(groupId).lessons.push(item);
    lessons.push(item);
  }

  const visibleCount = lessons.filter((lesson) => lesson.visible).length;
  return {
    revision,
    course: {
      code: courseMap.course?.code || "BUS123",
      title: courseMap.course?.title || "",
      currentLessonId
    },
    totals: {
      lessons: lessons.length,
      visible: visibleCount,
      hidden: lessons.length - visibleCount
    },
    groups: [...groups.values()],
    lessons
  };
}

export function applyVisibilityChanges(courseMap, rawChanges) {
  if (!Array.isArray(rawChanges) || !rawChanges.length) {
    throw new VisibilityUpdateError("Choose at least one lesson visibility change before saving.", "empty-change-set");
  }

  const next = structuredClone(courseMap);
  const lessonsById = new Map((next.lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const seen = new Set();
  const applied = [];
  const currentLessonId = next.course?.currentLessonId || "";

  for (const rawChange of rawChanges) {
    const lessonId = String(rawChange?.lessonId || "").trim();
    if (!lessonId || seen.has(lessonId)) {
      throw new VisibilityUpdateError(
        lessonId ? `Lesson ${lessonId} appears more than once in the change set.` : "Every visibility change needs a lesson id."
      );
    }
    seen.add(lessonId);

    if (typeof rawChange.visible !== "boolean") {
      throw new VisibilityUpdateError(`Lesson ${lessonId} visibility must be true or false.`);
    }

    const lesson = lessonsById.get(lessonId);
    if (!lesson) {
      throw new VisibilityUpdateError(`Lesson ${lessonId} no longer exists. Reload before saving.`, "stale-lesson");
    }

    if (lessonId === currentLessonId && rawChange.visible === false) {
      throw new VisibilityUpdateError(
        "The current lesson must stay visible. Make another lesson current before hiding this one.",
        "current-lesson-hidden"
      );
    }

    const wasVisible = lessonIsVisible(lesson);
    if (wasVisible === rawChange.visible) continue;
    lesson.visible = rawChange.visible;
    applied.push({
      lessonId,
      title: lesson.title || lessonId,
      wasVisible,
      visible: rawChange.visible
    });
  }

  if (!applied.length) {
    throw new VisibilityUpdateError("The course map already matches the requested visibility.", "no-effective-changes");
  }

  return { courseMap: next, applied };
}
