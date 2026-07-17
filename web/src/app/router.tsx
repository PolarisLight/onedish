import { createBrowserRouter, createHashRouter, type RouteObject } from "react-router";
import { Layout } from "../shared/Layout";
import { HomePage } from "../home/HomePage";
import { EliminationPage } from "../elimination/EliminationPage";
import { WinnerPage } from "../winner/WinnerPage";
import { TasteOrbitPage } from "../history/TasteOrbitPage";
import { PrivacyPage } from "../privacy/PrivacyPage";

const routes: RouteObject[] = [
  { path: "/", element: <Layout />, children: [
    { index: true, element: <HomePage /> },
    { path: "setup", element: <HomePage /> },
    { path: "choose/:decisionId", element: <EliminationPage /> },
    { path: "winner/:decisionId", element: <WinnerPage /> },
    { path: "history", element: <TasteOrbitPage /> },
    { path: "privacy", element: <PrivacyPage /> },
  ] },
];

export const router = import.meta.env.BASE_URL === "/"
  ? createBrowserRouter(routes)
  : createHashRouter(routes);
