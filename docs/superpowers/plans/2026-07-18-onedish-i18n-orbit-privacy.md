# OneDish i18n, Taste Orbit, and Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a consistently bilingual OneDish interface, a history-backed and manually controllable Taste Orbit, and a truthful interactive Privacy boundary explorer with explicit location authorization and a local access log.

**Architecture:** Extend the existing locale context into the only source of interface copy, then migrate routes in coherent groups. Keep Taste Orbit calculations in pure functions and render the interaction from a single angular source of truth. Store privacy permissions and coordinate-free access events in Dexie, and make Nearby consume that privacy API before requesting or sharing location.

**Tech Stack:** React 19, TypeScript 5.8, React Router 7, Dexie 4, CSS transforms, Vitest, Testing Library, Playwright, Vite

---

## File Structure

### Create

- `web/src/i18n/messages.ts` — complete English and Simplified Chinese interface catalog plus interpolation.
- `web/src/i18n/LocaleSwitch.tsx` — persistent compact `中文 / EN` segmented control.
- `web/src/history/orbit-model.ts` — pure history aggregation, node geometry, and shortest-path math.
- `web/src/history/TasteOrbit.tsx` — accessible orbit state machine and animation renderer.
- `web/src/privacy/privacy-model.ts` — protected-category disclosures and localized view models.
- `web/src/privacy/privacy-store.ts` — permission, access-event, and profile-deletion persistence API.
- `web/src/privacy/PrivacyBoundaryExplorer.tsx` — category selector and factual data-flow visualization.
- `web/src/privacy/LocationConsentDialog.tsx` — explicit one-time location boundary confirmation.
- `web/tests/i18n-ui.test.tsx` — locale control, persistence, document language, and untranslated-name coverage.
- `web/tests/orbit-model.test.ts` — aggregation and angle invariants.
- `web/tests/privacy-store.test.ts` — permissions, coordinate-free logs, and scoped deletion.
- `web/tests/privacy.test.tsx` — Privacy page interactions and disclosure coverage.
- `web/e2e/i18n-orbit-privacy.spec.ts` — bilingual routes, mobile Orbit, reduced motion, and Privacy flow.

### Modify

- `web/src/i18n/locale.tsx` — expose `t`, synchronize `document.documentElement.lang`, and recover from persistence failure.
- `web/src/shared/Layout.tsx` — localize navigation and expose the switch on desktop and mobile.
- `web/src/demo/DemoBadge.tsx` — localize the badge.
- `web/src/home/HomePage.tsx` — replace local language branches and hardcoded interface copy.
- `web/src/context/DailyContextForm.tsx` — localize fields, options, hints, and actions.
- `web/src/profile/ProfileSheet.tsx` — localize dialog copy and accessible names.
- `web/src/elimination/EliminationPage.tsx` — localize state, error, and action copy.
- `web/src/elimination/EliminationStack.tsx` — localize accessible and fallback labels.
- `web/src/elimination/trace-view-model.ts` — obtain stage and reason copy from the catalog.
- `web/src/winner/WinnerPage.tsx` — localize interface copy while preserving dish and restaurant names.
- `web/src/winner/WinnerActions.tsx` — localize winner controls and errors.
- `web/src/winner/WinnerEvidence.tsx` — use catalog copy for headings, values, and accessible labels.
- `web/src/winner/RejectionSheet.tsx` — localize rejection choices.
- `web/src/nearby/NearbyPage.tsx` — localize the route and require explicit consent before location use.
- `web/src/location/geocoder.ts` — return typed error kinds rather than English UI strings.
- `web/src/db/db.ts` — add the privacy event table and scoped profile deletion.
- `web/src/history/TasteOrbitPage.tsx` — replace the static/demo SVG with real-history controls and empty state.
- `web/src/privacy/PrivacyPage.tsx` — compose the promise, explorer, permission status, access log, and deletion action.
- `web/src/styles/global.css` — language switch, Orbit, Privacy, dialog, mobile, focus, and reduced-motion styles.
- existing unit and E2E tests whose English-only queries become locale-aware.

## Task 1: Build the Typed Translation Foundation

**Files:**
- Create: `web/src/i18n/messages.ts`
- Create: `web/src/i18n/LocaleSwitch.tsx`
- Modify: `web/src/i18n/locale.tsx`
- Test: `web/tests/locale.test.ts`
- Test: `web/tests/i18n-ui.test.tsx`

- [ ] **Step 1: Write failing locale-provider and switch tests**

Add tests that render a small consumer inside `LocaleProvider`, wait for IndexedDB hydration, switch to Chinese, and assert persistence and document language:

