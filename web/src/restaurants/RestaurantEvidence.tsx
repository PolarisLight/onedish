import { useLocale } from "../i18n/locale";
import type { RestaurantReasonCode } from "./types";

export function RestaurantEvidence({ reasons }: { readonly reasons: readonly RestaurantReasonCode[] }) {
  const { t } = useLocale();
  return <section className="restaurant-evidence"><h2>{t("restaurant.why")}</h2><ul>{reasons.map((reason) => <li key={reason}>{t(`restaurant.reason.${reason}`)}</li>)}</ul></section>;
}
