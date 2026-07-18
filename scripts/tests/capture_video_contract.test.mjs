import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  containsVisibleCjk,
  finalizeCaptureArtifacts,
  publishCaptureArtifacts,
  validateMediaDuration,
} from "../capture_video_contract.mjs";

test("accepts physical media that covers the full required duration", () => {
  assert.equal(validateMediaDuration(134.568, 134.568), 134.568);
  assert.equal(validateMediaDuration(135.02, 134.568), 135.02);
});

test("rejects physical media shorter than the full required duration", () => {
  assert.throws(
    () => validateMediaDuration(134.48, 134.568),
    /Physical capture duration 134\.480s is shorter than required 134\.568s/,
  );
});

test("rejects invalid probe output", () => {
  assert.throws(() => validateMediaDuration(Number.NaN, 134.568), /finite positive number/);
});

test("detects representative CJK text beyond a fixed blacklist", () => {
  for (const text of ["宫保鸡丁", "今日推荐", "カレー", "비빔밥", "ㄅㄆㄇ"]) {
    assert.equal(containsVisibleCjk(text), true, text);
  }
  assert.equal(containsVisibleCjk("Roasted Vegetable Soup · $14.79"), false);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "onedish-capture-contract-"));
  const stageDir = join(root, "stage");
  const captureDir = join(root, "capture");
  await import("node:fs/promises").then(({ mkdir }) => Promise.all([
    mkdir(stageDir, { recursive: true }),
    mkdir(captureDir, { recursive: true }),
  ]));
  const stagedVideo = join(stageDir, "capture-session.webm");
  const stagedTimeline = join(stageDir, "capture-timeline.json");
  await writeFile(stagedVideo, "new-video");
  await writeFile(stagedTimeline, "new-timeline");
  return { root, stageDir, captureDir, stagedVideo, stagedTimeline };
}

async function assertMissing(path) {
  await assert.rejects(access(path), { code: "ENOENT" });
}

test("ffprobe failure preserves the last good canonical pair", async () => {
  const paths = await fixture();
  const video = join(paths.captureDir, "capture-session.webm");
  const timeline = join(paths.captureDir, "capture-timeline.json");
  await writeFile(video, "old-video");
  await writeFile(timeline, "old-timeline");
  await writeFile(join(paths.captureDir, "page@obsolete.webm"), "raw-playwright-video");
  try {
    await assert.rejects(
      finalizeCaptureArtifacts({
        ...paths,
        requiredSeconds: 10,
        probeDuration: async () => { throw new Error("injected ffprobe failure"); },
      }),
      /injected ffprobe failure/,
    );
    assert.equal(await readFile(video, "utf8"), "old-video");
    assert.equal(await readFile(timeline, "utf8"), "old-timeline");
    assert.equal(
      await readFile(join(paths.captureDir, "page@obsolete.webm"), "utf8"),
      "raw-playwright-video",
    );
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test("duration validation failure preserves the last good canonical pair", async () => {
  const paths = await fixture();
  const video = join(paths.captureDir, "capture-session.webm");
  const timeline = join(paths.captureDir, "capture-timeline.json");
  await writeFile(video, "old-video");
  await writeFile(timeline, "old-timeline");
  await writeFile(join(paths.captureDir, "page@obsolete.webm"), "raw-playwright-video");
  try {
    await assert.rejects(
      finalizeCaptureArtifacts({ ...paths, requiredSeconds: 10, probeDuration: async () => 9.9 }),
      /shorter than required/,
    );
    assert.equal(await readFile(video, "utf8"), "old-video");
    assert.equal(await readFile(timeline, "utf8"), "old-timeline");
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test("second-file publication failure rolls back both canonical artifacts", async () => {
  const paths = await fixture();
  const video = join(paths.captureDir, "capture-session.webm");
  const timeline = join(paths.captureDir, "capture-timeline.json");
  await writeFile(video, "old-video");
  await writeFile(timeline, "old-timeline");
  const { rename } = await import("node:fs/promises");
  try {
    await assert.rejects(
      publishCaptureArtifacts({
        ...paths,
        replace: async (source, destination) => {
          if (source === paths.stagedTimeline && destination === timeline) {
            throw new Error("injected timeline publication failure");
          }
          await rename(source, destination);
        },
      }),
      /injected timeline publication failure/,
    );
    assert.equal(await readFile(video, "utf8"), "old-video");
    assert.equal(await readFile(timeline, "utf8"), "old-timeline");
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test("publication failure without prior artifacts leaves no partial pair", async () => {
  const paths = await fixture();
  const video = join(paths.captureDir, "capture-session.webm");
  const timeline = join(paths.captureDir, "capture-timeline.json");
  const { rename } = await import("node:fs/promises");
  try {
    await assert.rejects(
      publishCaptureArtifacts({
        ...paths,
        replace: async (source, destination) => {
          if (source === paths.stagedTimeline) throw new Error("injected publication failure");
          await rename(source, destination);
        },
      }),
      /injected publication failure/,
    );
    await assertMissing(video);
    await assertMissing(timeline);
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test("successful publication replaces the pair and cleans backups", async () => {
  const paths = await fixture();
  const video = join(paths.captureDir, "capture-session.webm");
  const timeline = join(paths.captureDir, "capture-timeline.json");
  await writeFile(video, "old-video");
  await writeFile(timeline, "old-timeline");
  await writeFile(join(paths.captureDir, "page@obsolete.webm"), "raw-playwright-video");
  try {
    await publishCaptureArtifacts(paths);
    assert.equal(await readFile(video, "utf8"), "new-video");
    assert.equal(await readFile(timeline, "utf8"), "new-timeline");
    assert.deepEqual((await readdir(paths.captureDir)).sort(), [
      "capture-session.webm",
      "capture-timeline.json",
    ]);
    await assertMissing(paths.stagedVideo);
    await assertMissing(paths.stagedTimeline);
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});
