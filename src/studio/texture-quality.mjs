// Public tools retain ultra=8K; Studio's production wire enum is extreme.
export const studioTextureQuality = (quality) =>
  quality === "ultra" ? "extreme" : quality;

export const publicTextureQuality = (quality) =>
  quality === "extreme" ? "ultra" : quality;

export const textureSize = (quality) =>
  ({ standard: 2048, detailed: 4096, ultra: 8192, extreme: 8192 })[quality];
