"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANGLE_ORDER,
  DWELL_MS,
  FRAMING_HOLD_MS,
  STAGE_TIMEOUT_MS,
  frameQuality,
  guidanceFor,
  isOnTarget,
  problemText,
  yawDegrees,
  type AngleName,
  type LandmarkerResult,
} from "@/lib/avatar/tracking";
import type { ConfirmedAngle } from "@/types/creator-recording";

/**
 * The live avatar capture, as an explicit state machine.
 *
 * The session never advances on a turn it did not measure. That is the whole
 * reason for tracking the head rather than running a timer: a fixed countdown
 * cannot tell someone who turned from someone who sat still, and a reference
 * set built from three identical front-on frames is worse than useless
 * because nothing about it looks wrong.
 *
 * Everything the render loop mutates lives in refs. State is only what the
 * component draws, so a sixty-times-a-second tracking loop doesn't re-run the
 * effect that owns the camera.
 */

export type CaptureStage =
  | "idle"
  | "starting"
  | "framing"
  | "front"
  | "left"
  | "right"
  | "review";

export type CaptureResult = {
  take: Blob;
  frames: Blob[];
  angles: ConfirmedAngle[];
  /** Object URLs for the three grabbed frames, for the review step. */
  previews: string[];
  /**
   * The take itself, playable. The live preview is dead by the time review
   * renders - its tracks are stopped the moment recording ends - so review
   * plays the recording rather than showing a frozen camera.
   */
  takeUrl: string;
};

type Session = {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  onTargetSince: number | null;
  stageEnteredAt: number;
  stageIndex: number;
  frames: Blob[];
  angles: ConfirmedAngle[];
  frameCount: number;
  brightness: number | null;
  stopped: boolean;
};

/** MediaRecorder types we'll ask for, best first. */
const PREFERRED_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function isCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    pickMimeType() !== undefined
  );
}

/** Mean luma of a downscaled frame, 0-255. */
function measureBrightness(video: HTMLVideoElement, canvas: HTMLCanvasElement): number | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !video.videoWidth) return null;
  canvas.width = 64;
  canvas.height = 36;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return total / (data.length / 4);
  } catch {
    // A tainted canvas shouldn't take the session down with it.
    return null;
  }
}

function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Couldn't read a frame from the camera."));
  context.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't read a frame from the camera.")),
      "image/jpeg",
      0.92
    );
  });
}

