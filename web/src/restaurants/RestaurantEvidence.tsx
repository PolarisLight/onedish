import { useLocale } from "../i18n/locale";
import type { MessageKey } from "../i18n/messages";
import type { RestaurantReasonCode } from "./types";


const reasonMessages: Readonly<Record<RestaurantReasonCode, MessageKey>> = {
  tag_match: "restaurant.reason.tagMatch",
  within_budget: "restaurant.reason.withinBudget",
  budget_stretch: "restaurant.reason.budgetStretch",
  budget_unknown: "restaurant.reason.budgetUnknown",
  above_median_rating: "restaurant.reason.aboveMedianRating",
  nearby: "restaurant.reason.nearby",
  intent_diversity: "restaurant.reason.intentDiversity",
};

export function RestaurantEvidence({
  reasons,
}: {
  readonly reasons: readonly RestaurantReasonCode[];
}) {
  const { t } = useLocale();
  return (
    <section className="restaurant-evidence">
      <h2>{t("restaurant.why")}</h2>
      <ul>{reasons.map((reason) => <li key={reason}>{t(reasonMessages[reason])}</li>)}</ul>
    </section>
  );
}
