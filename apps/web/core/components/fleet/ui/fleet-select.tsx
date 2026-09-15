/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
// plane imports
import { cn } from "@plane/utils";

export type TFleetSelectOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** Plain text used by the search box; defaults to `label` when it is a string. */
  searchText?: string;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

type BaseProps<T extends string | number> = {
  options: TFleetSelectOption<T>[];
  /** Overrides the trigger's text. */
  label?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  /** Show a search box above the options. */
  searchable?: boolean;
  /** Which edge of the trigger the panel lines up with. */
  align?: "start" | "end";
  /** Minimum panel width in pixels; the trigger's width otherwise. */
  panelWidth?: number;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  noResultsMessage?: string;
  "aria-label"?: string;
};

type SingleProps<T extends string | number> = BaseProps<T> & {
  multiple?: false;
  value: T | null | undefined;
  onChange: (value: T) => void;
};

type MultipleProps<T extends string | number> = BaseProps<T> & {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
  /** Deselecting below this count is ignored and `onBlockedDeselect` fires instead. */
  minSelected?: number;
  onBlockedDeselect?: () => void;
};

export type TFleetSelectProps<T extends string | number> = SingleProps<T> | MultipleProps<T>;

const PANEL_GAP = 6;
const VIEWPORT_PADDING = 12;
const PANEL_MAX_HEIGHT = 320;

type PanelPosition = { top: number; left: number; minWidth: number; maxHeight: number; side: "top" | "bottom" };

const optionText = <T extends string | number>(option: TFleetSelectOption<T>): string =>
  option.searchText ?? (typeof option.label === "string" ? option.label : String(option.value));

/**
 * A select that owns its whole interaction: a spring-animated panel portaled to
 * `document.body`, positioned from the trigger's rectangle, with pointer and
 * keyboard selection handled by plain buttons. No third-party listbox state.
 */
