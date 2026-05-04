export type TelegramUser = {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
};

export type TelegramWebApp = {
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

export function getTelegramUser(): TelegramUser | null {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;

  return user?.id === undefined || user.id === null ? null : user;
}

export function getTelegramUserId(): string | null {
  const user = getTelegramUser();

  return user ? String(user.id) : null;
}

export function initTelegramWebApp(): void {
  const webApp = getTelegramWebApp();

  if (!webApp) {
    return;
  }

  webApp.ready?.();
  webApp.expand?.();
}

export function isBrowserFallbackAllowed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".vercel.app");
}
