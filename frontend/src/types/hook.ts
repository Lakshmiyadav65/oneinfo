export type Hook = {
  id: string;
  text: string;
  type: string;
  is_selected: boolean;
  reason: string | null;
  is_recommended: boolean;
  is_custom: boolean;
  created_at: string;
};
