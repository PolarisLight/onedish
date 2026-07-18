import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { db } from "../db/db";
import type { SupportedLocale } from "../recommendation/types";
import { normalizeLocale } from "./locale-utils";
import { translate, type MessageKey, type MessageParams } from "./messages";

interface LocaleContextValue {
  readonly locale: SupportedLocale;
  readonly setLocale: (locale: SupportedLocale) => Promise<void>;
  readonly t: (key: MessageKey, params?: MessageParams) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => normalizeLocale(
    typeof navigator === "undefined" ? "en" : navigator.language,
  ));

  useEffect(() => {
    void db.settings.get("locale.v2").then((row) => {
      if (row?.value === "en" || row?.value === "zh-CN") setLocaleState(row.value);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    await db.settings.put({ key: "locale.v2", value: nextLocale });
  }, []);

  const t = useCallback((key: MessageKey, params?: MessageParams) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