```tsx
function LocaleProbe() {
  const { locale, setLocale, t } = useLocale();
  return <>
    <span>{locale}</span>
    <span>{t("nav.privacy")}</span>
    <button onClick={() => void setLocale("zh-CN")}>change</button>
  </>;
}

test("switches all catalog copy, persists locale, and updates document language", async () => {
  await resetLocalData();
  render(<LocaleProvider><LocaleProbe /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "change" }));
  await waitFor(() => expect(screen.getByText("隐私")).toBeVisible());
  expect(document.documentElement.lang).toBe("zh-CN");
  expect((await db.settings.get("locale.v2"))?.value).toBe("zh-CN");
});

test("locale switch exposes two explicit pressed states", () => {
  render(<LocaleProvider><LocaleSwitch /></LocaleProvider>);
  expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Run the focused tests and verify the missing API failure**

Run: `pnpm --dir web test -- --run tests/locale.test.ts tests/i18n-ui.test.tsx`

Expected: FAIL because `messages.ts`, `LocaleSwitch`, and `t` do not exist.

- [ ] **Step 3: Implement the catalog, interpolation, provider API, and switch**

Use semantic dotted keys. The catalog must include every string consumed by the shell, Home/Profile, Elimination, Winner, Nearby, Taste Orbit, Privacy, shared error states, protected-category disclosures, and consent dialog. Implement the catalog API as:

```ts
export const en = {
  "nav.main": "Main navigation",
  "nav.mobile": "Mobile navigation",
  "nav.today": "Today",
  "nav.orbit": "Taste Orbit",
  "nav.privacy": "Privacy",
  "locale.label": "Interface language",
  "demo.badge": "Synthetic demo context",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saving": "Saving...",
  "common.loading": "Loading...",
  "common.delete": "Delete",
  "common.back": "Back",
  "home.kicker": "One decision. No feed.",
  "home.title.before": "What should",
  "home.title.accent": "I eat?",
  "home.lede": "One nearby meal picked from your time, budget, preferences, and recent choices.",
  "home.feeling": "How do you feel?",
  "home.light": "Light",
  "home.hungry": "Hungry",
  "home.surprise": "Surprise me",
  "home.pick": "Pick my meal",
  "home.picking": "Picking...",
  "home.adjust": "Adjust",
  "home.preview": "OneDish meal preview",
  "home.previewAlt": "A warm rice bowl",
  "home.tap": "1 TAP",
  "home.tapNote": "local, auditable choice",
  "home.pickError": "Could not pick a meal. Try again.",
  "meal.breakfast": "Breakfast",
  "meal.lunch": "Lunch",
  "meal.dinner": "Dinner",
  "profile.kicker": "Optional settings",
  "profile.title": "Meal preferences",
  "profile.close": "Close preferences",
  "profile.lede": "Set these once. OneDish remembers them on this device.",
  "profile.form": "Meal preferences form",
  "profile.language": "Language and currency",
  "profile.never": "Never include",
  "profile.maximum": "Usual maximum ({symbol})",
  "profile.duration": "Time available",
  "profile.ingredients": "Other ingredients to exclude",
  "profile.ingredientsHint": "cilantro, shellfish",
  "profile.tastes": "Usually like",
  "profile.tastesHint": "warm, spicy, fresh",
  "allergen.peanuts": "Peanuts",
  "allergen.milk": "Milk",
  "allergen.soy": "Soy",
  "allergen.gluten": "Gluten",
  "allergen.sesame": "Sesame",
  "decision.unavailable": "Decision unavailable",
  "decision.missing": "This decision is no longer stored on this device.",
  "decision.invalid": "This decision record is invalid.",
  "decision.loading": "Loading your stored decision...",
  "decision.complete": "Decision complete",
  "decision.choosing": "Choosing from nearby options",
  "decision.title": "From ninety to one.",
  "decision.selected": "One dish selected",
  "decision.remaining": "{count} dishes remain. {reason}",
  "decision.actions": "Decision actions",
  "decision.edit": "Edit preferences",
  "decision.restart": "Start over",
  "decision.startAgain": "Start again",
  "decision.meet": "Meet your dish",
  "decision.skip": "Skip",
  "decision.filtering": "Dishes being filtered",
  "decision.other": "Another option",
  "decision.stillIn": "still in",
  "stage.found": "Nearby options found",
  "stage.available": "Available places",
  "stage.safety_budget": "Safety and budget checked",
  "stage.safety": "Safety settings applied",
  "stage.nutrition": "Nutrition fit checked",
  "stage.repetition": "Recent meals compared",
  "stage.taste_confidence": "Taste and confidence compared",
  "stage.taste": "Taste preference applied",
  "stage.duration": "Time limit applied",
  "stage.budget": "Budget applied",
  "stage.winner": "One dish remains",
  "reason.allergen_excluded": "Conflicts with your allergy settings",
  "reason.ingredient_excluded": "Contains an excluded ingredient",
  "reason.over_budget": "Over your usual budget",
  "reason.energy_outside_range": "Outside today's energy range",
  "reason.protein_below_floor": "Not enough protein today",
  "reason.recent_repetition": "Too similar to a recent meal",
  "reason.session_excluded": "Skipped in this session",
  "reason.taste_mismatch": "Not the taste you want now",
  "reason.too_slow": "Takes longer than your available time",
  "reason.taste_match": "Matches what sounds good",
  "reason.protein_match": "Fits today's protein need",
  "reason.recent_variety": "Different from recent meals",
  "reason.duration_match": "Fits your available time",
  "reason.confidence_match": "Backed by a stronger estimate",
  "reason.meal_period_match": "Fits this meal",
  "reason.lower": "Lower match",
  "reason.strong": "Strong overall match",
  "winner.loading": "Loading the winner...",
  "winner.dish": "Your one dish",
  "winner.reserve": "Your one reserve",
  "winner.menuEstimate": "menu estimate",
  "winner.kcal": "estimated kcal",
  "winner.protein": "estimated protein",
  "winner.why": "Why this one",
  "winner.reasonLabel": "reason {count}",
  "winner.compared": "Compared with recent meals",
  "winner.nearby": "Find nearby",
  "winner.another": "Pick another",
  "winner.exhausted": "No more safe choices remain. Edit your preferences to continue.",
  "winner.how": "How this was chosen",
  "winner.howBody": "Deterministic rules compared safety, time, budget, taste, distance, and recent history. Nutrition values are estimates.",
  "winner.source": "Source search link",
  "winner.web": "Search on web",
  "winner.notToday": "Not today",
  "winner.reserveEnd": "That is the reserve. The session ends here.",
  "winner.rejectTitle": "What missed?",
  "winner.rejectBody": "One answer improves future choices. You will see only the reserve.",
  "nearby.back": "Back to your dish",
  "nearby.kicker": "Nearby search",
  "nearby.title": "Find it close by.",
  "nearby.lede": "Looking for places that may match {dish}. Menu availability is not guaranteed.",
  "nearby.useLocation": "Use current location",
  "nearby.locating": "Locating...",
  "nearby.areaLabel": "Or enter a city or neighborhood",
  "nearby.areaHint": "Shanghai, Jing'an",
  "nearby.search": "Search area",
  "nearby.initialStatus": "Choose how to locate nearby restaurants.",
  "nearby.denied": "Location was denied. Enter an area instead.",
  "nearby.unavailable": "Location is unavailable. Enter an area instead.",
  "nearby.currentArea": "Your current area",
  "nearby.once": "Location was shared for this view and was not saved.",
  "nearby.lookupOnce": "Area lookup is sent only when you press Search area.",
  "nearby.mapTitle": "OpenStreetMap nearby area",
  "nearby.demoPlaces": "Matching demo places",
  "nearby.fixtureNotice": "These are clearly labeled fixtures for the hackathon demo. Configure Foursquare for live restaurant results.",
  "orbit.kicker": "Your recent pattern",
  "orbit.title": "Your taste has an orbit.",
  "orbit.lede": "Repeated signals grow larger. Select one to see its evidence.",
  "orbit.you": "YOU",
  "orbit.range7": "7 DAYS",
  "orbit.range30": "30 DAYS",
  "orbit.summary": "Text summary of taste clusters",
  "orbit.emptyTitle": "Your orbit starts with your next meal.",
  "orbit.emptyBody": "Accepted, eaten, and rejected meals will shape this view.",
  "orbit.focusHint": "Select a signal to focus",
  "orbit.returnHint": "Select YOU to return",
  "privacy.kicker": "Privacy by boundary",
  "privacy.title": "Your body is not the product.",
  "privacy.promise": "We do not read or send protected data without your permission. You can review, revoke, and delete it.",
  "privacy.explorer": "Protected data boundary",
  "privacy.why": "Why it may be needed",
  "privacy.storage": "Where it is stored",
  "privacy.retention": "When it is deleted",
  "privacy.thirdParty": "Who receives it",
  "privacy.location": "Precise location",
  "privacy.health": "Health signals",
  "privacy.meals": "Meal history",
  "privacy.taste": "Taste profile",
  "privacy.identity": "Identity and device identifiers",
  "privacy.accessLog": "Access log",
  "privacy.noEvents": "No protected data has left this device.",
  "privacy.deleteProfile": "Delete local profile",
  "privacy.deleteTitle": "Delete local profile and meal-derived data?",
  "privacy.deleteBody": "This removes preferences, meal history, contexts, and saved decisions. Language preference and the privacy log remain.",
  "privacy.sync": "Encrypted sync",
  "privacy.syncFuture": "Coming with the future app. Nothing is uploaded by this web demo.",
  "consent.title": "Share precise location once?",
  "consent.body": "OneDish will request your location and send it to OpenStreetMap to render this nearby view. Raw coordinates are not saved in your profile or access log.",
  "consent.allow": "Allow once",
  "consent.recipient": "Recipient: OpenStreetMap",
} as const;

