import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <main><h1>OneDish</h1></main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<StrictMode><App /></StrictMode>);
