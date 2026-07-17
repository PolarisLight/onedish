import { createBrowserRouter } from "react-router";
import { Layout } from "../shared/Layout";
import { HomePage } from "../home/HomePage";
import { EliminationPage } from "../elimination/EliminationPage";
import { WinnerPage } from "../winner/WinnerPage";
import { TasteOrbitPage } from "../history/TasteOrbitPage";
import { PrivacyPage } from "../privacy/PrivacyPage";

export const router = createBrowserRouter([
  { path: "/", element: <Layout />, children: [
    { index: true, element: <HomePage /> },
    { path: "setup", element: <HomePage /> },
    { path: "choose/:decisionId", element: <EliminationPage /> },
    { path: "winner/:decisionId", element: <WinnerPage /> },
    { path: "history", element: <TasteOrbitPage /> },
    { path: "privacy", element: <PrivacyPage /> },
  ] },
]);
