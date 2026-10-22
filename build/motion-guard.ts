import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { rootDir } from "../vite.shared.ts";

const MOTION_CSS = path.join(rootDir, "src/styles/motion.css");
const CLIENT_DIR = path.join(rootDir, "src/client");
const SOURCE_EXTENSIONS = new Set([".vue", ".ts"]);

const EXEMPT_DIRS = new Set([path.join(CLIENT_DIR, "motion")]);

const MOTION_FAMILIES = ["duration-motion", "ease-motion", "ui-anim", "ui-motion", "ui-press", "ui-spin"] as const;

const MOTION_UTILITY = new RegExp(`\\b(?:${MOTION_FAMILIES.join("|")})[a-z0-9-]*`, "g");

const FOREIGN_DURATION = /\bduration-(?!motion-)(\d+|\[[^\]]*\])/g;
const FOREIGN_EASING = /\bease-(?!motion-)(linear|in-out|in|out)\b/g;

const RAW_MILLISECONDS = /\b\d+(?:\.\d+)?ms\b/g;
const RAW_TIME_IN_DECLARATION = /\b(?:transition|animation)(?:-duration)?\s*:[^;{}\n]*?\b\d+(?:\.\d+)?m?s\b/g;
const RAW_EASING = /cubic-bezier\s*\(/g;
const BLANKET_TRANSITION = /\btransition-all\b/g;
const WILL_CHANGE = /\bwill-change\b/g;

const TRANSITION_TAG = /<Transition(?:Group)?\b([^>]*)>/g;
const TRANSITION_NAME = /\bname="([^"]+)"/;

function collectSourceFiles(dir: string, out: string[]): void {
  if (EXEMPT_DIRS.has(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

interface MotionVocabulary {
  utilities: Set<string>;
  recipes: Set<string>;
}

function readVocabulary(): MotionVocabulary {
  const css = fs.readFileSync(MOTION_CSS, "utf8");
  const utilities = new Set<string>();
  for (const match of css.matchAll(/@utility\s+([a-z0-9-]+)/g)) utilities.add(match[1]!);
  const recipes = new Set<string>();
  for (const match of css.matchAll(/\.(ui-[a-z0-9-]+)-enter-active/g)) recipes.add(match[1]!);
  return { utilities, recipes };
}

function relative(file: string): string {
  return path.relative(rootDir, file).split(path.sep).join("/");
}

function checkFile(file: string, vocabulary: MotionVocabulary): string[] {
  const source = fs.readFileSync(file, "utf8");
  const problems: string[] = [];

  for (const match of source.matchAll(MOTION_UTILITY)) {
    const name = match[0];
    if (!vocabulary.utilities.has(name)) {
      problems.push(`unknown motion utility "${name}" — it is not defined in src/styles/motion.css`);
    }
  }

  for (const match of source.matchAll(TRANSITION_TAG)) {
    const name = TRANSITION_NAME.exec(match[1] ?? "")?.[1];
    if (!name) {
      problems.push("<Transition> without a name — the motion system has no default transition");
      continue;
    }
    if (!vocabulary.recipes.has(name)) {
      problems.push(`unknown transition recipe "${name}" — it is not defined in src/styles/motion.css`);
    }
  }

  for (const match of source.matchAll(FOREIGN_DURATION)) {
    problems.push(`"${match[0]}" — use one of the duration-motion-* utilities instead`);
  }
  for (const match of source.matchAll(FOREIGN_EASING)) {
    problems.push(`"${match[0]}" — use one of the ease-motion-* utilities instead`);
  }
  for (const match of source.matchAll(RAW_MILLISECONDS)) {
    problems.push(`raw duration "${match[0]}" — use a motion token instead`);
  }
  for (const match of source.matchAll(RAW_TIME_IN_DECLARATION)) {
    problems.push(`raw duration in "${match[0].trim()}" — use a motion token instead`);
  }
  for (const _match of source.matchAll(RAW_EASING)) {
    problems.push(`raw cubic-bezier() — use one of the ease-motion-* utilities instead`);
  }
  for (const _match of source.matchAll(BLANKET_TRANSITION)) {
    problems.push(`transition-all — use ui-motion, which transitions only paint and transforms`);
  }
  for (const _match of source.matchAll(WILL_CHANGE)) {
    problems.push(`will-change — the compositor promotes what ui-motion animates on its own`);
  }

  return problems.map((problem) => `${relative(file)}: ${problem}`);
}

export function motionGuard(): Plugin {
  let ran = false;
  return {
    name: "modeltide:motion-guard",
    // Runs on `vite dev` and `vite build`: the motion vocabulary is invisible to type-check and lint, so violations
    // used to accumulate locally until someone built for production.
    buildStart() {
      if (ran) return;
      if (this.environment?.name != null && this.environment.name !== "client") return;
      ran = true;
      const vocabulary = readVocabulary();
      const files: string[] = [];
      collectSourceFiles(CLIENT_DIR, files);
      const problems = files.flatMap((file) => checkFile(file, vocabulary));
      if (problems.length > 0) {
        throw new Error(`Motion system violations:\n  ${problems.join("\n  ")}`);
      }
    },
  };
}
