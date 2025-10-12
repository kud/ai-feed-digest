"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/theme-toggle";
import { ReaderPreferences } from "@/reader-preferences";

interface SiteHeaderProps {
  title: string;
  subtitle: string;
  fontStorageKey: string;
  sizeStorageKey: string;
  widthStorageKey: string;
}
 
export function SiteHeader({ title, subtitle, fontStorageKey, sizeStorageKey, widthStorageKey }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      const atTop = window.scrollY < 16;
      setScrolled(!atTop);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on escape or resize up
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    function onResize() {
      if (window.innerWidth > 768) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("mobile-menu-open");
    } else {
      document.body.classList.remove("mobile-menu-open");
    }
  }, [menuOpen]);

  return (
    <header className={"site-header" + (scrolled ? " is-scrolled" : " is-top")} role="banner">
      <div className="site-header__row">
        <div className="site-header__brand">
          <Link href="/" className="site-title" onClick={() => setMenuOpen(false)}>
            {title}
          </Link>
          <span className="site-header__tagline">{subtitle}</span>
        </div>
        <div className="site-header__controls">
          <ReaderPreferences fontStorageKey={fontStorageKey} sizeStorageKey={sizeStorageKey} widthStorageKey={widthStorageKey} />
          <ThemeToggle storageKey="daily-brief-theme" />
        </div>
        <button
          type="button"
          className="site-header__mobile-toggle"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu-panel"
          onClick={() => setMenuOpen(o => !o)}
        >
          <span className="site-header__mobile-toggle-bar" aria-hidden="true" />
          <span className="site-header__mobile-toggle-bar" aria-hidden="true" />
          <span className="site-header__mobile-toggle-bar" aria-hidden="true" />
        </button>
      </div>
      <div
        id="mobile-menu-panel"
        className={"mobile-menu" + (menuOpen ? " is-open" : "")}
        hidden={!menuOpen}
      >
        <div className="mobile-menu__inner">
          <div className="mobile-menu__group">
            <ReaderPreferences fontStorageKey={fontStorageKey} sizeStorageKey={sizeStorageKey} widthStorageKey={widthStorageKey} />
          </div>
          <div className="mobile-menu__group">
            <ThemeToggle storageKey="daily-brief-theme" />
          </div>
        </div>
      </div>
    </header>
  );
}
