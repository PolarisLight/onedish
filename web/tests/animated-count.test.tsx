import { render, screen } from "@testing-library/react";
import { AnimatedCount } from "../src/elimination/AnimatedCount";

test("reduced motion renders a static polite count", () => {
  render(<AnimatedCount value={18} reducedMotion />);
  expect(screen.getByText("18")).toHaveAttribute("aria-live", "polite");
});
