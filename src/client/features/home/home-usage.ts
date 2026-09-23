import type { TranslationKey } from "@/shared/i18n";

const TASK_SLICE_LIMIT = 5;
export const OTHER_TASK_KEY = "__other__";

interface TaskSlice {
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

function formatTaskLabel(task: string): string {
  return task
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function taskLabel(task: string, t: (key: TranslationKey) => string): string {
  const key = TASK_LABEL_KEYS[task];
  return key ? t(key) : formatTaskLabel(task);
}

export function aggregateTaskShare(models: { task: string | null | undefined }[]): {
  slices: TaskSlice[];
  total: number;
} {
  const counts = new Map<string, number>();
  let other = 0;
  for (const model of models) {
    const task = typeof model.task === "string" ? model.task.trim() : "";
    if (!task) {
      other += 1;
      continue;
    }
    counts.set(task, (counts.get(task) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const slices: TaskSlice[] = ranked.slice(0, TASK_SLICE_LIMIT).map(([key, total]) => ({ key, total }));
  const tailTotal = ranked.slice(TASK_SLICE_LIMIT).reduce((sum, [, count]) => sum + count, 0) + other;
  if (tailTotal > 0) slices.push({ key: OTHER_TASK_KEY, total: tailTotal });
  return { slices, total: slices.reduce((sum, s) => sum + s.total, 0) };
}
