import { render, screen } from "@testing-library/react";
import { SafeAreaActions } from "../src/shared/SafeAreaActions";

test("keeps the primary decision action in a named region", () => {
  render(<SafeAreaActions label="Decision actions"><button>Meet your dish</button></SafeAreaActions>);
  expect(screen.getByRole("region", { name: "Decision actions" })).toContainElement(screen.getByRole("button"));
});
