import type { EliminationStage, StageId } from "../domain/contracts";
import type { SupportedLocale } from "../recommendation/types";

const copy: Readonly<Record<string, Readonly<Record<SupportedLocale, string>>>> = {
  allergen_excluded: { en: "Conflicts with your allergy settings", "zh-CN": "与你的过敏原设置冲突" },
  ingredient_excluded: { en: "Contains an excluded ingredient", "zh-CN": "包含已排除的食材" },
  over_budget: { en: "Over your usual budget", "zh-CN": "超过你的常用预算" },
  energy_outside_range: { en: "Outside today's energy range", "zh-CN": "不符合今天的能量范围" },
  protein_below_floor: { en: "Not enough protein today", "zh-CN": "今天的蛋白质不足" },
  recent_repetition: { en: "Too similar to a recent meal", "zh-CN": "与近期用餐过于相似" },
  session_excluded: { en: "Skipped in this session", "zh-CN": "本次已跳过" },
  taste_mismatch: { en: "Not the taste you want now", "zh-CN": "不符合你现在想要的口味" },
  too_slow: { en: "Takes longer than your available time", "zh-CN": "所需时间超过你的空闲时间" },
  taste_match: { en: "Matches what sounds good", "zh-CN": "符合你现在想吃的口味" },
  protein_match: { en: "Fits today's protein need", "zh-CN": "符合今天的蛋白质需求" },
  recent_variety: { en: "Different from recent meals", "zh-CN": "不同于近期餐食" },
  duration_match: { en: "Fits your available time", "zh-CN": "符合你的空闲时间" },
  confidence_match: { en: "Backed by a stronger estimate", "zh-CN": "信息估计更可靠" },
  meal_period_match: { en: "Fits this meal", "zh-CN": "适合当前用餐时段" },
};

const stageCopy: Readonly<Record<StageId, Readonly<Record<SupportedLocale, string>>>> = {
  found: { en: "Nearby options found", "zh-CN": "已找到附近选项" },
  available: { en: "Available places", "zh-CN": "当前可用餐厅" },
  safety_budget: { en: "Safety and budget checked", "zh-CN": "已检查安全与预算" },
  safety: { en: "Safety settings applied", "zh-CN": "已应用安全设置" },
  nutrition: { en: "Nutrition fit checked", "zh-CN": "已检查营养匹配" },
  repetition: { en: "Recent meals compared", "zh-CN": "已对比近期餐食" },
  taste_confidence: { en: "Taste and confidence compared", "zh-CN": "已比较口味与可信度" },
  taste: { en: "Taste preference applied", "zh-CN": "已应用口味偏好" },
  duration: { en: "Time limit applied", "zh-CN": "已应用时间限制" },
  budget: { en: "Budget applied", "zh-CN": "已应用预算" },
  winner: { en: "One dish remains", "zh-CN": "最终留下一个选择" },
};

export interface TraceStageView {
  readonly id: StageId;
  readonly count: number;
  readonly removedCount: number;
  readonly reasonCode: string | null;
  readonly reasonText: string;
  readonly removedIds: readonly string[];
}

export function projectTraceStage(stage: EliminationStage, locale: SupportedLocale): TraceStageView {
  const reason = Object.entries(stage.reason_counts)
    .sort(([leftCode, leftCount], [rightCode, rightCount]) => rightCount - leftCount || leftCode.localeCompare(rightCode))[0];
  const reasonCode = reason?.[0] ?? null;
  return {
    id: stage.id,
    count: stage.survivor_count,
    removedCount: Math.max(0, stage.input_count - stage.survivor_count),
    reasonCode,
    reasonText: reasonCode ? copy[reasonCode]?.[locale] ?? (locale === "en" ? "Lower match" : "匹配度较低") : stageCopy[stage.id][locale],
    removedIds: stage.representative_removed_ids,
  };
}

export function strongestWinnerReasons(reasonCodes: readonly string[], locale: SupportedLocale): readonly string[] {
  return reasonCodes.slice(0, 3).map((code) => copy[code]?.[locale] ?? (locale === "en" ? "Strong overall match" : "整体匹配度高"));
}
