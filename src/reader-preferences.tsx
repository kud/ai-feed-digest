"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type FontChoice = "modern" | "journal" | "serif" | "mono";
type SizeChoice = "sm" | "md" | "lg";
type WidthChoice = "narrow" | "normal" | "wide";

interface ReaderPreferencesProps {
  fontStorageKey: string;
  sizeStorageKey: string;
  widthStorageKey: string;
}

interface PreferenceOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

const FONT_OPTIONS: PreferenceOption<FontChoice>[] = [
  { value: "modern", label: "Moderne", description: "Sans-serif équilibrée, nette à l’écran" },
  { value: "journal", label: "Journal", description: "Serif élégante inspirée de la presse écrite" },
  { value: "serif", label: "Classique", description: "Serif confortable pour les lectures longues" },
  { value: "mono", label: "Mono", description: "Monospace éditoriale façon dépêche" }
];

const SIZE_OPTIONS: PreferenceOption<SizeChoice>[] = [
  { value: "sm", label: "Compacte", description: "Paragraphe dense, idéal sur écrans larges" },
  { value: "md", label: "Standard", description: "Équilibre entre volume et confort" },
  { value: "lg", label: "Étendue", description: "Corps généreux pour une lecture relaxe" }
];

const DEFAULT_FONT: FontChoice = "modern";
const DEFAULT_SIZE: SizeChoice = "md";
const DEFAULT_WIDTH: WidthChoice = "normal";

const WIDTH_OPTIONS: PreferenceOption<WidthChoice>[] = [
  { value: "narrow", label: "Étroit", description: "Colonne serrée – lecture focalisée" },
  { value: "normal", label: "Normal", description: "Largeur équilibrée du site" },
  { value: "wide", label: "Large", description: "Grilles et contenu plus aérés" }
];

export function ReaderPreferences({ fontStorageKey, sizeStorageKey, widthStorageKey }: ReaderPreferencesProps) {
  const [font, setFont] = useState<FontChoice>(DEFAULT_FONT);
  const [size, setSize] = useState<SizeChoice>(DEFAULT_SIZE);
  const [width, setWidth] = useState<WidthChoice>(DEFAULT_WIDTH);

  useEffect(() => {
    const storedFont = (typeof window !== "undefined"
      ? (window.localStorage.getItem(fontStorageKey) as FontChoice | null)
      : null) ?? DEFAULT_FONT;
    const storedSize = (typeof window !== "undefined"
      ? (window.localStorage.getItem(sizeStorageKey) as SizeChoice | null)
      : null) ?? DEFAULT_SIZE;
    const storedWidth = (typeof window !== "undefined"
      ? (window.localStorage.getItem(widthStorageKey) as WidthChoice | null)
      : null) ?? DEFAULT_WIDTH;

    const initialFont = isFont(storedFont) ? storedFont : DEFAULT_FONT;
    const initialSize = isSize(storedSize) ? storedSize : DEFAULT_SIZE;
    const initialWidth = isWidth(storedWidth) ? storedWidth : DEFAULT_WIDTH;

    setFont(initialFont);
    setSize(initialSize);
    setWidth(initialWidth);
  }, [fontStorageKey, sizeStorageKey, widthStorageKey]);

  // Sync dataset + animate on changes (ensures reliability even if handler missed)
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.font = font;
    root.classList.add("font-transition");
    const id = window.setTimeout(() => root.classList.remove("font-transition"), 200);
    return () => window.clearTimeout(id);
  }, [font]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.size = size;
    root.classList.add("font-transition");
    const id = window.setTimeout(() => root.classList.remove("font-transition"), 200);
    return () => window.clearTimeout(id);
  }, [size]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.width = width;
    root.classList.add("font-transition");
    const id = window.setTimeout(() => root.classList.remove("font-transition"), 200);
    return () => window.clearTimeout(id);
  }, [width]);

  function handleFontChange(choice: FontChoice) {
    setFont(choice);
    try {
      window.localStorage.setItem(fontStorageKey, choice);
    } catch {
      // ignore persistence issues
    }
  }

  function handleSizeChange(choice: SizeChoice) {
    setSize(choice);
    try {
      window.localStorage.setItem(sizeStorageKey, choice);
    } catch {
      // ignore persistence issues
    }
  }

  function handleWidthChange(choice: WidthChoice) {
    setWidth(choice);
    try {
      window.localStorage.setItem(widthStorageKey, choice);
    } catch {
      // ignore persistence issues
    }
  }

  return (
    <div className="reader-preferences" role="group" aria-label="Préférences de lecture">
      <PreferenceSelect
        label="Police"
        value={font}
        options={FONT_OPTIONS}
        onChange={(value) => handleFontChange(value as FontChoice)}
      />
      <PreferenceSelect
        label="Taille"
        value={size}
        options={SIZE_OPTIONS}
        onChange={(value) => handleSizeChange(value as SizeChoice)}
      />
      <PreferenceSelect
        label="Largeur"
        value={width}
        options={WIDTH_OPTIONS}
        onChange={(value) => handleWidthChange(value as WidthChoice)}
      />
    </div>
  );
}

interface PreferenceSelectProps<T extends string> {
  label: string;
  value: T;
  options: PreferenceOption<T>[];
  onChange: (value: T) => void;
}

function PreferenceSelect<T extends string>({ label, value, options, onChange }: PreferenceSelectProps<T>) {
  const activeOption = options.find((option) => option.value === value) ?? options[0];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const [menuStyles, setMenuStyles] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    function syncPosition() {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setMenuStyles({
          top: rect.bottom + 8,
          left: rect.left,
          width: rect.width
        });
      }
    }
    syncPosition();
    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (triggerRef.current && !triggerRef.current.contains(event.target) && 
          menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function handleScroll() {
      syncPosition();
    }
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  // Manage global body class for any open dropdown
  useEffect(() => {
    if (open) {
      document.body.classList.add("dropdown-open");
    } else {
      document.body.classList.remove("dropdown-open");
    }
    return () => {
      document.body.classList.remove("dropdown-open");
    };
  }, [open]);

  function toggleOpen() {
    setOpen(state => !state);
  }

  function choose(option: PreferenceOption<T>) {
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className="preference-select" id={getSelectId(label)}>
      <button
        type="button"
        className="preference-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        ref={triggerRef}
        onClick={toggleOpen}
      >
        <span className="preference-select__label">{label}</span>
        <span className="preference-select__value">
          <span className="preference-select__value-title">{activeOption.label}</span>
          <span className="preference-select__value-sub">{activeOption.description}</span>
        </span>
        <span className="preference-select__chevron" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open &&
        createPortal(
          <ul
            ref={menuRef}
            className="preference-select__list"
            role="listbox"
            style={{
              top: `${menuStyles.top}px`,
              left: `${menuStyles.left}px`,
              width: `${menuStyles.width}px`
            }}
          >
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className="preference-select__option"
                  onClick={() => choose(option)}
                >
                  <span className="preference-select__option-title">{option.label}</span>
                  <span className="preference-select__option-sub">{option.description}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}

function getSelectId(label: string): string {
  return `reader-pref-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}


function isFont(value: unknown): value is FontChoice {
  return value === "modern" || value === "journal" || value === "serif" || value === "mono";
}

function isSize(value: unknown): value is SizeChoice {
  return value === "sm" || value === "md" || value === "lg";
}

function isWidth(value: unknown): value is WidthChoice {
  return value === "narrow" || value === "normal" || value === "wide";
}
