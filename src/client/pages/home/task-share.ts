import type { TFunction, TranslationKey } from "@/shared/i18n";
import { titleCase } from "@/shared/utils/text";

const TASK_SLICE_LIMIT = 5;
export const OTHER_TASK_KEY = "__other__";
// Models carrying no task tag at all are a different thing from the ranked tail:
// one is missing data, the other is real tasks that did not make the top cut.
// Collapsing both into a single "Other" slice made the legend ambiguous, so
// they get their own slices.
export const UNTAGGED_TASK_KEY = "__untagged__";

export interface TaskSlice {
  key: string;
  total: number;
}

const TASK_LABEL_KEYS: Record<string, TranslationKey> = {
  "text-generation": "taskTextGeneration",
  "text-to-image": "taskTextToImage",
  "image-text-to-text": "taskImageTextToText",
  "image-to-image": "taskImageToImage",
  "automatic-speech-recognition": "taskSpeechRecognition",
  "text-to-speech": "taskTextToSpeech",
  "text-to-video": "taskTextToVideo",
  "video-text-to-text": "taskVideoTextToText",
  "image-classification": "taskImageClassification",
  "object-detection": "taskObjectDetection",
  "text-classification": "taskTextClassification",
  translation: "taskTranslation",
  summarization: "taskSummarization",
  "question-answering": "taskQuestionAnswering",
};

export function taskLabel(task: string, t: TFunction): string {
  const key = TASK_LABEL_KEYS[task];
  return key ? t(key) : titleCase(task);
}

export function aggregateTaskShare(models: { task: string | null | undefined }[]): {
  slices: TaskSlice[];
  total: number;
} {
  const counts = new Map<string, number>();
  let untagged = 0;
  for (const model of models) {
    const task = typeof model.task === "string" ? model.task.trim() : "";
    if (!task) {
      untagged += 1;
      continue;
    }
    counts.set(task, (counts.get(task) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // `total` stays the count of every model so the share percentages keep their
  // original denominator; only the slice breakdown distinguishes the two cases.
  let total = untagged;
  const slices: TaskSlice[] = ranked.slice(0, TASK_SLICE_LIMIT).map(([key, count]) => {
    total += count;
    return { key, total: count };
  });
  const tailTotal = ranked.slice(TASK_SLICE_LIMIT).reduce((sum, [, count]) => sum + count, 0);
  total += tailTotal;
  if (untagged > 0) slices.push({ key: UNTAGGED_TASK_KEY, total: untagged });
  if (tailTotal > 0) slices.push({ key: OTHER_TASK_KEY, total: tailTotal });
  return { slices, total };
}
