export type CreatorFaceImage = {
  id: string;
  position: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  created_at: string;
};

export type FaceSetup = {
  images: CreatorFaceImage[];
  max_images: number;
  consent_granted: boolean;
  consent_at: string | null;
  appearance_description: string | null;
  voice_description: string | null;
  /** False whenever generation would refuse: no photos, or no consent. */
  ready_for_generation: boolean;
};
