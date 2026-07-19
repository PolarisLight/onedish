import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/styles/global.css"), "utf8");

test("keeps mobile landmark results centered inside the viewport without changing desktop alignment", () => {
  expect(css).toMatch(
    /\.landmark-results\s*\{[^}]*transform:\s*translateX\(calc\(-50% - 32px\)\)/,
  );
  expect(css).toMatch(
    /@media \(max-width: 767px\) \{[\s\S]*?\.landmark-results\s*\{[^}]*transform:\s*translateX\(-50%\)/,
  );
});
