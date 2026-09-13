"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_BRAND, type BrandProfile } from "@/types/poster";
import { loadBrand, saveBrand, type StorageResult } from "@/lib/poster/storage";

/**
 * The shop's details, remembered.
 *
 * Read in a mount effect rather than a useState initializer: storage does not
 * exist on the server, and seeding state from it during render makes the first
 * client render disagree with the HTML. The one frame of `loaded: false` that
 * costs is also what lets the composer avoid flashing an empty brand form at
 * someone who filled it in last week.
 */
export function useBrandProfile() {
  const [brand, setBrand] = useState<BrandProfile>(DEFAULT_BRAND);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = loadBrand();
    // Storage is an external system that only exists in the browser, and it
    // cannot be read during render without the server's HTML disagreeing with
    // the first client render.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored) setBrand(stored);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const save = useCallback((next: BrandProfile): StorageResult => {
    setBrand(next);
    return saveBrand(next);
  }, []);

  /** Enough to put their name on a poster. The rest is optional. */
  const hasBrand = loaded && brand.shop_name.trim().length > 0;

  return { brand, setBrand, save, loaded, hasBrand };
}