export type MessageKey = keyof typeof en;
export type MessageParams = Readonly<Record<string, string | number>>;

const zhCN: Record<MessageKey, string> = {
  "nav.main": "主导航",
  "nav.mobile": "移动端导航",
  "nav.today": "今天",
  "nav.orbit": "口味轨道",
  "nav.privacy": "隐私",
  "locale.label": "界面语言",
  "demo.badge": "合成演示数据",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.saving": "保存中……",
  "common.loading": "加载中……",
  "common.delete": "删除",
  "common.back": "返回",
  "home.kicker": "一个决定，没有信息流。",
  "home.title.before": "今天",
  "home.title.accent": "吃什么？",
  "home.lede": "根据你的时间、预算、偏好和近期选择，直接推荐附近的一餐。",
  "home.feeling": "你现在感觉如何？",
  "home.light": "清淡点",
  "home.hungry": "很饿",
  "home.surprise": "给我惊喜",
  "home.pick": "帮我选一餐",
  "home.picking": "正在选择……",
  "home.adjust": "调整",
  "home.preview": "OneDish 餐食预览",
  "home.previewAlt": "一碗热腾腾的米饭",
  "home.tap": "一键",
  "home.tapNote": "本地、可审计的选择",
  "home.pickError": "暂时无法选择餐食，请重试。",
  "meal.breakfast": "早餐",
  "meal.lunch": "午餐",
  "meal.dinner": "晚餐",
  "profile.kicker": "可选设置",
  "profile.title": "用餐偏好",
  "profile.close": "关闭用餐偏好",
  "profile.lede": "只需设置一次，OneDish 会保存在这台设备上。",
  "profile.form": "用餐偏好表单",
  "profile.language": "语言和货币",
  "profile.never": "绝不包含",
  "profile.maximum": "通常最高预算（{symbol}）",
  "profile.duration": "可用时间",
  "profile.ingredients": "其他需要排除的食材",
  "profile.ingredientsHint": "香菜、贝类",
  "profile.tastes": "通常喜欢",
  "profile.tastesHint": "温热、香辣、清新",
  "allergen.peanuts": "花生",
  "allergen.milk": "牛奶",
  "allergen.soy": "大豆",
  "allergen.gluten": "麸质",
  "allergen.sesame": "芝麻",
  "decision.unavailable": "本次选择不可用",
  "decision.missing": "这次选择已不再保存在当前设备上。",
  "decision.invalid": "这次选择的记录无效。",
  "decision.loading": "正在加载已保存的选择……",
  "decision.complete": "选择完成",
  "decision.choosing": "正在筛选附近选项",
  "decision.title": "从九十到唯一。",
  "decision.selected": "已选出一道餐食",
  "decision.remaining": "还剩 {count} 道餐食。{reason}",
  "decision.actions": "选择操作",
  "decision.edit": "编辑偏好",
  "decision.restart": "重新开始",
  "decision.startAgain": "再试一次",
  "decision.meet": "看看你的餐食",
  "decision.skip": "跳过",
  "decision.filtering": "正在筛选餐食",
  "decision.other": "其他选项",
  "decision.stillIn": "仍在候选中",
  "stage.found": "已找到附近选项",
  "stage.available": "当前可用餐厅",
  "stage.safety_budget": "已检查安全与预算",
  "stage.safety": "已应用安全设置",
  "stage.nutrition": "已检查营养匹配",
  "stage.repetition": "已对比近期餐食",
  "stage.taste_confidence": "已比较口味与可信度",
  "stage.taste": "已应用口味偏好",
  "stage.duration": "已应用时间限制",
  "stage.budget": "已应用预算",
  "stage.winner": "最终留下一个选择",
  "reason.allergen_excluded": "与你的过敏原设置冲突",
  "reason.ingredient_excluded": "包含已排除的食材",
  "reason.over_budget": "超过你的常用预算",
  "reason.energy_outside_range": "不符合今天的能量范围",
  "reason.protein_below_floor": "今天的蛋白质不足",
  "reason.recent_repetition": "与近期用餐过于相似",
  "reason.session_excluded": "本次已跳过",
  "reason.taste_mismatch": "不符合你现在想要的口味",
  "reason.too_slow": "所需时间超过你的空闲时间",
  "reason.taste_match": "符合你现在想吃的口味",
  "reason.protein_match": "符合今天的蛋白质需求",
  "reason.recent_variety": "不同于近期餐食",
  "reason.duration_match": "符合你的空闲时间",
  "reason.confidence_match": "信息估计更可靠",
  "reason.meal_period_match": "适合当前用餐时段",
  "reason.lower": "匹配度较低",
  "reason.strong": "整体匹配度高",
  "winner.loading": "正在加载推荐结果……",
  "winner.dish": "你的唯一餐食",
  "winner.reserve": "你的备用餐食",
  "winner.menuEstimate": "菜单价格估算",
  "winner.kcal": "预计千卡",
  "winner.protein": "预计蛋白质",
  "winner.why": "为什么是它",
  "winner.reasonLabel": "理由 {count}",
  "winner.compared": "已与近期餐食比较",
  "winner.nearby": "查找附近餐厅",
  "winner.another": "换一个",
  "winner.exhausted": "没有更多安全选项，请编辑偏好后继续。",
  "winner.how": "选择依据",
  "winner.howBody": "确定性规则比较了安全性、时间、预算、口味、距离和近期记录。营养数值均为估算。",
  "winner.source": "来源搜索链接",
  "winner.web": "在网页中搜索",
  "winner.notToday": "今天不想吃",
  "winner.reserveEnd": "这是备用选项，本次选择到此结束。",
  "winner.rejectTitle": "哪里不合适？",
  "winner.rejectBody": "一个回答就能改善以后的选择，接下来只会展示备用餐食。",
  "nearby.back": "返回餐食结果",
  "nearby.kicker": "附近搜索",
  "nearby.title": "去附近找到它。",
  "nearby.lede": "正在查找可能提供 {dish} 的地点，无法保证实时菜单供应。",
  "nearby.useLocation": "使用当前位置",
  "nearby.locating": "正在定位……",
  "nearby.areaLabel": "或输入城市、街区",
  "nearby.areaHint": "上海，静安",
  "nearby.search": "搜索区域",
  "nearby.initialStatus": "请选择查找附近餐厅的定位方式。",
  "nearby.denied": "位置权限被拒绝，请改为输入区域。",
  "nearby.unavailable": "暂时无法获取位置，请改为输入区域。",
  "nearby.currentArea": "你当前所在区域",
  "nearby.once": "位置仅用于当前页面，且不会保存。",
  "nearby.lookupOnce": "只有按下“搜索区域”后才会发送区域查询。",
  "nearby.mapTitle": "OpenStreetMap 附近区域地图",
  "nearby.demoPlaces": "匹配的演示地点",
  "nearby.fixtureNotice": "这些地点是黑客松演示数据，且已明确标注。配置 Foursquare 后可获取实时餐厅结果。",
  "orbit.kicker": "你的近期模式",
  "orbit.title": "你的口味自有轨道。",
  "orbit.lede": "重复信号会变大；选择一个信号即可查看依据。",
  "orbit.you": "你",
  "orbit.range7": "7 天",
  "orbit.range30": "30 天",
  "orbit.summary": "口味聚类文字摘要",
  "orbit.emptyTitle": "下一餐将开启你的口味轨道。",
  "orbit.emptyBody": "接受、吃过和拒绝的餐食都会塑造这里。",
  "orbit.focusHint": "选择一个信号进行聚焦",
  "orbit.returnHint": "选择“你”返回自然旋转",
  "privacy.kicker": "以边界保护隐私",
  "privacy.title": "你的身体不是商品。",
  "privacy.promise": "未经你的许可，我们不会读取或发送受保护数据；你可以随时查看、撤回和删除。",
  "privacy.explorer": "受保护数据边界",
  "privacy.why": "可能需要它的原因",
  "privacy.storage": "保存位置",
  "privacy.retention": "删除时间",
  "privacy.thirdParty": "接收方",
  "privacy.location": "精确位置",
  "privacy.health": "健康信号",
  "privacy.meals": "用餐记录",
  "privacy.taste": "口味画像",
  "privacy.identity": "身份与设备标识",
  "privacy.accessLog": "访问记录",
  "privacy.noEvents": "尚无受保护数据离开这台设备。",
  "privacy.deleteProfile": "删除本地画像",
  "privacy.deleteTitle": "删除本地画像和餐食衍生数据？",
  "privacy.deleteBody": "这会删除偏好、用餐记录、场景和已保存的选择；语言偏好与隐私日志会保留。",
  "privacy.sync": "加密同步",
  "privacy.syncFuture": "未来 App 将提供此功能；当前网页演示不会上传任何画像。",
  "consent.title": "仅本次共享精确位置？",
  "consent.body": "OneDish 将请求你的位置，并发送给 OpenStreetMap 以渲染当前附近页面。原始坐标不会保存在画像或访问日志中。",
  "consent.allow": "仅本次允许",
  "consent.recipient": "接收方：OpenStreetMap",
};

