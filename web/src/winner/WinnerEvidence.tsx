import type { Candidate } from "../domain/contracts";
import type { SupportedLocale } from "../recommendation/types";
import { strongestWinnerReasons } from "../elimination/trace-view-model";
import { useLocale } from "../i18n/locale";

export function WinnerEvidence({ candidate, reasonCodes, locale }: { readonly candidate: Candidate; readonly reasonCodes: readonly string[]; readonly locale: SupportedLocale }) {
  const { t } = useLocale();
  const reasons = strongestWinnerReasons(reasonCodes, locale);
  const values = locale === "en"
    ? [`${candidate.dish.estimated_minutes} min`, `${candidate.dish.protein_g.min}–${candidate.dish.protein_g.max}g protein`, t("winner.compared")]
    : [`${candidate.dish.estimated_minutes} 分钟`, `${candidate.dish.protein_g.min}–${candidate.dish.protein_g.max}克蛋白质`, t("winner.compared")];
  return <section className="winner-evidence" aria-labelledby="winner-evidence-title">
    <h2 id="winner-evidence-title">{t("winner.why")}</h2>
    <ol>{reasons.map((reason, index) => <li key={`${reason}-${index}`} aria-label={t("winner.reasonLabel", { count: index + 1 })}><strong>{reason}</strong><span>{values[index]}</span></li>)}</ol>
  </section>;
}
