import { messagesForTesting } from "../src/i18n/messages";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const banned = [
  /repeated signals grow larger/i,
  /重复信号会变大/,
  /hackathon demo/i,
  /黑客松演示数据/,
  /coming with the future app/i,
  /未来 App 将提供此功能/,
  /text summary of taste clusters/i,
  /口味聚类文字摘要/,
  /AI receives minimized candidate fields/i,
  /AI 只会收到最少化的候选字段/,
];

test("primary product copy contains no implementation-reporting phrases", () => {
  for (const [locale, messages] of Object.entries(messagesForTesting)) {
    const primary = Object.entries(messages)
      .filter(([key]) => /^(home|profile|decision|winner|nearby|orbit|privacy|consent|restaurant)\./.test(key))
      .map(([, value]) => value)
      .join("\n");
    for (const phrase of banned) {
      expect(primary, `${locale}: ${phrase}`).not.toMatch(phrase);
    }
  }
});

test("production restaurant journey does not expose dish or menu controls", () => {
  const root = resolve(import.meta.dirname, "../..");
  const productionJourney = [
    "web/src/home/HomePage.tsx",
    "web/src/profile/ProfileSheet.tsx",
    "web/src/restaurants/RestaurantPreferenceForm.tsx",
  ].map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
  expect(productionJourney).not.toMatch(/allergen|ingredient|meal period|menu item/i);
});
