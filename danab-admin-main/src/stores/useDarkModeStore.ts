import { create } from 'zustand';

interface DarkModeState {
  dark: boolean;
  setDark: (value: boolean) => void;
  toggleDark: () => void;
  initDarkMode: () => void;
}

export const useDarkModeStore = create<DarkModeState>((set, get) => ({
  dark: false,

  setDark: (value) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', value ? 'dark' : 'light');
      if (value) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    set({ dark: value });
  },

  toggleDark: () => {
    const newValue = !get().dark;
    get().setDark(newValue);
  },

  initDarkMode: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored ? stored === 'dark' : prefersDark;

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ dark: isDark });
  },
}));
