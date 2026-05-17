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
  themeParams?: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
    header_bg_color?: string;
    accent_text_color?: string;
    section_bg_color?: string;
    section_header_text_color?: string;
    subtitle_text_color?: string;
    destructive_text_color?: string;
  };
  safeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  contentSafeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  viewportHeight?: number;
  viewportStableHeight?: number;
  isExpanded?: boolean;
  colorScheme?: "light" | "dark";
  BackButton?: {
    isVisible?: boolean;
    show?: () => void;
    hide?: () => void;
    onClick?: (eventHandler: () => void) => void;
    offClick?: (eventHandler: () => void) => void;
  };
  MainButton?: {
    text?: string;
    isVisible?: boolean;
    isActive?: boolean;
    isProgressVisible?: boolean;
    setText?: (text: string) => void;
    show?: () => void;
    hide?: () => void;
    enable?: () => void;
    disable?: () => void;
    showProgress?: (leaveActive?: boolean) => void;
    hideProgress?: () => void;
    onClick?: (eventHandler: () => void) => void;
    offClick?: (eventHandler: () => void) => void;
    setParams?: (params: {
      text?: string;
      color?: string;
      text_color?: string;
      is_active?: boolean;
      is_visible?: boolean;
    }) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
    selectionChanged?: () => void;
  };
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void;
  showPopup?: (
    params: {
      title?: string;
      message: string;
      buttons?: Array<{
        id?: string;
        type?: "default" | "ok" | "close" | "cancel" | "destructive";
        text?: string;
      }>;
    },
    callback?: (buttonId: string) => void,
  ) => void;
  ready?: () => void;
  expand?: () => void;
  onEvent?: (eventType: string, eventHandler: () => void) => void;
  offEvent?: (eventType: string, eventHandler: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
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

  applyTelegramSafeArea(webApp);
  applyTelegramViewport(webApp);
  applyTelegramThemeParams(webApp);

  try {
    webApp.setHeaderColor?.("#000000");
    webApp.setBackgroundColor?.("#000000");
  } catch (error) {
    console.warn("[telegram] WebApp colors failed", error);
  }

  try {
    webApp.onEvent?.("safeAreaChanged", () => applyTelegramSafeArea(webApp));
    webApp.onEvent?.("contentSafeAreaChanged", () => applyTelegramSafeArea(webApp));
    webApp.onEvent?.("viewportChanged", () => {
      applyTelegramSafeArea(webApp);
      applyTelegramViewport(webApp);
    });
    webApp.onEvent?.("themeChanged", () => applyTelegramThemeParams(webApp));
  } catch (error) {
    console.warn("[telegram] WebApp listener failed", error);
  }
}

function applyTelegramSafeArea(webApp = getTelegramWebApp()): void {
  if (typeof document === "undefined") {
    return;
  }

  const topInset = Math.max(
    Number(webApp?.safeAreaInset?.top ?? 0),
    Number(webApp?.contentSafeAreaInset?.top ?? 0),
    0,
  );

  document.documentElement.style.setProperty("--telegram-safe-area-top", `${topInset}px`);

  const bottomInset = Math.max(
    Number(webApp?.safeAreaInset?.bottom ?? 0),
    Number(webApp?.contentSafeAreaInset?.bottom ?? 0),
    0,
  );

  document.documentElement.style.setProperty("--telegram-safe-area-bottom", `${bottomInset}px`);
}

function applyTelegramViewport(webApp = getTelegramWebApp()): void {
  if (typeof document === "undefined") {
    return;
  }

  if (typeof webApp?.viewportHeight === "number" && Number.isFinite(webApp.viewportHeight)) {
    document.documentElement.style.setProperty("--telegram-viewport-height", `${webApp.viewportHeight}px`);
  }

  if (typeof webApp?.viewportStableHeight === "number" && Number.isFinite(webApp.viewportStableHeight)) {
    document.documentElement.style.setProperty("--telegram-viewport-stable-height", `${webApp.viewportStableHeight}px`);
  }
}

function normalizeThemeColor(value: string | undefined, fallback: string): string {
  return value && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value) ? value : fallback;
}