export const messages = { en, "zh-CN": zhCN } as const;

export function translate(locale: SupportedLocale, key: MessageKey, params: MessageParams = {}): string {
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    messages[locale][key],
  );
}
```

Extend `LocaleContextValue` with `t: (key: MessageKey, params?: MessageParams) => string`, memoize it with `useCallback`, and set `document.documentElement.lang = locale` in an effect. `setLocale` updates state before persistence so a storage failure cannot leave the UI mixed.

Implement `LocaleSwitch` as two buttons with `aria-pressed`, visible labels `中文` and `EN`, and `void setLocale(...)` handlers.

- [ ] **Step 4: Run focused tests and type checking**

Run: `pnpm --dir web test -- --run tests/locale.test.ts tests/i18n-ui.test.tsx && pnpm --dir web build`

Expected: PASS; TypeScript proves the Chinese catalog has every English key.

- [ ] **Step 5: Commit the locale foundation**

```bash
git add web/src/i18n/messages.ts web/src/i18n/LocaleSwitch.tsx web/src/i18n/locale.tsx web/tests/locale.test.ts web/tests/i18n-ui.test.tsx
git commit -m "feat: add typed bilingual interface catalog"
```

## Task 2: Migrate the Shell, Home, and Profile to the Catalog

**Files:**
- Modify: `web/src/shared/Layout.tsx`
- Modify: `web/src/demo/DemoBadge.tsx`
- Modify: `web/src/home/HomePage.tsx`
- Modify: `web/src/context/DailyContextForm.tsx`
- Modify: `web/src/profile/ProfileSheet.tsx`
- Modify: `web/src/styles/global.css`
- Test: `web/tests/accessibility.test.tsx`
- Test: `web/tests/home.test.tsx`
- Test: `web/tests/i18n-ui.test.tsx`

- [ ] **Step 1: Add failing bilingual shell and Home/Profile tests**

Test English first, click the visible `中文` button, then assert `今天`, `口味轨道`, `隐私`, `帮我选一餐`, and `调整` appear. Open the profile dialog and assert its Chinese accessible name. Switch back through `EN` and assert the English names return. Also assert a literal sample dish name passed as data remains unchanged.

```tsx
test("switches shell and home without mixed navigation", async () => {
  render(<LocaleProvider><MemoryRouter><Layout /><HomePage /></MemoryRouter></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "隐私" })).toBeVisible());
  expect(screen.getByRole("button", { name: "帮我选一餐" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "调整" }));
  expect(screen.getByRole("dialog", { name: "用餐偏好" })).toBeVisible();
});
```

- [ ] **Step 2: Verify tests fail on hardcoded English copy**

Run: `pnpm --dir web test -- --run tests/accessibility.test.tsx tests/home.test.tsx tests/i18n-ui.test.tsx`

Expected: FAIL because Layout, DemoBadge, HomePage, DailyContextForm, and ProfileSheet still contain English literals.

- [ ] **Step 3: Replace shell and Home/Profile UI literals with `t` calls**

Use this pattern consistently:

```tsx
const { locale, setLocale, t } = useLocale();
<nav aria-label={t("nav.main")}>
  <Link to="/history">{t("nav.orbit")}</Link>
  <Link to="/privacy">{t("nav.privacy")}</Link>
  <LocaleSwitch />
