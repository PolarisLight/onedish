import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../i18n/locale";
import { createAmapLandmarkMap } from "./amap-landmark-map";
import {
  isSelectedPoi,
  type LandmarkMapAdapter,
  type LandmarkMapFactory,
  type SelectedPoi,
} from "./landmark-selection";

interface LandmarkPickerProps {
  readonly onClose: () => void;
  readonly onConfirm: (poi: SelectedPoi) => void;
  readonly createMap?: LandmarkMapFactory;
}

const MAX_QUERY_LENGTH = 120;

export function LandmarkPicker({ onClose, onConfirm, createMap = createAmapLandmarkMap }: LandmarkPickerProps) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const focusConfirmationRef = useRef(false);
  const adapterRef = useRef<LandmarkMapAdapter | undefined>(undefined);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const suggestionRequestRef = useRef(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SelectedPoi[]>([]);
  const [suggestions, setSuggestions] = useState<readonly SelectedPoi[]>([]);
  const [selected, setSelected] = useState<SelectedPoi>();
  const [searchError, setSearchError] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [suggestionError, setSuggestionError] = useState(false);
  const [suggestionPending, setSuggestionPending] = useState(false);

  const selectPoi = useCallback((poi: SelectedPoi, focus = false) => {
    if (!mountedRef.current || !isSelectedPoi(poi)) return;
    setSelected(poi);
    if (focus) adapterRef.current?.focus(poi);
  }, []);

  const handleQueryChange = (value: string) => {
    requestRef.current += 1;
    suggestionRequestRef.current += 1;
    setResults([]);
    setSuggestions([]);
    adapterRef.current?.showPois([]);
    setSearchError(false);
    setSuggestionError(false);
    setSuggestionPending(false);
    setSearchCompleted(false);
    const bounded = value.slice(0, MAX_QUERY_LENGTH);
    setSearchPending(Boolean(bounded.trim()));
    setQuery(bounded);
  };

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const background = new Map<HTMLElement, {
      readonly ariaHidden: string | null;
      readonly hadAriaHidden: boolean;
      readonly inert: boolean;
    }>();
    const isolate = (element: HTMLElement) => {
      if (element === dialog || background.has(element)) return;
      background.set(element, {
        ariaHidden: element.getAttribute("aria-hidden"),
        hadAriaHidden: element.hasAttribute("aria-hidden"),
        inert: element.inert,
      });
      element.setAttribute("aria-hidden", "true");
      element.inert = true;
    };
    const previousOverflow = document.body.style.overflow;
    for (const element of Array.from(document.body.children)) {
      if (element instanceof HTMLElement) isolate(element);
    }
    const bodyObserver = new MutationObserver((records) => {
      for (const node of records.flatMap((record) => Array.from(record.addedNodes))) {
        if (node instanceof HTMLElement && node.parentElement === document.body) isolate(node);
      }
    });
    bodyObserver.observe(document.body, { childList: true });
    document.body.style.overflow = "hidden";
    searchInput.current?.focus();
    const containProgrammaticFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) searchInput.current?.focus();
    };
    document.addEventListener("focusin", containProgrammaticFocus);
    return () => {
      document.removeEventListener("focusin", containProgrammaticFocus);
      bodyObserver.disconnect();
      for (const [element, state] of background) {
        if (state.hadAriaHidden) element.setAttribute("aria-hidden", state.ariaHidden ?? "");
        else element.removeAttribute("aria-hidden");
        element.inert = state.inert;
      }
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const containFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const container = mapContainer.current;
    if (!container) return;
    let active = true;
    const controller = new AbortController();
    setLoadError(false);
    setMapReady(false);
    void createMap(container, (poi) => selectPoi(poi), controller.signal).then((adapter) => {
      if (!active || !mountedRef.current) {
        adapter.destroy();
        return;
      }
      adapterRef.current = adapter;
      setMapReady(true);
    }).catch((error: unknown) => {
      if (active && mountedRef.current && !(error instanceof DOMException && error.name === "AbortError")) {
        setSearchPending(false);
        setSuggestionPending(false);
        setSearchCompleted(false);
        setLoadError(true);
      }
    });
    return () => {
      active = false;
      controller.abort();
      requestRef.current += 1;
      suggestionRequestRef.current += 1;
      adapterRef.current?.destroy();
      adapterRef.current = undefined;
    };
  }, [createMap, loadAttempt, selectPoi]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const runSearch = useCallback(async (term: string) => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    const request = ++requestRef.current;
    setSearchError(false);
    setSearchPending(true);
    setSearchCompleted(false);
    setResults([]);
    adapter.showPois([]);
    try {
      const next = await adapter.search(term.trim().slice(0, MAX_QUERY_LENGTH));
      if (!mountedRef.current || request !== requestRef.current) return;
      const suggestionHadFocus = document.activeElement instanceof Node && suggestionsRef.current?.contains(document.activeElement);
      suggestionRequestRef.current += 1;
      setSuggestions([]);
      setSuggestionPending(false);
      adapter.showPois(next);
      setResults(next);
      if (suggestionHadFocus) searchInput.current?.focus();
      setSearchPending(false);
      setSearchCompleted(true);
    } catch {
      if (mountedRef.current && request === requestRef.current) {
        setSearchPending(false);
        setSearchCompleted(false);
        setSearchError(true);
      }
    }
  }, []);

  const runSuggest = useCallback(async (term: string) => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    const request = ++suggestionRequestRef.current;
    setSuggestionError(false);
    setSuggestionPending(true);
    setSuggestions([]);
    try {
      const next = await adapter.suggest(term.trim().slice(0, MAX_QUERY_LENGTH));
      if (!mountedRef.current || request !== suggestionRequestRef.current) return;
      if (next.length > 0) adapter.showPois(next);
      setSuggestions(next);
      setSuggestionPending(false);
    } catch {
      if (mountedRef.current && request === suggestionRequestRef.current) {
        setSuggestionPending(false);
        setSuggestions([]);
        setSuggestionError(true);
      }
    }
  }, []);

  const selectSuggestion = (poi: SelectedPoi) => {
    if (!isSelectedPoi(poi)) return;
    try {
      adapterRef.current?.showPois([poi]);
    } catch {
      setSuggestionError(true);
      return;
    }
    suggestionRequestRef.current += 1;
    requestRef.current += 1;
    setSuggestions([]);
    setSuggestionPending(false);
    setSearchPending(false);
    setSearchCompleted(false);
    focusConfirmationRef.current = true;
    selectPoi(poi, true);
  };

  useEffect(() => {
    if (!selected || !focusConfirmationRef.current) return;
    focusConfirmationRef.current = false;
    confirmButtonRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      requestRef.current += 1;
      suggestionRequestRef.current += 1;
      setResults([]);
      setSuggestions([]);
      setSearchError(false);
      setSuggestionError(false);
      setSearchPending(false);
      setSuggestionPending(false);
      setSearchCompleted(false);
      adapterRef.current?.showPois([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void runSuggest(term);
      void runSearch(term);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mapReady, query, runSearch, runSuggest]);

  return createPortal(<div ref={dialogRef} className="landmark-dialog" role="dialog" aria-modal="true" aria-labelledby="landmark-dialog-title" onKeyDown={containFocus}>
    <h2 id="landmark-dialog-title" className="sr-only">{t("landmark.title")}</h2>
    <div ref={mapContainer} className="landmark-map" data-testid="landmark-map" aria-label={t("landmark.map")} aria-busy={!mapReady && !loadError} />
    {!mapReady && !loadError && <p className="landmark-map-status" role="status">{t("landmark.mapLoading")}</p>}

    <div className="landmark-topbar">
      <label className="landmark-search">
        <span className="sr-only">{t("landmark.search")}</span>
        <span aria-hidden="true">⌕</span>
        <input
          ref={searchInput}
          type="search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={t("landmark.searchHint")}
          aria-label={t("landmark.search")}
          aria-busy={searchPending || suggestionPending}
          maxLength={MAX_QUERY_LENGTH}
        />
      </label>
      <button className="landmark-close" type="button" onClick={onClose} aria-label={t("landmark.close")}>×</button>
    </div>

    {suggestions.length > 0 && <ul ref={suggestionsRef} className="landmark-results" aria-label={t("landmark.suggestions")}>
      {suggestions.map((poi) => <li key={poi.id}>
        <button type="button" onClick={() => selectSuggestion(poi)} aria-pressed={selected?.id === poi.id}>
          <strong>{poi.name}</strong>
          <span>{poi.address}</span>
        </button>
      </li>)}
    </ul>}
    {suggestionPending && <p className="landmark-search-status" role="status">{t("landmark.suggestionLoading")}</p>}
    {suggestionError && <p className="landmark-search-error landmark-suggestion-error" role="alert">{t("landmark.suggestionError")}</p>}

    {results.length > 0 && <ul className="landmark-results" aria-label={t("landmark.results")}>
      {results.map((poi) => <li key={poi.id}>
        <button type="button" onClick={() => selectPoi(poi, true)} aria-pressed={selected?.id === poi.id}>
          <strong>{poi.name}</strong>
          <span>{poi.address}</span>
        </button>
      </li>)}
    </ul>}
    {searchPending && <p className="landmark-search-status" role="status">{t("landmark.searchLoading")}</p>}
    {searchCompleted && results.length === 0 && <p className="landmark-search-status" role="status">{t("landmark.noResults")}</p>}

    {loadError && <section className="landmark-error" role="alert">
      <p>{t("landmark.loadError")}</p>
      <div>
        <button className="primary-button" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>{t("landmark.retryMap")}</button>
        <button className="secondary-button" type="button" onClick={onClose}>{t("landmark.close")}</button>
      </div>
    </section>}

    <section className="landmark-confirmation" aria-label={t("landmark.confirmation")}>
      <div className="landmark-handle" aria-hidden="true" />
      {selected ? <>
        <p className="hero-kicker">{t("landmark.selected")}</p>
        <h3>{selected.name}</h3>
        <p className="landmark-address">{selected.address}</p>
      </> : <>
        <h3>{t("landmark.choosePrompt")}</h3>
        <p className="landmark-address">{t("landmark.chooseHint")}</p>
      </>}
      {searchError && <div className="landmark-search-error" role="alert">
        <span>{t("landmark.searchError")}</span>
        <button type="button" onClick={() => void runSearch(query.trim())}>{t("landmark.retrySearch")}</button>
      </div>}
      <p className="landmark-radius-note">{t("landmark.radiusNote")}</p>
      <button
        ref={confirmButtonRef}
        className="primary-button landmark-confirm"
        type="button"
        disabled={!selected}
        onClick={() => { if (selected) onConfirm(selected); }}
      >{t("landmark.confirm")}</button>
    </section>
  </div>, document.body);
}
