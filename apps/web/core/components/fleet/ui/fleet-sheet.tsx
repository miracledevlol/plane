/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
// plane imports
import { cn } from "@plane/utils";
// local imports
import { FleetButton } from "./fleet-button";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Slide in from the right as a side panel, or rise from the bottom centre as a dialog. */
  side?: "right" | "bottom";
  /** Width of the panel when `side` is right, or its max width when bottom. */
  size?: "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * A portaled panel over a blurred backdrop. Escape and the backdrop close it,
 * and focus starts inside so keyboard users land in the content.
 */
export function FleetSheet(props: Props) {
  const { open, onClose, title, description, side = "right", size = "md", footer, children, className } = props;
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // escape closes, and the page behind stops scrolling while the sheet is up
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const autofocus = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      (autofocus ?? panelRef.current)?.focus();
    });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const slideHidden = side === "right" ? { opacity: 0, x: 32 } : { opacity: 0, y: 24, scale: 0.98 };
  const hidden = reducedMotion ? { opacity: 0 } : slideHidden;
  const visible = side === "right" ? { opacity: 1, x: 0 } : { opacity: 1, y: 0, scale: 1 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={cn(
            "fixed inset-0 z-[70] flex",
            side === "right" ? "items-stretch justify-end" : "items-end justify-center sm:items-center"
          )}
        >
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={hidden}
            animate={visible}
            exit={hidden}
            transition={reducedMotion ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 38, mass: 0.8 }}
            className={cn(
              "relative flex max-h-full flex-col bg-surface-1 outline-none",
              side === "right"
                ? cn(
                    "h-full w-full border-l border-subtle shadow-[-24px_0_64px_-32px_rgba(0,0,0,0.6)]",
                    size === "lg" ? "sm:w-[640px]" : "sm:w-[480px]"
                  )
                : cn(
                    "w-full rounded-t-3xl border border-subtle shadow-[0_32px_80px_-32px_rgba(0,0,0,0.6)] sm:rounded-3xl",
                    size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"
                  ),
              className
            )}
          >
            <div className="flex items-start gap-3 px-6 pt-5 pb-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 id={titleId} className="text-16 font-semibold tracking-tight text-primary">
                  {title}
                </h2>
                {description && <p className="text-12 text-secondary">{description}</p>}
              </div>
              <FleetButton variant="ghost" size="xs" iconOnly aria-label="Close" onClick={onClose} icon={<X />} />
            </div>
            <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-subtle px-6 py-4">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
