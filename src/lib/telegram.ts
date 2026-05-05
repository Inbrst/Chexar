export type TelegramUser = {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
};

export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramUser;
  };
  ready?: () => void;
  expand?: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.Telegram?.WebApp ?? null;
}

export function hasTelegramWebAppSdk(): boolean {
  return getTelegramWebApp() !== null;
}

export function getTelegramUser(): TelegramUser | null {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;

  return user?.id === undefined || user.id === null ? null : user;
}

export function getTelegramUserId(): string | null {
  const user = getTelegramUser();

  return user ? String(user.id) : null;
}

export function isTelegramMiniApp(): boolean {
  const webApp = getTelegramWebApp();

  return Boolean(webApp && (webApp.initData || getTelegramUser()));
}

export function isTelegramUserMissing(): boolean {
  const webApp = getTelegramWebApp();

  return Boolean(webApp?.initData && !getTelegramUser());
}

export type TelegramConnectionStatus = "connected" | "missing-user" | "browser";

export function getTelegramConnectionStatus(): TelegramConnectionStatus {
  if (getTelegramUser()) {
    return "connected";
  }

  if (isTelegramUserMissing()) {
    return "missing-user";
  }

  return "browser";
}

export function initTelegramWebApp(): void {
  const webApp = getTelegramWebApp();

  logTelegramDebugInfo();

  if (!webApp) {
    return;
  }

  try {
    webApp.ready?.();
  } catch (error) {
    console.warn("[telegram] WebApp.ready failed", error);
  }

  try {
    webApp.expand?.();
  } catch (error) {
    console.warn("[telegram] WebApp.expand failed", error);
  }
}

export function logTelegramDebugInfo(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  const webApp = getTelegramWebApp();
  const user = getTelegramUser();

  console.info("[telegram] environment", {
    hasTelegram: Boolean(window.Telegram),
    hasWebApp: Boolean(webApp),
    hasInitData: Boolean(webApp?.initData),
    hasInitDataUnsafeUser: Boolean(webApp?.initDataUnsafe?.user),
    userId: user ? String(user.id) : null,
  });
}

export function isBrowserFallbackAllowed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".vercel.app");
}
