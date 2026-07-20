import { useState } from "react";
import { useLocale } from "../i18n/locale";
import {
  RESTAURANT_INTENT_GROUPS,
  RESTAURANT_SHORTCUTS,
  restaurantIntentGroupLabel,
  restaurantIntentLabel,
  type RestaurantIntentTag,
} from "./intent-tags";
import type { RestaurantPreferences } from "./preferences";


const shortcutSet = new Set<RestaurantIntentTag>(RESTAURANT_SHORTCUTS);

export function RestaurantPreferenceForm({
  initialPreferences,
  onSubmit,
  onCancel,
}: {
  readonly initialPreferences: RestaurantPreferences;
  readonly onSubmit: (preferences: RestaurantPreferences) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const { locale } = useLocale();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const chinese = locale === "zh-CN";

  function toggleTag(tag: RestaurantIntentTag) {
    setPreferences((current) => {
      const selected = current.selected_tags.includes(tag)
        ? current.selected_tags.filter((item) => item !== tag)
        : current.selected_tags.length < 6
          ? [...current.selected_tags, tag]
          : current.selected_tags;
      return { ...current, selected_tags: selected };
    });
  }

  function option(tag: RestaurantIntentTag) {
    const checked = preferences.selected_tags.includes(tag);
    return (
      <label key={tag}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!checked && preferences.selected_tags.length >= 6}
          onChange={() => toggleTag(tag)}
        />
        <span>{restaurantIntentLabel(tag, locale)}</span>
      </label>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit(preferences);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={chinese ? "餐厅偏好" : "Restaurant preferences"}>
      <fieldset className="restaurant-intent-shortcuts">
        <legend>{chinese ? "现在想吃什么" : "What sounds good"}</legend>
        <p>{chinese ? "可多选，符合其中一种即可" : "Choose any that fit — matches use OR"}</p>
        <div className="check-grid">{RESTAURANT_SHORTCUTS.map(option)}</div>
      </fieldset>
      <button
        type="button"
        className="text-button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (chinese ? "收起" : "Less") : (chinese ? "更多选择" : "More")}
      </button>
      {expanded ? (
        <div className="restaurant-intent-groups">
          {RESTAURANT_INTENT_GROUPS.map((group) => {
            const remaining = group.tags.filter((tag) => !shortcutSet.has(tag));
            return remaining.length > 0 ? (
              <fieldset key={group.id}>
                <legend>{restaurantIntentGroupLabel(group.id, locale)}</legend>
                <div className="check-grid">{remaining.map(option)}</div>
              </fieldset>
            ) : null;
          })}
        </div>
      ) : null}
      <fieldset className="restaurant-budget-fieldset">
        <legend>{chinese ? "预算（可选）" : "Budget (optional)"}</legend>
        <label>
          <input
            type="checkbox"
            checked={preferences.budget_is_explicit}
            onChange={(event) => setPreferences({
              ...preferences,
              budget_is_explicit: event.target.checked,
            })}
          />
          <span>{chinese ? "按人均预算筛选" : "Use a per-person budget"}</span>
        </label>
        {preferences.budget_is_explicit ? (
          <label>
            <span>{chinese ? "人均预算（¥）" : "Per person ($)"}</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={preferences.budget_minor / 100}
              onChange={(event) => setPreferences({
                ...preferences,
                budget_minor: Math.round(Number(event.target.value) * 100),
              })}
            />
          </label>
        ) : null}
      </fieldset>
      <div className="form-actions sheet-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          {chinese ? "取消" : "Cancel"}
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? (chinese ? "保存中…" : "Saving…") : (chinese ? "保存" : "Save")}
        </button>
      </div>
    </form>
  );
}
