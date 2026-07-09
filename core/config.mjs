import fs from "node:fs/promises";
import os from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_REPO_NAMES = {
  publicRepo: "BUS123-Solving-Business-Problems-with-Technology",
  instructorRepo: "BUS123-instructor",
  missionControlRepo: "BUS123-mission-control"
};

function defaultPaths() {
  const githubRoot = join(os.homedir(), "Documents", "GitHub");
  return Object.fromEntries(
    Object.entries(DEFAULT_REPO_NAMES).map(([key, name]) => [key, join(githubRoot, name)])
  );
}

async function readJson(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not read local configuration at ${path}: ${error.message}`);
  }
}

function expandHome(value) {
  if (!value) return "";
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(os.homedir(), value.slice(2));
  return resolve(value);
}

export async function loadLocalConfig({ root, env = process.env } = {}) {
  const configPath = env.BUS123_CONFIG
    ? expandHome(env.BUS123_CONFIG)
    : join(root || process.cwd(), "config", "local-config.json");
  const fileConfig = await readJson(configPath);
  const activeProfile = env.BUS123_PROFILE || fileConfig?.activeProfile || "teaching";
  const selected = fileConfig?.profiles?.[activeProfile] || {};
  const defaults = defaultPaths();

  const paths = {
    publicRepo: expandHome(env.BUS123_PUBLIC_REPO || selected.publicRepo || defaults.publicRepo),
    instructorRepo: expandHome(env.BUS123_INSTRUCTOR_REPO || selected.instructorRepo || defaults.instructorRepo),
    missionControlRepo: expandHome(env.BUS123_MISSION_CONTROL_REPO || selected.missionControlRepo || root || defaults.missionControlRepo)
  };

  return {
    configPath,
    configFound: Boolean(fileConfig),
    activeProfile,
    profileLabel: selected.label || activeProfile,
    platform: process.platform,
    paths,
    features: {
      privateMaterials: selected.features?.privateMaterials ?? true,
      grading: selected.features?.grading ?? true,
      publishing: selected.features?.publishing ?? true
    }
  };
}
