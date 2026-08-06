/** @type {import('tailwindcss').Config} */
const breakpoints = {
  xs: "375px",
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
};

module.exports = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: breakpoints,
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        "bg-page": "rgb(var(--bg-page) / <alpha-value>)",
        "bg-card": "rgb(var(--bg-card) / <alpha-value>)",
        "bg-input": "rgb(var(--bg-input) / <alpha-value>)",
        "bg-input-focus": "rgb(var(--bg-input-focus) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        card: "rgb(var(--bg-card) / <alpha-value>)",
        background: "rgb(var(--bg-page) / <alpha-value>)",
        foreground: "rgb(var(--text-main) / <alpha-value>)",
        "text-main": "rgb(var(--text-main) / <alpha-value>)",
        "text-label": "rgb(var(--text-label) / <alpha-value>)",
        "text-sec": "rgb(var(--text-sec) / <alpha-value>)",
        "text-placeholder": "rgb(var(--text-placeholder) / <alpha-value>)",
        input: "rgb(var(--input) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-subtle": "rgb(var(--border-subtle) / <alpha-value>)",
        "border-control": "rgb(var(--border-control) / <alpha-value>)",
        "border-focus": "rgb(var(--border-focus) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--primary-hover) / <alpha-value>)",
        "primary-magenta": "rgb(var(--primary-magenta) / <alpha-value>)",
        "primary-glow": "rgb(var(--primary-glow) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        // Accent-TEXT — split from --primary fill (FIX-DARK-ACCENT-TEXT-SPLIT).
        // Burgundy in light, gold in dark. Use `text-accent-text` for accent
        // TEXT/icons on themed surfaces; keep `text-primary` only on fixed-light fills.
        "accent-text": "rgb(var(--accent-text) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        "surface-hover": "rgb(var(--surface-hover) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        "brand-from": "rgb(var(--brand-from) / <alpha-value>)",
        "brand-via": "rgb(var(--brand-via) / <alpha-value>)",
        "brand-deep": "rgb(var(--brand-deep) / <alpha-value>)",
        "brand-pane": "rgb(var(--brand-pane) / <alpha-value>)",
        "brand-accent": "rgb(var(--brand-accent) / <alpha-value>)",
        // HARDENING-MISC-01 — мост для СОСТОЯНИЙ. CSS-переменные для них давно
        // объявлены в globals.css (и в светлой, и в тёмной теме), а вот моста в
        // tailwind не было — поэтому `bg-success` / `text-destructive` и т.п.
        // компилировались В НИЧТО: класс в разметке есть, стиля нет, ошибки нет.
        // Именно так «пропала» точка статуса на /login (LOGIN-WOW-01).
        // Значения — из globals.css, здесь только проброс.
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        // UI-06 — тот же класс отказа, что выше, но для `-foreground`-пар.
        // `primary` и `muted` объявлены СТРОКАМИ, а не объектами, поэтому
        // производные `*-foreground` из них не генерируются (объектом объявлен
        // только `destructive` — он и работал). Итог: `text-muted-foreground`
        // (33 сайта, включая `<Badge variant="muted">`) и
        // `text-primary-foreground` (активный чип фильтра уведомлений)
        // компилировались в ничто и наследовали цвет контекста.
        // Мосты плоские, а не объектные: `primary-hover`/`primary-magenta`/
        // `primary-glow` — уже отдельные ключи, и превращать один `primary` в
        // объект посреди них значило бы завести две схемы в одном списке.
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        "primary-foreground": "rgb(var(--primary-foreground) / <alpha-value>)",
        "accent-foreground": "rgb(var(--accent-foreground) / <alpha-value>)",
        // 🔴 Мостов `rose` и `sky` здесь НЕТ И БЫТЬ НЕ ДОЛЖНО. В разметке
        // `rose-*`/`sky-*` — это встроенные палитры Tailwind (236 сайтов:
        // статус-бейджи, чипы). Ключ `rose: "rgb(var(--rose))"` в `extend`
        // ЗАМЕНИЛ бы всю шкалу, и `bg-rose-500` перестал бы существовать —
        // «фикс» сломал бы ровно то, что выглядит починенным. Одноимённые
        // CSS-переменные-призраки удалены из `globals.css` (потребителей
        // не было). Сторож — `tailwind-bridge.test.ts`.
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, rgb(var(--brand-from)) 0%, rgb(var(--brand-via)) 55%, rgb(var(--brand-deep)) 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, rgb(var(--brand-from) / 0.06) 0%, rgb(var(--brand-via) / 0.06) 55%, rgb(var(--brand-deep) / 0.04) 100%)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "var(--shadow)",
        sm: "var(--shadow-sm)",
        lg: "var(--shadow-lg)",
        card: "var(--shadow-card)",
        hover: "var(--shadow-hover)",
        glow: "0 0 0 1px rgb(var(--primary-glow) / 0.26), 0 14px 28px rgb(var(--primary-glow) / 0.22)",
        // HARDENING-MISC-01: `--shadow-brand` объявлена в обеих темах
        // (светлая — бордовая тень, тёмная — бордовое свечение), но моста не
        // было: 7 сайтов с `shadow-brand` рендерили тень в никуда.
        brand: "var(--shadow-brand)",
      },
    },
  },
  plugins: [],
};
