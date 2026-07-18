import { useLocale } from "./locale";

export function LocaleSwitch() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="locale-switch" role="group" aria-label={t("locale.label")}>
      <button type="button" aria-pressed={locale === "zh-CN"} onClick={() => void setLocale("zh-CN")}>中文</button>
      <button type="button" aria-pressed={locale === "en"} onClick={() => void setLocale("en")}>EN</button>
    </div>
  );
}
