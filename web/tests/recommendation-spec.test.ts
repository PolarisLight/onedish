import catalog from "../public/data/catalog.v1.json";
import rules from "../public/data/decision.v2.json";
import places from "../public/data/places.v1.json";
import { loadRecommendationData, parseDecisionSpec } from "../src/recommendation/spec";


afterEach(() => {
  vi.unstubAllGlobals();
});


test("parses decision-v2 locale defaults", () => {
  const parsed = parseDecisionSpec(rules);

  expect(parsed.locales.en.currency).toBe("USD");
  expect(parsed.locales["zh-CN"].currency).toBe("CNY");
  expect(parsed.stage_order.at(-1)).toBe("winner");
});


test("rejects invalid score divisors", () => {
  const invalid = structuredClone(rules);
  invalid.score.distance_divisor = 0;

  expect(() => parseDecisionSpec(invalid)).toThrow(/distance_divisor/i);
});


test("loads all three generated runtime files", async () => {
  const bilingualCatalog = structuredClone(catalog) as typeof catalog & {
    dishes: Array<(typeof catalog.dishes)[number] & {
      translations: { "zh-CN": { name: string; description: string } };
    }>;
  };
  bilingualCatalog.dishes = bilingualCatalog.dishes.map((dish) => ({
    ...dish,
    translations: {
      "zh-CN": { name: `中文 ${dish.name}`, description: `中文 ${dish.description}` },
    },
  }));
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("decision.v2.json")) return new Response(JSON.stringify(rules));
    if (url.endsWith("catalog.v1.json")) return new Response(JSON.stringify(bilingualCatalog));
    if (url.endsWith("places.v1.json")) return new Response(JSON.stringify(places));
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const data = await loadRecommendationData("/data/");

  expect(data.spec.version).toBe("decision.v2");
  expect(data.catalog.dishes).toHaveLength(90);
  expect(data.places).toHaveLength(10);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});


test("rejects a runtime catalog without complete Chinese dish text", async () => {
  const incompleteCatalog = structuredClone(catalog) as unknown as {
    dishes: Array<{ translations?: { "zh-CN": { name: string; description: string } } }>;
  };
  delete incompleteCatalog.dishes[0]!.translations;
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("decision.v2.json")) return new Response(JSON.stringify(rules));
    if (url.endsWith("catalog.v1.json")) return new Response(JSON.stringify(incompleteCatalog));
    if (url.endsWith("places.v1.json")) return new Response(JSON.stringify(places));
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(loadRecommendationData("/data/")).rejects.toThrow(/zh-CN translation/i);
});
