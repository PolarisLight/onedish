import { messagesForTesting } from "../src/i18n/messages";

const banned = [
  /repeated signals grow larger/i,
  /重复信号会变大/,
  /hackathon demo/i,
  /黑客松演示数据/,
  /coming with the future app/i,
  /未来 App 将提供此功能/,
  /text summary of taste clusters/i,
  /口味聚类文字摘要/,
];

test("primary product copy contains no implementation-reporting phrases", () => {
  for (const [locale, messages] of Object.entries(messagesForTesting)) {
    const primary = Object.entries(messages)
      .filter(([key]) => /^(home|profile|decision|winner|nearby|orbit|privacy|consent)\./.test(key))
      .map(([, value]) => value)
      .join("\n");
    for (const phrase of banned) {
      expect(primary, `${locale}: ${phrase}`).not.toMatch(phrase);
    }
  }
});