export function useCaptureSession() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<{ detectForVideo: (v: HTMLVideoElement, t: number) => LandmarkerResult; close?: () => void } | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const rafRef = useRef<number | null>(null);
  const brightnessCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stage, setStage] = useState<CaptureStage>("idle");
  const [guidance, setGuidance] = useState<string>("");
  const [dwell, setDwell] = useState(0);
  const [yaw, setYaw] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const session = sessionRef.current;
    if (session) {
      session.stopped = true;
      if (session.recorder.state !== "inactive") session.recorder.stop();
      session.stream.getTracks().forEach((track) => track.stop());
    }
    sessionRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // The camera and the model are the two things that must not outlive the
  // component. Everything else is a blob or a number.
  useEffect(() => {
    return () => {
      teardown();
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, [teardown]);

  const fail = useCallback(
    (message: string) => {
      teardown();
      setStage("idle");
      setDwell(0);
      setError(message);
    },
    [teardown]
  );

  // The loop schedules itself, so it has to reach its own current version
  // through a ref rather than closing over the identity it had when it was
  // created. Closing over it would pin the first render's `fail`.
  const loopRef = useRef<() => void>(() => {});

  const loop = useCallback(() => {
    const video = videoRef.current;
    const session = sessionRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !session || !landmarker || session.stopped) return;

    rafRef.current = requestAnimationFrame(() => loopRef.current());
    if (!video.videoWidth) return;

    const now = performance.now();
    let detection: LandmarkerResult;
    try {
      detection = landmarker.detectForVideo(video, now);
    } catch {
      // A dropped frame is not a failed session.
      return;
    }

    // Reading pixels back is the expensive part of this loop, and the light
    // in a room doesn't change between frames. Every tenth is plenty.
    session.frameCount += 1;
    if (session.frameCount % 10 === 0 && brightnessCanvasRef.current) {
      session.brightness = measureBrightness(video, brightnessCanvasRef.current);
    }

    const currentStage = session.stageIndex < 0 ? "framing" : ANGLE_ORDER[session.stageIndex];

    if (currentStage === "framing") {
      const problem = frameQuality(detection, session.brightness);
      setYaw(null);
      setGuidance(problem ? problemText(problem) : "Looking good. Hold there.");
      if (problem) {
        session.onTargetSince = null;
        setDwell(0);
        return;
      }
      session.onTargetSince ??= now;
      const held = now - session.onTargetSince;
      setDwell(Math.min(1, held / FRAMING_HOLD_MS));
      if (held >= FRAMING_HOLD_MS) {
        session.onTargetSince = null;
        session.stageIndex = 0;
        session.stageEnteredAt = now;
        session.startedAt = now;
        session.recorder.start(1000);
        setDwell(0);
        setStage("front");
      }
      return;
    }

    const angle = currentStage as AngleName;
    const measured = yawDegrees(detection);
    setYaw(measured);
    setGuidance(guidanceFor(angle, measured));

    if (!isOnTarget(angle, measured)) {
      session.onTargetSince = null;
      setDwell(0);
      if (now - session.stageEnteredAt > STAGE_TIMEOUT_MS) {
        fail(
          `We couldn't see you turn ${angle === "front" ? "back to the camera" : `to your ${angle}`}. ` +
            "Nothing was saved — try again, turning slowly and holding at the end."
        );
      }
      return;
    }

    session.onTargetSince ??= now;
    const held = now - session.onTargetSince;
    setDwell(Math.min(1, held / DWELL_MS));
    if (held < DWELL_MS) return;

    // Confirmed. Grab the frame at this instant rather than seeking the
    // recording for it later.
    session.onTargetSince = null;
    const offset = (now - session.startedAt) / 1000;
    const capturedAngle: ConfirmedAngle = {
      angle,
      offset_seconds: Number(offset.toFixed(3)),
      yaw_degrees: measured === null ? null : Number(measured.toFixed(1)),
    };

    void grabFrame(video)
      .then((blob) => {
        const live = sessionRef.current;
        if (!live || live.stopped) return;
        live.frames.push(blob);
        live.angles.push(capturedAngle);

        if (live.stageIndex + 1 < ANGLE_ORDER.length) {
          live.stageIndex += 1;
          live.stageEnteredAt = performance.now();
          setDwell(0);
          setStage(ANGLE_ORDER[live.stageIndex]);
          return;
        }
        live.stopped = true;
        if (live.recorder.state !== "inactive") live.recorder.stop();
      })
      .catch((err) => fail(err instanceof Error ? err.message : "Couldn't read a frame."));
  }, [fail]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    setDwell(0);
    setStage("starting");

    const mimeType = pickMimeType();
    if (!mimeType) {
      fail("This browser can't record video. Add a photo instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        // The creator speaks through the take, which keeps the mouth moving
        // and gives a natural frame rather than a posed one.
        audio: true,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      fail(
        name === "NotAllowedError"
          ? "The camera was blocked. Allow it in your browser, or add a photo instead."
          : name === "NotFoundError"
            ? "No camera found. Add a photo instead."
            : "Couldn't open the camera. Add a photo instead."
      );
      return;
    }

    if (!landmarkerRef.current) {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
        landmarkerRef.current = (await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        })) as unknown as typeof landmarkerRef.current;
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        fail(
          "Face tracking couldn't load. Run `npm run vendor:mediapipe`, or add a photo instead."
        );
        return;
      }
    }

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    const session: Session = {
      stream,
      recorder,
      chunks: [],
      startedAt: performance.now(),
      onTargetSince: null,
      stageEnteredAt: performance.now(),
      // Below zero means framing: the recorder hasn't started yet, so a
      // creator sorting out their light isn't in the take.
      stageIndex: -1,
      frames: [],
      angles: [],
      frameCount: 0,
      brightness: null,
      stopped: false,
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) session.chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (session.angles.length !== ANGLE_ORDER.length) return;
      const take = new Blob(session.chunks, { type: mimeType });
      setResult({
        take,
        frames: session.frames,
        angles: session.angles,
        previews: session.frames.map((frame) => URL.createObjectURL(frame)),
        takeUrl: URL.createObjectURL(take),
      });
      setStage("review");
    };

    sessionRef.current = session;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => undefined);
    }
    setStage("framing");
    rafRef.current = requestAnimationFrame(loop);
  }, [fail, loop]);

  const cancel = useCallback(() => {
    teardown();
    setStage("idle");
    setDwell(0);
    setGuidance("");
    setYaw(null);
  }, [teardown]);

  const discard = useCallback(() => {
    setResult((current) => {
      current?.previews.forEach((url) => URL.revokeObjectURL(url));
      if (current) URL.revokeObjectURL(current.takeUrl);
      return null;
    });
    setStage("idle");
    setDwell(0);
    setGuidance("");
    setYaw(null);
  }, []);

  return {
    stage,
    guidance,
    dwell,
    yaw,
    error,
    result,
    videoRef,
    brightnessCanvasRef,
    start,
    cancel,
    discard,
  };
}
