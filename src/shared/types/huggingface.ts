/** A model from the Hugging Face Hub open-source leaderboard. */
export interface OpenSourceModelEntry {
  id: string;
  /** Author org/user; null when unknown — display via orNA(t)/t("unknown"), not a sentinel. */
  author: string | null;
  downloads: number;
  likes: number;
  /** SPDX-ish license id; null when unrecognized — display via orNA(t). */
  license: string | null;
  task: string | null;
  createdAt: string | null;
  lastModified: string | null;
  tags: string[];
}