export function FleetSelect<T extends string | number>(props: TFleetSelectProps<T>) {
  const {
    options,
    label,
    placeholder = "Select",
    disabled = false,
    searchable = false,
    align = "start",
    panelWidth,
    className,
    buttonClassName,
    panelClassName,
    icon,
    footer,
    noResultsMessage = "No matches",
  } = props;
  const reducedMotion = useReducedMotion();
  const listboxId = useId();
  // refs
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const selectedValues = useMemo<T[]>(() => {
    if (props.multiple) return props.value;
    return props.value === null || props.value === undefined ? [] : [props.value];
  }, [props.multiple, props.value]);

  const isSelected = useCallback((value: T) => selectedValues.includes(value), [selectedValues]);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => optionText(option).toLowerCase().includes(needle));
  }, [options, query]);

  const triggerLabel = useMemo<ReactNode>(() => {
    if (label !== undefined) return label;
    const selected = options.filter((option) => isSelected(option.value));
    if (!selected.length) return <span className="text-placeholder">{placeholder}</span>;
    if (selected.length === 1) return selected[0].label;
    return `${selected.length} selected`;
  }, [label, options, isSelected, placeholder]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const wanted = Math.min(PANEL_MAX_HEIGHT, panelRef.current?.scrollHeight ?? PANEL_MAX_HEIGHT);
    const side: "top" | "bottom" = spaceBelow >= Math.min(wanted, 160) || spaceBelow >= spaceAbove ? "bottom" : "top";
    const maxHeight = Math.max(120, Math.min(PANEL_MAX_HEIGHT, side === "bottom" ? spaceBelow : spaceAbove));
    const minWidth = Math.max(panelWidth ?? 0, rect.width, 176);
    const preferredLeft = align === "end" ? rect.right - minWidth : rect.left;
    const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - minWidth - VIEWPORT_PADDING);
    const left = Math.min(Math.max(VIEWPORT_PADDING, preferredLeft), maxLeft);
    const top = side === "bottom" ? rect.bottom + PANEL_GAP : rect.top - PANEL_GAP;
    setPosition({ top, left, minWidth, maxHeight, side });
  }, [align, panelWidth]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    const firstSelected = options.findIndex((option) => isSelected(option.value) && !option.disabled);
    setActiveIndex(
      firstSelected >= 0
        ? firstSelected
        : Math.max(
            0,
            options.findIndex((option) => !option.disabled)
          )
    );
    setIsOpen(true);
  }, [disabled, options, isSelected]);

  const select = useCallback(
    (value: T) => {
      if (props.multiple) {
        const current = props.value;
        if (current.includes(value)) {
          if (current.length <= (props.minSelected ?? 0)) {
            props.onBlockedDeselect?.();
            return;
          }
          props.onChange(current.filter((entry) => entry !== value));
        } else {
          props.onChange([...current, value]);
        }
        return;
      }
      props.onChange(value);
      close();
      triggerRef.current?.focus();
    },
    [props, close]
  );

  // position before paint, then follow scroll and resize while open
  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [isOpen, updatePosition]);

  // a press anywhere outside the trigger and the panel closes it
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen, close]);

  // focus lands in the search box or on the panel so keys work right away
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus();
      else panelRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, searchable]);

  // keep the active row visible and clamped to the filtered list
  useEffect(() => {
    if (!isOpen) return;
    if (activeIndex >= filteredOptions.length) setActiveIndex(Math.max(0, filteredOptions.length - 1));
    optionRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filteredOptions.length, isOpen]);

  const moveActive = (delta: number) => {
    if (!filteredOptions.length) return;
    let next = activeIndex;
    for (let step = 0; step < filteredOptions.length; step += 1) {
      next = (next + delta + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[next]?.disabled) break;
    }
    setActiveIndex(next);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) close();
      else open();
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      close();
    }
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(filteredOptions.length - 1);
        break;
      case "Enter": {
        event.preventDefault();
        const option = filteredOptions[activeIndex];
        if (option && !option.disabled) select(option.value);
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  };

  const panelStyle: CSSProperties = position
    ? {
        position: "fixed",
        top: position.side === "bottom" ? position.top : undefined,
        bottom: position.side === "top" ? window.innerHeight - position.top : undefined,
        left: position.left,
        minWidth: position.minWidth,
        maxHeight: position.maxHeight,
        transformOrigin: position.side === "bottom" ? "top left" : "bottom left",
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  const slide = position?.side === "top" ? 6 : -6;
  const hidden = reducedMotion ? { opacity: 0 } : { opacity: 0, y: slide, scale: 0.97 };
  const visible = reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={props["aria-label"]}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "inline-flex h-8 max-w-full items-center gap-2 rounded-xl border border-subtle bg-layer-1 px-3 text-12 text-primary transition-colors outline-none",
          "focus-visible:ring-accent-primary/60 hover:border-strong focus-visible:ring-2",
          isOpen && "border-accent-strong",
          disabled && "cursor-not-allowed opacity-50",
          buttonClassName
        )}
      >
        {icon && (
          <span className="flex flex-shrink-0 items-center text-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        )}
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="ml-auto flex flex-shrink-0 items-center text-tertiary"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={panelRef}
                role="listbox"
                id={listboxId}
                aria-multiselectable={props.multiple ? true : undefined}
                tabIndex={-1}
                style={panelStyle}
                initial={hidden}
                animate={visible}
                exit={hidden}
                transition={
                  reducedMotion ? { duration: 0.1 } : { type: "spring", stiffness: 700, damping: 38, mass: 0.6 }
                }
                onKeyDown={handlePanelKeyDown}
                data-prevent-outside-click
                className={cn(
                  "z-[60] flex flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-1 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.45)] outline-none",
                  panelClassName
                )}
              >
                {searchable && (
                  <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
                    <Search aria-hidden="true" className="h-3.5 w-3.5 text-tertiary" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                      }}
                      placeholder="Search"
                      aria-label="Filter options"
                      className="w-full bg-transparent text-12 text-primary outline-none placeholder:text-placeholder"
                    />
                  </div>
                )}
                <div className="vertical-scrollbar scrollbar-xs flex-1 overflow-y-auto p-1.5">
                  {filteredOptions.length === 0 ? (
                    <p className="px-2 py-2 text-12 text-placeholder">{noResultsMessage}</p>
                  ) : (
                    filteredOptions.map((option, index) => {
                      const selected = isSelected(option.value);
                      const active = index === activeIndex;
                      return (
                        <button
                          key={String(option.value)}
                          ref={(element) => {
                            if (element) optionRefs.current.set(index, element);
                            else optionRefs.current.delete(index);
                          }}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          disabled={option.disabled}
                          onPointerMove={() => {
                            if (!active) setActiveIndex(index);
                          }}
                          onClick={() => select(option.value)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-12 text-primary transition-colors outline-none",
                            active && "bg-layer-transparent-hover",
                            option.disabled && "cursor-not-allowed opacity-50"
                          )}
                        >
                          {option.icon && (
                            <span className="flex flex-shrink-0 items-center text-tertiary [&>svg]:h-4 [&>svg]:w-4">
                              {option.icon}
                            </span>
                          )}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{option.label}</span>
                            {option.description && (
                              <span className="truncate text-11 text-tertiary">{option.description}</span>
                            )}
                          </span>
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                            <AnimatePresence initial={false}>
                              {selected && (
                                <motion.span
                                  initial={reducedMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                                  animate={reducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                                  exit={reducedMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                                  transition={{ type: "spring", stiffness: 700, damping: 30 }}
                                  className="text-accent-primary"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {footer && <div className="border-t border-subtle px-3 py-2 text-11 text-tertiary">{footer}</div>}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
