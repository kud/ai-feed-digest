import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { t, getLanguage } from "@/lib/i18n";

const THEME_STORAGE_KEY = "daily-brief-theme";
const FONT_STORAGE_KEY = "daily-brief-font";
const SIZE_STORAGE_KEY = "daily-brief-size";
const WIDTH_STORAGE_KEY = "daily-brief-width";

const preferencesInitScript = `
(function() {
  // Theme still applies globally on <html>
  try {
    var key = "${THEME_STORAGE_KEY}";
    var stored = window.localStorage.getItem(key);
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored === "dark" || stored === "light" ? stored : (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (err) {
    document.documentElement.dataset.theme = "light";
  }

  function applyScopedPreferences() {
    var main = document.getElementById("main");
    if (!main) return false;
    try {
      var fontKey = "${FONT_STORAGE_KEY}";
      var savedFont = window.localStorage.getItem(fontKey);
      var allowedFonts = ["modern", "journal", "serif", "mono"];
      var defaultFont = "modern";
      var font = allowedFonts.indexOf(savedFont) !== -1 ? savedFont : defaultFont;
      main.dataset.font = font;
    } catch (err) {
      main.dataset.font = "modern";
    }
    try {
      var sizeKey = "${SIZE_STORAGE_KEY}";
      var savedSize = window.localStorage.getItem(sizeKey);
      var allowedSizes = ["sm", "md", "lg"];
      var defaultSize = "md";
      var size = allowedSizes.indexOf(savedSize) !== -1 ? savedSize : defaultSize;
      main.dataset.size = size;
    } catch (err) {
      main.dataset.size = "md";
    }
    try {
      var widthKey = "${WIDTH_STORAGE_KEY}";
      var savedWidth = window.localStorage.getItem(widthKey);
      var allowedWidths = ["narrow", "normal", "wide"];
      var defaultWidth = "normal";
      var width = allowedWidths.indexOf(savedWidth) !== -1 ? savedWidth : defaultWidth;
      main.dataset.width = width;
    } catch (err) {
      main.dataset.width = "normal";
    }
    return true;
  }

  if (!applyScopedPreferences()) {
    document.addEventListener("DOMContentLoaded", applyScopedPreferences, { once: true });
  }
})();`;

export const metadata: Metadata = {
  title: "Revue Quotidienne",
  description: "Une revue quotidienne d'actualités générée à partir d'éditions Markdown."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const lang = getLanguage();
  const langCode = lang === "fr" ? "fr" : "en";

  return (
    <html lang={langCode} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencesInitScript }} />
        <link rel="icon" href="/icon.svg" sizes="any" type="image/svg+xml" />
      </head>
      <body className="bg-surface text-foreground">
        <a href="#main" className="skip-link">
          {t("skipToContent")}
        </a>
        <div className="page-shell">
          <SiteHeader title={t("siteTitle")} subtitle={t("siteSubtitle")} fontStorageKey={FONT_STORAGE_KEY} sizeStorageKey={SIZE_STORAGE_KEY} widthStorageKey={WIDTH_STORAGE_KEY} />
          <main id="main" className="site-main" role="main" data-font="modern" data-size="md" data-width="normal">
            {children}
          </main>
          <footer className="site-footer" role="contentinfo">
            <div className="site-footer__minimal">
              <p className="site-footer__line">
                <strong className="site-footer__brand-min" aria-label={t("siteTitle")}>{t("siteTitle")}</strong>
                <span aria-hidden="true" className="site-footer__divider">·</span>
                <span className="site-footer__tagline-min">{t("siteSubtitle")}</span>
                <span className="site-footer__meta-sep" aria-hidden="true">—</span>
                <span className="site-footer__meta-text">{t("footerText")}</span>
                <span className="site-footer__meta-link"><a href="/archive">{t("viewArchive")}</a></span>
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
