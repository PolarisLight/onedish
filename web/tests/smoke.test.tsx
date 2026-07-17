import { render, screen } from "@testing-library/react";

function Smoke() {
  return <main><h1>OneDish</h1></main>;
}

test("renders the product name", () => {
  render(<Smoke />);
  expect(screen.getByRole("heading", { name: "OneDish" })).toBeInTheDocument();
});
