import { createBrowserRouter, createHashRouter, type RouteObject } from "react-router";
import { Layout } from "../shared/Layout";
import { HomePage } from "../home/HomePage";
import { EliminationPage } from "../elimination/EliminationPage";
import { WinnerPage } from "../winner/WinnerPage";
import { TasteOrbitPage } from "../history/TasteOrbitPage";
import { PrivacyPage } from "../privacy/PrivacyPage";
import { NearbyPage } from "../nearby/NearbyPage";
import { OfflineDemoHomePage } from "../demo/OfflineDemoHomePage";
import { RestaurantEliminationPage } from "../restaurants/RestaurantEliminationPage";
import { RestaurantWinnerPage } from "../restaurants/RestaurantWinnerPage";
import { restaurantFirstEnabled } from "./features";

const routes: RouteObject[] = [
  { path: "/", element: <Layout />, children: [
    { index: true, element: restaurantFirstEnabled ? <HomePage /> : <OfflineDemoHomePage /> },
    { path: "demo", element: <OfflineDemoHomePage /> },
    { path: "restaurants/choose/:sessionId", element: <RestaurantEliminationPage /> },
    { path: "restaurants/winner/:sessionId", element: <RestaurantWinnerPage /> },
    { path: "setup", element: <HomePage /> },
    { path: "choose/:decisionId", element: <EliminationPage /> },
    { path: "winner/:decisionId", element: <WinnerPage /> },
    { path: "nearby/:decisionId", element: <NearbyPage /> },
    { path: "history", element: <TasteOrbitPage /> },
    { path: "privacy", element: <PrivacyPage /> },
  ] },
];

export const router = import.meta.env.BASE_URL === "/"
  ? createBrowserRouter(routes)
  : createHashRouter(routes);
