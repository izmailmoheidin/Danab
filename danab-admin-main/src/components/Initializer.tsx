"use client";

import { useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDarkModeStore } from "@/stores/useDarkModeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";

export default function Initializer({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialized = useRef(false);

  if (!initialized.current && typeof window !== "undefined") {
    useAuthStore.getState().initAuth();
    useDarkModeStore.getState().initDarkMode();
    useLanguageStore.getState().initLanguage();
    initialized.current = true;
  }

  return <>{children}</>;
}
