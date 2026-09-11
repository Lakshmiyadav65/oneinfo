/**
 * Puts the face-tracking runtime under public/ so the avatar capture never
 * reaches for a CDN.
 *
 * A capture that stalls because storage.googleapis.com is slow is a capture
 * the creator has to perform again, and the rule in lib/api/client.ts is that
 * the browser talks to this app and nothing else.
 *
 * The files are not committed: the wasm alone is ~35MB. They are copied out
 * of node_modules on install, and the model is fetched once and then cached
 * on disk. public/mediapipe/ is gitignored.
 *
 * Never fails the install. Someone running `npm install` on a plane should
 * get a working app with a capture card that says what is missing, not a
 * broken install.
 */

import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const wasmSource = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmTarget = join(root, "public", "mediapipe", "wasm");
const modelPath = join(root, "public", "mediapipe", "face_landmarker.task");

// Pinned rather than "latest". A model that changes underneath us changes
// where every angle threshold locks, and those are tuned by hand.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(wasmSource))) {
    console.warn("[mediapipe] @mediapipe/tasks-vision is not installed — skipping wasm.");
    return;
  }
  await mkdir(wasmTarget, { recursive: true });
  for (const name of await readdir(wasmSource)) {
    await copyFile(join(wasmSource, name), join(wasmTarget, name));
  }
  console.log("[mediapipe] wasm runtime copied to public/mediapipe/wasm");
}

async function fetchModel() {
  if (await exists(modelPath)) {
    console.log("[mediapipe] face landmarker model already present");
    return;
  }
  await mkdir(dirname(modelPath), { recursive: true });
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelPath));
  console.log("[mediapipe] face landmarker model downloaded");
}

try {
  await copyWasm();
  await fetchModel();
} catch (error) {
  console.warn(
    `[mediapipe] setup incomplete (${error.message}). The avatar capture will say ` +
      "so until `npm run vendor:mediapipe` succeeds; everything else works."
  );
}