</nav>
```

Build the Home summary from translated meal-period keys and `formatMoney`. Keep the image source and product name unchanged. In `DailyContextForm`, translate allergen labels from their stable values, derive the currency symbol from locale, and leave comma-separated user-entered ingredients and taste terms untouched.

Add `.locale-switch` as a compact two-button pill; keep it visible in `.site-header` at 320 px, and place it before the demo badge so hiding desktop links never hides language selection.

- [ ] **Step 4: Run route-level tests and lint**

Run: `pnpm --dir web test -- --run tests/accessibility.test.tsx tests/home.test.tsx tests/i18n-ui.test.tsx && pnpm --dir web lint`

Expected: PASS with no hardcoded shell/Home/Profile interface copy asserted by the tests.

- [ ] **Step 5: Commit the first route migration**

```bash
git add web/src/shared/Layout.tsx web/src/demo/DemoBadge.tsx web/src/home/HomePage.tsx web/src/context/DailyContextForm.tsx web/src/profile/ProfileSheet.tsx web/src/styles/global.css web/tests/accessibility.test.tsx web/tests/home.test.tsx web/tests/i18n-ui.test.tsx
git commit -m "feat: localize shell and one-tap setup"
```

## Task 3: Migrate Decision, Winner, and Nearby Routes

**Files:**
- Modify: `web/src/elimination/EliminationPage.tsx`
- Modify: `web/src/elimination/EliminationStack.tsx`
- Modify: `web/src/elimination/trace-view-model.ts`
- Modify: `web/src/winner/WinnerPage.tsx`
- Modify: `web/src/winner/WinnerActions.tsx`
- Modify: `web/src/winner/WinnerEvidence.tsx`
- Modify: `web/src/winner/RejectionSheet.tsx`
- Modify: `web/src/nearby/NearbyPage.tsx`
- Modify: `web/src/location/geocoder.ts`
- Test: existing decision, winner, nearby, and E2E tests

- [ ] **Step 1: Add failing Chinese-route tests and source-name invariants**

Seed a recommendation whose locale is `zh-CN`, render each route, and assert Chinese controls and errors. Use source values `Ember Bowl` and `Charred Chicken Rice` and assert they remain exactly those strings in both locales. Change geocoder failures to typed kinds so the page, not the data service, owns localization:

```ts
export type GeocoderErrorKind = "empty" | "unavailable" | "not_found";
export class GeocoderError extends Error {
  constructor(readonly kind: GeocoderErrorKind) {
    super(kind);
    this.name = "GeocoderError";
  }
}
```

- [ ] **Step 2: Run route tests and verify English-literal failures**

Run: `pnpm --dir web test -- --run tests/elimination.test.tsx tests/elimination-stack.test.tsx tests/winner.test.tsx tests/geolocation.test.ts tests/i18n-ui.test.tsx`

Expected: FAIL on Chinese button, heading, accessible-name, and error assertions.

- [ ] **Step 3: Migrate route copy without translating source data**

Call `useLocale()` for interface locale. Recommendation records may keep their scoring locale, but visible interface copy follows the active global locale. Pass translated labels or `t` into leaf components instead of importing the context into pure view-model functions. Replace the local trace-copy tables with catalog-key maps and these complete projections:

```ts
const reasonKeys: Readonly<Record<string, MessageKey>> = {
  allergen_excluded: "reason.allergen_excluded",
  ingredient_excluded: "reason.ingredient_excluded",
  over_budget: "reason.over_budget",
  energy_outside_range: "reason.energy_outside_range",
  protein_below_floor: "reason.protein_below_floor",
  recent_repetition: "reason.recent_repetition",
  session_excluded: "reason.session_excluded",
  taste_mismatch: "reason.taste_mismatch",
  too_slow: "reason.too_slow",
  taste_match: "reason.taste_match",
  protein_match: "reason.protein_match",
  recent_variety: "reason.recent_variety",
  duration_match: "reason.duration_match",
  confidence_match: "reason.confidence_match",
  meal_period_match: "reason.meal_period_match",
};

const stageKeys: Readonly<Record<StageId, MessageKey>> = {
  found: "stage.found",
  available: "stage.available",
  safety_budget: "stage.safety_budget",
  safety: "stage.safety",
  nutrition: "stage.nutrition",
  repetition: "stage.repetition",
  taste_confidence: "stage.taste_confidence",
  taste: "stage.taste",
  duration: "stage.duration",
  budget: "stage.budget",
  winner: "stage.winner",
};

type Translate = (key: MessageKey, params?: MessageParams) => string;

export function projectTraceStage(stage: EliminationStage, t: Translate): TraceStageView {
  const reason = Object.entries(stage.reason_counts)
    .sort(([leftCode, leftCount], [rightCode, rightCount]) =>
      rightCount - leftCount || leftCode.localeCompare(rightCode))[0];
  const reasonCode = reason?.[0] ?? null;
  return {
    id: stage.id,
    count: stage.survivor_count,
    removedCount: Math.max(0, stage.input_count - stage.survivor_count),
    reasonCode,
    reasonText: reasonCode ? t(reasonKeys[reasonCode] ?? "reason.lower") : t(stageKeys[stage.id]),
    removedIds: stage.representative_removed_ids,
  };
}