export function applyTelegramThemeParams(webApp = getTelegramWebApp()): void {
  if (typeof document === "undefined") {
    return;
  }

  const theme = webApp?.themeParams ?? {};
  const root = document.documentElement;
  const bgColor = normalizeThemeColor(theme.bg_color, "#050509");
  const textColor = normalizeThemeColor(theme.text_color, "#f7f7fb");
  const hintColor = normalizeThemeColor(theme.hint_color, "#8f8f98");
  const buttonColor = normalizeThemeColor(theme.button_color, "#7c5cff");
  const buttonTextColor = normalizeThemeColor(theme.button_text_color, "#ffffff");
  const secondaryBgColor = normalizeThemeColor(theme.secondary_bg_color, "#111116");

  root.style.setProperty("--tg-theme-bg-color", bgColor);
  root.style.setProperty("--tg-theme-text-color", textColor);
  root.style.setProperty("--tg-theme-hint-color", hintColor);
  root.style.setProperty("--tg-theme-button-color", buttonColor);
  root.style.setProperty("--tg-theme-button-text-color", buttonTextColor);
  root.style.setProperty("--tg-theme-secondary-bg-color", secondaryBgColor);
  root.style.setProperty("--telegram-bg-color", bgColor);
  root.style.setProperty("--telegram-text-color", textColor);
  root.style.setProperty("--telegram-hint-color", hintColor);
  root.style.setProperty("--telegram-button-color", buttonColor);
  root.style.setProperty("--telegram-button-text-color", buttonTextColor);

  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColorMeta?.setAttribute("content", bgColor);
}

export function hasTelegramMainButton(): boolean {
  return Boolean(getTelegramWebApp()?.MainButton);
}

export function setupTelegramBackButton(visible: boolean, onClick: () => void): () => void {
  const backButton = getTelegramWebApp()?.BackButton;

  if (!backButton) {
    return () => undefined;
  }

  const handler = () => onClick();

  try {
    if (visible) {
      backButton.onClick?.(handler);
      backButton.show?.();
    } else {
      backButton.hide?.();
    }
  } catch (error) {
    console.warn("[telegram] BackButton setup failed", error);
  }

  return () => {
    try {
      backButton.offClick?.(handler);

      if (visible) {
        backButton.hide?.();
      }
    } catch (error) {
      console.warn("[telegram] BackButton cleanup failed", error);
    }
  };
}

export function setupTelegramMainButton({
  visible,
  text,
  disabled = false,
  loading = false,
  onClick,
}: {
  visible: boolean;
  text: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}): () => void {
  const mainButton = getTelegramWebApp()?.MainButton;

  if (!mainButton) {
    return () => undefined;
  }

  const handler = () => {
    if (!disabled && !loading) {
      onClick();
    }
  };

  try {
    mainButton.setText?.(text);
    mainButton.setParams?.({
      text,
      is_active: !disabled && !loading,
      is_visible: visible,
    });

    if (disabled || loading) {
      mainButton.disable?.();
    } else {
      mainButton.enable?.();
    }

    if (loading) {
      mainButton.showProgress?.(false);
    } else {
      mainButton.hideProgress?.();
    }

    mainButton.onClick?.(handler);

    if (visible) {
      mainButton.show?.();
    } else {
      mainButton.hide?.();
    }
  } catch (error) {
    console.warn("[telegram] MainButton setup failed", error);
  }

  return () => {
    try {
      mainButton.offClick?.(handler);
      mainButton.hideProgress?.();
      mainButton.hide?.();
    } catch (error) {
      console.warn("[telegram] MainButton cleanup failed", error);
    }
  };
}

export function telegramImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light"): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);
  } catch (error) {
    console.warn("[telegram] haptic impact failed", error);
  }
}

export function telegramSelectionChanged(): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged?.();
  } catch (error) {
    console.warn("[telegram] haptic selection failed", error);
  }
}

export function telegramNotification(type: "error" | "success" | "warning"): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  } catch (error) {
    console.warn("[telegram] haptic notification failed", error);
  }
}

export function showTelegramConfirm(message: string): Promise<boolean> {
  const webApp = getTelegramWebApp();

  if (webApp?.showConfirm) {
    return new Promise((resolve) => {
      try {
        webApp.showConfirm?.(message, resolve);
      } catch (error) {
        console.warn("[telegram] showConfirm failed", error);
        resolve(typeof window !== "undefined" ? window.confirm(message) : false);
      }
    });
  }

  if (typeof window !== "undefined") {
    return Promise.resolve(window.confirm(message));
  }

  return Promise.resolve(false);
}

export function showTelegramPopup({
  title,
  message,
  buttons,
}: {
  title?: string;
  message: string;
  buttons?: Array<{
    id?: string;
    type?: "default" | "ok" | "close" | "cancel" | "destructive";
    text?: string;
  }>;
}): Promise<string | null> {
  const webApp = getTelegramWebApp();

  if (!webApp?.showPopup) {
    if (typeof window !== "undefined") {
      window.alert(title ? `${title}\n\n${message}` : message);
    }

    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      webApp.showPopup?.({ title, message, buttons }, (buttonId) => resolve(buttonId));
    } catch (error) {
      console.warn("[telegram] showPopup failed", error);
      resolve(null);
    }
  });
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
