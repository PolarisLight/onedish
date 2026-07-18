import { access, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";


const VISIBLE_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;


export function containsVisibleCjk(text) {
  return VISIBLE_CJK.test(text);
}


export function validateMediaDuration(actualSeconds, requiredSeconds) {
  if (!Number.isFinite(actualSeconds) || actualSeconds <= 0) {
    throw new Error("Physical capture duration must be a finite positive number");
  }
  if (!Number.isFinite(requiredSeconds) || requiredSeconds <= 0) {
    throw new Error("Required capture duration must be a finite positive number");
  }
  if (actualSeconds < requiredSeconds) {
    throw new Error(
      `Physical capture duration ${actualSeconds.toFixed(3)}s is shorter than required ${requiredSeconds.toFixed(3)}s`,
    );
  }
  return actualSeconds;
}


async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}


export async function publishCaptureArtifacts({
  stagedVideo,
  stagedTimeline,
  captureDir,
  replace = rename,
}) {
  await mkdir(captureDir, { recursive: true });
  const token = randomUUID();
  const artifacts = [
    { staged: stagedVideo, destination: resolve(captureDir, "capture-session.webm") },
    { staged: stagedTimeline, destination: resolve(captureDir, "capture-timeline.json") },
  ].map((artifact) => ({
    ...artifact,
    backup: resolve(captureDir, `.${basename(artifact.destination)}.${token}.backup`),
  }));
  const backedUp = [];
  const installed = [];

  try {
    for (const artifact of artifacts) {
      if (await exists(artifact.destination)) {
        await replace(artifact.destination, artifact.backup);
        backedUp.push(artifact);
      }
    }
    for (const artifact of artifacts) {
      await replace(artifact.staged, artifact.destination);
      installed.push(artifact);
    }
  } catch (error) {
    for (const artifact of installed.reverse()) {
      await rm(artifact.destination, { force: true });
    }
    for (const artifact of backedUp.reverse()) {
      await replace(artifact.backup, artifact.destination);
    }
    throw error;
  }

  await Promise.all(artifacts.map(({ backup }) => rm(backup, { force: true })));
  const rawPlaywrightVideos = (await readdir(captureDir))
    .filter((name) => /^page@.+\.webm$/.test(name));
  await Promise.all(rawPlaywrightVideos.map((name) => (
    rm(resolve(captureDir, name), { force: true })
  )));
}


export async function finalizeCaptureArtifacts({
  stagedVideo,
  stagedTimeline,
  captureDir,
  requiredSeconds,
  probeDuration,
  publish = publishCaptureArtifacts,
}) {
  const actualSeconds = await probeDuration(stagedVideo);
  validateMediaDuration(actualSeconds, requiredSeconds);
  await publish({ stagedVideo, stagedTimeline, captureDir });
  return actualSeconds;
}