export function strongestWinnerReasons(reasonCodes: readonly string[], t: Translate): readonly string[] {
  return reasonCodes.slice(0, 3).map((code) => t(reasonKeys[code] ?? "reason.strong"));
}
```

Winner dish name, description, restaurant name, cuisine tags, and external link labels supplied by source data remain unchanged. Interface units, provenance descriptions, actions, rejection reasons, loading states, and deterministic-selection explanations use `t`.

- [ ] **Step 4: Run migrated route tests and the existing E2E journey**

Run: `pnpm --dir web test -- --run tests/elimination.test.tsx tests/elimination-stack.test.tsx tests/winner.test.tsx tests/geolocation.test.ts tests/i18n-ui.test.tsx && pnpm --dir web e2e -- e2e/demo.spec.ts`

Expected: PASS in English and Chinese; dish and restaurant names remain unchanged.

- [ ] **Step 5: Commit the remaining route migration**

```bash
git add web/src/elimination web/src/winner web/src/nearby/NearbyPage.tsx web/src/location/geocoder.ts web/tests web/e2e/demo.spec.ts
git commit -m "feat: localize decision winner and nearby routes"
```

## Task 4: Build the History-Backed Orbit Model

**Files:**
- Create: `web/src/history/orbit-model.ts`
- Create: `web/tests/orbit-model.test.ts`

- [ ] **Step 1: Write failing pure-model tests**

Cover date filtering, stable sorting, accepted/eaten/rejected evidence, empty history, size/intensity normalization, and angular correctness:

```ts
test("uses one angle for placement and top focus", () => {
  const node = makeOrbitNodes([eventWithTag("warm")], 7, new Date("2026-07-18T12:00:00Z"))[0]!;
  const point = pointOnOrbit(node.angleDeg, node.distance, 300, 300);
  expect(angleFromPoint(point.x, point.y, 300, 300)).toBeCloseTo(node.angleDeg);
  expect(normalizeAngle(node.angleDeg + shortestRotation(node.angleDeg, -90))).toBeCloseTo(270);
});

test("does not invent nodes for empty history", () => {
  expect(makeOrbitNodes([], 7, new Date("2026-07-18T12:00:00Z"))).toEqual([]);
});
```

- [ ] **Step 2: Run the model tests and verify missing exports**

Run: `pnpm --dir web test -- --run tests/orbit-model.test.ts`

Expected: FAIL because `orbit-model.ts` does not exist.

- [ ] **Step 3: Implement deterministic aggregation and geometry**

Use these public types and signatures:

```ts
export interface OrbitNode {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly lastSeenAt: string;
  readonly angleDeg: number;
  readonly distance: number;
  readonly radius: number;
  readonly intensity: number;
}

export function makeOrbitNodes(
  events: readonly HistoryEventRow[],
  days: 7 | 30,
  now: Date,
): readonly OrbitNode[];

export function normalizeAngle(degrees: number): number;
export function shortestRotation(fromDeg: number, targetDeg: number): number;
export function pointOnOrbit(angleDeg: number, distance: number, cx: number, cy: number): { x: number; y: number };
export function angleFromPoint(x: number, y: number, cx: number, cy: number): number;
```

Hash each stable tag ID once to derive `angleDeg`; use that same value for rendered coordinates and focus math. Filter against the injected `now`, never `Date.now()` inside the pure function. Include `accepted`, `eaten`, and `rejected` events as evidence, but keep their outcome counts separate.

- [ ] **Step 4: Run model tests and commit**

Run: `pnpm --dir web test -- --run tests/orbit-model.test.ts`

Expected: PASS, including WARM-equivalent nodes landing at the exact top.

```bash
git add web/src/history/orbit-model.ts web/tests/orbit-model.test.ts
git commit -m "feat: derive taste orbit from meal history"
```

## Task 5: Implement the Smooth, Manually Controlled Taste Orbit

**Files:**
- Create: `web/src/history/TasteOrbit.tsx`
- Modify: `web/src/history/TasteOrbitPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/styles/motion.css`
- Test: `web/tests/taste-orbit.test.tsx`
- Test: `web/e2e/i18n-orbit-privacy.spec.ts`

- [ ] **Step 1: Replace the static-visual test with failing interaction tests**

Seed real history in Dexie. Assert 7/30-day controls, no demo nodes, node focus, indefinite focused state under fake timers, direct node switching, and manual `YOU` return:

```tsx
test("focus persists until YOU returns the orbit to cruising", async () => {
  await seedOrbitHistory();
  vi.useFakeTimers();
  renderOrbitPage();
  const warm = await screen.findByRole("button", { name: /warm, 2 signals/i });
  fireEvent.click(warm);
  expect(warm).toHaveAttribute("aria-pressed", "true");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(warm).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "YOU" }));
  expect(warm).toHaveAttribute("aria-pressed", "false");
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run the focused tests and verify the static page fails**

Run: `pnpm --dir web test -- --run tests/taste-orbit.test.tsx tests/orbit-model.test.ts`

Expected: FAIL because the current SVG nodes are not buttons and current code injects demo events.

- [ ] **Step 3: Implement the Orbit state machine and shared-angle renderer**

Use explicit state rather than timers that clear focus:

```ts
type OrbitMode =
  | { readonly kind: "cruising" }
  | { readonly kind: "focusing"; readonly nodeId: string; readonly targetDeg: number }
  | { readonly kind: "focused"; readonly nodeId: string };
```

`TasteOrbit` receives `nodes`, `locale`, and `reducedMotion`. Maintain one `angleDeg` CSS custom property on the orbit stage. In cruising, update it through requestAnimationFrame at `360 / 90_000` degrees per millisecond. During focus, ease the shortest rotation to `-90°`; transition to `focused` and stop. `YOU` clears selection and resumes from the current angle. Node labels use the inverse custom-property rotation so they stay upright. Cancel requestAnimationFrame on unmount and when `document.visibilityState === "hidden"`; clamp frame delta to 34 ms.

In reduced-motion mode, do not start the ambient frame loop. Node selection changes details through short opacity/scale styles only.

- [ ] **Step 4: Replace fake data with real range data and accessible empty state**

`TasteOrbitPage` reads history once, exposes translated 7/30-day buttons, passes `makeOrbitNodes(events, range, now)` to `TasteOrbit`, and renders the translated empty state when nodes are empty. Stats must guard zero denominators and use `formatMoney` for the active locale. The textual summary contains the same evidence as the visual nodes.

