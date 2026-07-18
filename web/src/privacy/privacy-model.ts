import type { MessageKey, MessageParams } from "../i18n/messages";
import type { ProtectedDataCategory } from "./privacy-store";

type Translate = (key: MessageKey, params?: MessageParams) => string;

export interface PrivacyCategoryView {
  readonly id: ProtectedDataCategory;
  readonly title: string;
  readonly purpose: string;
  readonly storage: string;
  readonly retention: string;
  readonly recipient: string;
  readonly leavesDevice: boolean;
}

export function getPrivacyCategories(t: Translate): readonly PrivacyCategoryView[] {
  return [
    { id: "precise_location", title: t("privacy.location"), purpose: t("privacy.locationPurpose"), storage: t("privacy.locationStorage"), retention: t("privacy.locationRetention"), recipient: "OpenStreetMap", leavesDevice: true },
    { id: "health_signals", title: t("privacy.health"), purpose: t("privacy.healthPurpose"), storage: t("privacy.healthStorage"), retention: t("privacy.healthRetention"), recipient: t("privacy.none"), leavesDevice: false },
    { id: "meal_history", title: t("privacy.meals"), purpose: t("privacy.mealsPurpose"), storage: t("privacy.mealsStorage"), retention: t("privacy.mealsRetention"), recipient: t("privacy.device"), leavesDevice: false },
    { id: "taste_profile", title: t("privacy.taste"), purpose: t("privacy.tastePurpose"), storage: t("privacy.tasteStorage"), retention: t("privacy.tasteRetention"), recipient: t("privacy.device"), leavesDevice: false },
    { id: "identity_device", title: t("privacy.identity"), purpose: t("privacy.identityPurpose"), storage: t("privacy.identityStorage"), retention: t("privacy.identityRetention"), recipient: t("privacy.none"), leavesDevice: false },
  ];
}
