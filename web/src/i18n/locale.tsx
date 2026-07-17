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

interface LocaleContextValue {
  readonly locale: SupportedLocale;
  readonly setLocale: (locale: SupportedLocale) => Promise<void>;
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

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    await db.settings.put({ key: "locale.v2", value: nextLocale });
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
