import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { LocaleProvider } from "./i18n/locale";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<StrictMode><LocaleProvider><RouterProvider router={router} /></LocaleProvider></StrictMode>);
