import type { TFunction, TranslationKey } from "@/shared/i18n";
import { titleCase } from "@/shared/utils/text";

export { OTHER_TASK_KEY, UNTAGGED_TASK_KEY } from "@/shared/utils/task-share";
export type { TaskSlice } from "@/shared/types/app";

export const TASK_LABEL_KEYS: Record<string, TranslationKey> = {
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
