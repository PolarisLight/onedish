import { useLocale } from "../i18n/locale";

export function DemoBadge() {
  const { t } = useLocale();
  return <span className="demo-badge">{t("demo.badge")}</span>;
}
