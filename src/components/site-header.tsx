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

  return (
    <header className={"site-header" + (scrolled ? " is-scrolled" : " is-top")} role="banner">
      <div className="site-header__row">
        <div className="site-header__brand">
          <Link href="/" className="site-title">
            {title}
          </Link>
          <span className="site-header__tagline">{subtitle}</span>
        </div>
        <div className="site-header__controls">
          <ReaderPreferences fontStorageKey={fontStorageKey} sizeStorageKey={sizeStorageKey} widthStorageKey={widthStorageKey} />
          <ThemeToggle storageKey="daily-brief-theme" />
        </div>
      </div>
    </header>
  );
}
