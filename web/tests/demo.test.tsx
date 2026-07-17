import { render, screen } from "@testing-library/react";
import { DemoBadge } from "../src/demo/DemoBadge";
import { parseDemoRecord } from "../src/domain/contracts";

describe("demo boundary", () => {
  it("shows a persistent synthetic data label", () => {
    render(<DemoBadge />);
    expect(screen.getByText("Synthetic demo context")).toBeVisible();
  });

  it("rejects a non-monotonic decision record", () => {
    expect(() =>
      parseDemoRecord({
        schema_version: "demo.v1",
        state_id: "day1",
        catalog_version: "catalog.v1",
        engine_version: "engine.v1",
        input_sha256: "a".repeat(64),
        decision: {
          input_sha256: "a".repeat(64),
          stages: [
            { id: "found", input_count: 1, survivor_count: 1 },
            { id: "winner", input_count: 1, survivor_count: 2 },
          ],
        },
      }),
    ).toThrow(/stage counts/i);
  });
});