- [ ] **Step 5: Add responsive and reduced-motion CSS**

Keep Orbit title, range control, visualization, `YOU`, and focus hint in the first mobile viewport at 320×640. Animate only transform and opacity. Do not add continuously animated blur, filter, or shadow properties. Give every node and `YOU` at least a 44 px touch target and a visible focus state.

- [ ] **Step 6: Run unit, mobile E2E, lint, and build checks**

Run: `pnpm --dir web test -- --run tests/orbit-model.test.ts tests/taste-orbit.test.tsx && pnpm --dir web e2e -- e2e/i18n-orbit-privacy.spec.ts --grep "orbit" && pnpm --dir web lint && pnpm --dir web build`

Expected: PASS; the E2E test asserts the range control and `YOU` are in viewport and that node text remains visually unrotated via computed transform.

- [ ] **Step 7: Commit Taste Orbit**

```bash
git add web/src/history web/src/styles/global.css web/src/styles/motion.css web/tests/orbit-model.test.ts web/tests/taste-orbit.test.tsx web/e2e/i18n-orbit-privacy.spec.ts
git commit -m "feat: make taste orbit interactive and history backed"
```

## Task 6: Add Privacy Persistence and Scoped Deletion

**Files:**
- Modify: `web/src/db/db.ts`
- Create: `web/src/privacy/privacy-store.ts`
- Create: `web/tests/privacy-store.test.ts`

- [ ] **Step 1: Write failing storage-boundary tests**

