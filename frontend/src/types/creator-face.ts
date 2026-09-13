import type { CreatorRecording } from "@/types/creator-recording";

export type CreatorFaceImage = {
  id: string;
  position: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  /**
   * Which way the head was turned when this frame was grabbed. Null for a
   * photo the creator uploaded, which is every image predating the capture
   * flow.
   */
  angle: "front" | "left" | "right" | null;
  created_at: string;
};

export type FaceSetup = {
  images: CreatorFaceImage[];
  max_images: number;
  consent_granted: boolean;
  consent_at: string | null;
  appearance_description: string | null;
  voice_description: string | null;
  /**
   * Which synthesised voice speaks this creator's videos, and the voices
   * they can choose between. Null means the deployment's configured
   * default, which is what everyone had before there was a choice.
   */
  speech_speaker: string | null;
  speech_speakers: string[];
  /**
   * The capture the images were cut from, when there is one. Null means they
   * were uploaded, or the creator deleted the recording and kept the frames.
   */
  recording: CreatorRecording | null;
  /** False whenever generation would refuse: no photos, or no consent. */
  ready_for_generation: boolean;
};
