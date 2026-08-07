import type { LyxMoodTier } from "@/components/LyxMascot";

// Her sayfa için 5 skor aralığına özel (kritik/düşük/orta/iyi/harika)
// görseller client/assets/images/lyx/ altında tutulur; her tier kendi
// görselini gösterir.
export const KILER_MOOD_IMAGES: Record<LyxMoodTier, number> = {
  kritik: require("@/assets/images/lyx/lyx_kiler_kritik.png"),
  dusuk: require("@/assets/images/lyx/lyx_kiler_dusuk.png"),
  orta: require("@/assets/images/lyx/lyx_kiler_orta.png"),
  iyi: require("@/assets/images/lyx/lyx_kiler_iyi.png"),
  harika: require("@/assets/images/lyx/lyx_kiler_harika.png"),
};

export const TARA_MOOD_IMAGES: Record<LyxMoodTier, number> = {
  kritik: require("@/assets/images/lyx/lyx_tara_kritik.png"),
  dusuk: require("@/assets/images/lyx/lyx_tara_dusuk.png"),
  orta: require("@/assets/images/lyx/lyx_tara_orta.png"),
  iyi: require("@/assets/images/lyx/lyx_tara_iyi.png"),
  harika: require("@/assets/images/lyx/lyx_tara_harika.png"),
};

export const TARIFLER_MOOD_IMAGES: Record<LyxMoodTier, number> = {
  kritik: require("@/assets/images/lyx/lyx_tarifler_kritik.png"),
  dusuk: require("@/assets/images/lyx/lyx_tarifler_dusuk.png"),
  orta: require("@/assets/images/lyx/lyx_tarifler_orta.png"),
  iyi: require("@/assets/images/lyx/lyx_tarifler_iyi.png"),
  harika: require("@/assets/images/lyx/lyx_tarifler_harika.png"),
};

export const PANEL_MOOD_IMAGES: Record<LyxMoodTier, number> = {
  kritik: require("@/assets/images/lyx/lyx_panel_kritik.png"),
  dusuk: require("@/assets/images/lyx/lyx_panel_dusuk.png"),
  orta: require("@/assets/images/lyx/lyx_panel_orta.png"),
  iyi: require("@/assets/images/lyx/lyx_panel_iyi.png"),
  harika: require("@/assets/images/lyx/lyx_panel_harika.png"),
};
