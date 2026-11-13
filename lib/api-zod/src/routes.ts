/** Public destinations shared by application routing and transactional emails. */
export const APP_ROUTES = {
  session: "/session",
  signIn: "/sign-in",
  settings: "/settings",
  billing: "/billing",
} as const;
export const sessionPath = (id: string) => `${APP_ROUTES.session}/${encodeURIComponent(id)}`;
export const notificationSettingsPath = `${APP_ROUTES.settings}?tab=notifications`;