```ts
test("access events never persist precise coordinates", async () => {
  await recordPrivacyAccess({ category: "precise_location", purpose: "nearby_map", recipient: "OpenStreetMap", occurredAt: "2026-07-18T12:00:00Z" });
  const events = await listPrivacyAccessEvents();
  expect(events[0]).toEqual(expect.objectContaining({ category: "precise_location", recipient: "OpenStreetMap" }));
  expect(JSON.stringify(events)).not.toMatch(/31\.23|121\.47|latitude|longitude/);
});

test("deleting profile data preserves locale and privacy log", async () => {
  await db.settings.bulkPut([{ key: "locale.v2", value: "zh-CN" }, { key: "profile.v2", value: { secret: true } }]);
  await recordPrivacyAccess({ category: "precise_location", purpose: "nearby_map", recipient: "OpenStreetMap", occurredAt: "2026-07-18T12:00:00Z" });
  await deleteLocalProfileData();
  expect((await db.settings.get("locale.v2"))?.value).toBe("zh-CN");
  expect(await db.settings.get("profile.v2")).toBeUndefined();
  expect(await listPrivacyAccessEvents()).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests and verify missing table/API failures**

Run: `pnpm --dir web test -- --run tests/privacy-store.test.ts`

Expected: FAIL because the privacy table and APIs do not exist.

- [ ] **Step 3: Add Dexie v3 and the privacy-store API**

Define coordinate-free rows:

```ts
export type ProtectedDataCategory = "precise_location" | "health_signals" | "meal_history" | "taste_profile" | "identity_device";
export interface PrivacyAccessEventRow {
  id: string;
  occurred_at: string;
  category: ProtectedDataCategory;
  purpose: "nearby_map" | "profile_read" | "profile_delete";
  recipient: "device" | "OpenStreetMap";
}
```

Add `privacyAccessEvents` to Dexie version 3 with indexes `id, occurred_at, category, recipient`. `recordPrivacyAccess` accepts only the fields above and generates the ID. Store location permission under `privacy.location.enabled`; expose `getLocationPermission` and `setLocationPermission`. `deleteLocalProfileData` deletes `profile.v2`, clears daily context, history, and saved decisions, preserves `locale.v2`, preserves permission choice, and preserves the access log.

- [ ] **Step 4: Run persistence tests and commit**

Run: `pnpm --dir web test -- --run tests/privacy-store.test.ts tests/history.test.ts tests/locale.test.ts`

Expected: PASS with the existing reset helper still clearing every table for test isolation.

```bash
git add web/src/db/db.ts web/src/privacy/privacy-store.ts web/tests/privacy-store.test.ts
git commit -m "feat: persist privacy choices and access events"
```

## Task 7: Build the Privacy Boundary Explorer

**Files:**
- Create: `web/src/privacy/privacy-model.ts`
- Create: `web/src/privacy/PrivacyBoundaryExplorer.tsx`
- Modify: `web/src/privacy/PrivacyPage.tsx`
- Modify: `web/src/styles/global.css`
- Test: `web/tests/privacy.test.tsx`

- [ ] **Step 1: Write failing disclosure, log, and deletion tests**

Assert all five protected categories are buttons, selecting each reveals purpose/storage/retention/recipient, sync is visibly unavailable, access events render, and profile deletion requires confirmation before clearing data.

```tsx
test("explains all protected categories and marks sync as future capability", async () => {
  renderPrivacyPage();
  for (const name of ["Precise location", "Health signals", "Meal history", "Taste profile", "Identity and device identifiers"]) {
    expect(screen.getByRole("button", { name })).toBeVisible();
  }
  fireEvent.click(screen.getByRole("button", { name: "Precise location" }));
  expect(screen.getByText("OpenStreetMap")).toBeVisible();
  expect(screen.getByText(/nothing is uploaded/i)).toBeVisible();
});
```

- [ ] **Step 2: Run component tests and verify the static page fails**

Run: `pnpm --dir web test -- --run tests/privacy.test.tsx tests/privacy-store.test.ts`

Expected: FAIL because PrivacyPage contains only static copy.

- [ ] **Step 3: Implement factual localized category view models**

`privacy-model.ts` exports `getPrivacyCategories(t)` and returns five complete records:

```ts
export interface PrivacyCategoryView {
  readonly id: ProtectedDataCategory;
  readonly title: string;
  readonly purpose: string;
  readonly storage: string;
  readonly retention: string;
  readonly recipient: string;
  readonly leavesDevice: boolean;
}
```

Precise location names OpenStreetMap and says raw coordinates are not stored. Health signals say the web demo does not read them. Meal history and taste profile say device-local. Identity/device says no advertising identifier is created. The future sync card is disabled and explicitly says the web demo uploads nothing.

- [ ] **Step 4: Implement explorer interactions, access log, and deletion**

The explorer starts with precise location selected, supports click and keyboard selection, and changes its detail panel with opacity/transform only. A data-flow line appears only when the selected category's `leavesDevice` is true; it is labeled with the actual recipient.

`PrivacyPage` loads permission and access events, renders localized event time/category/purpose/recipient, and opens a native dialog-style confirmation region before `deleteLocalProfileData`. On confirmation, delete, append a `profile_delete` access event with recipient `device`, refresh page data, and show a localized success status.

- [ ] **Step 5: Add mobile and reduced-motion styles**

At 320 px, category controls form a horizontally scrollable, keyboard-accessible row without clipping their labels; details stack below the boundary graphic. Reduced motion removes flow animation but retains its labeled path and category state.

- [ ] **Step 6: Run Privacy tests, accessibility tests, lint, and build**

Run: `pnpm --dir web test -- --run tests/privacy.test.tsx tests/privacy-store.test.ts tests/accessibility.test.tsx && pnpm --dir web lint && pnpm --dir web build`

Expected: PASS with no operational encrypted-sync control in the web demo.

- [ ] **Step 7: Commit the Privacy explorer**

```bash
git add web/src/privacy web/src/styles/global.css web/tests/privacy.test.tsx web/tests/privacy-store.test.ts web/tests/accessibility.test.tsx
git commit -m "feat: explain and control privacy boundaries"
```

## Task 8: Gate Nearby Location Through Explicit Consent

**Files:**
- Create: `web/src/privacy/LocationConsentDialog.tsx`
- Modify: `web/src/nearby/NearbyPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/tests/geolocation.test.ts`
- Modify: `web/e2e/nearby.spec.ts`
- Modify: `web/e2e/i18n-orbit-privacy.spec.ts`

- [ ] **Step 1: Write failing consent and access-log tests**

Test that the first `Use current location` click opens disclosure without invoking `navigator.geolocation`; `Allow once` invokes it; denial shows a localized area fallback; disabling location in the privacy store prevents invocation; success writes one coordinate-free OpenStreetMap event.

```tsx
fireEvent.click(screen.getByRole("button", { name: "Use current location" }));
expect(mockGetCurrentPosition).not.toHaveBeenCalled();
expect(screen.getByRole("dialog", { name: "Share precise location once?" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
await waitFor(() => expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1));
expect(JSON.stringify(await listPrivacyAccessEvents())).not.toContain("31.23");
```

- [ ] **Step 2: Run focused tests and verify location is currently immediate**

Run: `pnpm --dir web test -- --run tests/geolocation.test.ts tests/privacy-store.test.ts && pnpm --dir web e2e -- e2e/nearby.spec.ts`

Expected: FAIL because current `locate()` requests geolocation immediately and writes no access event.

- [ ] **Step 3: Implement one-time consent and truthful event timing**

`LocationConsentDialog` is a semantic dialog with Cancel and Allow once actions, purpose text, recipient text, and Escape handling. Nearby opens it on initial intent. Only Allow once calls `requestCurrentLocation`. Record the OpenStreetMap access event immediately before assigning the coordinate-bearing iframe URL, not when the dialog opens and not after a failed geolocation request. Never place coordinates in React copy, local storage, or event records.

When stored location permission is disabled, skip geolocation and show the localized manual-area status. Manual area geocoding is an explicit form submission; add an access event for the external area lookup only if the privacy event type is expanded with a non-precise `area_query` category. Otherwise keep its existing explicit notice and do not mislabel it as precise location.

- [ ] **Step 4: Run location tests and both E2E paths**

Run: `pnpm --dir web test -- --run tests/geolocation.test.ts tests/privacy-store.test.ts && pnpm --dir web e2e -- e2e/nearby.spec.ts e2e/i18n-orbit-privacy.spec.ts`

Expected: PASS; no browser geolocation prompt occurs before the OneDish consent action.

- [ ] **Step 5: Commit explicit location consent**

```bash
git add web/src/privacy/LocationConsentDialog.tsx web/src/nearby/NearbyPage.tsx web/src/styles/global.css web/tests/geolocation.test.ts web/e2e/nearby.spec.ts web/e2e/i18n-orbit-privacy.spec.ts
git commit -m "feat: require explicit consent for location sharing"
```

## Task 9: Complete Cross-Locale and Full-Suite Verification

**Files:**
- Modify: `web/e2e/i18n-orbit-privacy.spec.ts`
- Modify: affected existing tests with stale English-only queries
- Modify: `docs/superpowers/specs/2026-07-18-onedish-i18n-orbit-privacy-design.md` only if implementation reveals a truthful behavior correction

- [ ] **Step 1: Add the complete route matrix E2E test**

Visit Home, Elimination, Winner, Nearby, Taste Orbit, and Privacy in English, then switch to Chinese and revisit every route. Assert one translated landmark and one translated action per route. Assert the test dish and restaurant names are byte-for-byte unchanged. At 320×640, assert the language switch, Orbit range control, Orbit `YOU`, and Privacy category selector are in the viewport or reachable without horizontal page overflow.

- [ ] **Step 2: Add reduced-motion and persistence E2E coverage**

Emulate reduced motion before navigation. Assert Orbit has no ambient rotation over 500 ms but still focuses a node and returns through `YOU`. Reload after selecting Chinese and assert the language remains Chinese. Delete the local profile and assert locale persists while Orbit shows its truthful empty state.

- [ ] **Step 3: Run every frontend verification command**

Run:

```bash
pnpm --dir web test -- --run
pnpm --dir web lint
pnpm --dir web build
pnpm --dir web e2e
```

Expected: all unit/component tests pass, ESLint reports zero warnings, TypeScript and Vite build successfully, and all desktop/mobile Playwright projects pass. The existing Vite bundle-size warning is acceptable only if it remains a warning and the generated JavaScript size does not materially regress from the baseline.

- [ ] **Step 4: Manually inspect the two motion-heavy pages**

Run: `pnpm --dir web dev`

Check desktop and 320×640 mobile views in both languages. Confirm Orbit maintains upright labels, WARM-equivalent nodes land at the top, focus never auto-exits, `YOU` resumes motion immediately, Privacy flow matches the selected disclosure, and no page mixes Chinese and English interface copy.

- [ ] **Step 5: Commit final verification updates**

```bash
git add web/e2e web/tests docs/superpowers/specs/2026-07-18-onedish-i18n-orbit-privacy-design.md
git commit -m "test: verify bilingual orbit and privacy experience"
```
