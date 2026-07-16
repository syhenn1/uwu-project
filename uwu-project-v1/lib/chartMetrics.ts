import { CHECKPOINT_GROUPS } from "./knowledge/checkpoints";
import { KEY_TO_HEADER } from "./columns";
import type { FacilRow } from "./types";

export interface ComparableMetric {
  kolom: keyof FacilRow;
  label: string;
  category: string;
  polarity: "higherIsBetter" | "higherIsWorse";
}

/** Semua kolom persentase yang tercatat di basis pengetahuan checkpoint,
 * dikelompokkan per checkpoint, dengan arah baik/buruknya masing-masing -
 * dipakai untuk mengisi dropdown pemilih metrik pada chart perbandingan. */
export const COMPARABLE_METRICS: ComparableMetric[] = CHECKPOINT_GROUPS.flatMap((group) =>
  group.indicators
    .filter((ind) => ind.kolom !== "fasilBelumLoginLK")
    .map((ind) => ({
      kolom: ind.kolom,
      label: KEY_TO_HEADER[ind.kolom] ?? String(ind.kolom),
      category: `${group.no}. ${group.name}`,
      polarity: ind.polarity ?? "higherIsWorse",
    }))
);

/** Menormalkan nilai mentah jadi "skor kebaikan" 0-100 di mana 100 = paling
 * baik, TERLEPAS dari arah kolom aslinya (ada yang 100%=baik, ada yang
 * 0%=baik). Dipakai supaya warna chart konsisten artinya di semua metrik. */
export function computeGoodness(value: number, polarity: "higherIsBetter" | "higherIsWorse"): number {
  return polarity === "higherIsBetter" ? value : 100 - value;
}

export type GoodnessBucket = "good" | "warning" | "critical";

export function goodnessBucket(goodness: number): GoodnessBucket {
  if (goodness >= 90) return "good";
  if (goodness >= 70) return "warning";
  return "critical";
}
