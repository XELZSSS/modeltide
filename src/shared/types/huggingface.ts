/** A model from the Hugging Face Hub open-source leaderboard. */
export interface OpenSourceModelEntry {
  id: string;
  author: string;
  downloads: number;
  likes: number;
  license: string;
  task: string | null;
  createdAt: string | null;
  lastModified: string | null;
  tags: string[];
}
