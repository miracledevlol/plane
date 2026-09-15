/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import type { HTMLMotionProps, Variants } from "motion/react";
// plane imports
import { cn } from "@plane/utils";

const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const;

export type TFleetTone = "neutral" | "accent" | "success" | "danger" | "warning" | "info";

/* ------------------------------------------------------------------ reveal */

type RevealProps = HTMLMotionProps<"div"> & {
  /** Seconds to wait before the element fades in. */
  delay?: number;
  /** Pixels the element rises from. */
  distance?: number;
  children?: ReactNode;
};

/** Fades and lifts a block into view on mount. */
export function FleetReveal(props: RevealProps) {
  const { delay = 0, distance = 10, children, ...rest } = props;
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: distance }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- stagger */

const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING },
};

const staggerChildReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
};

type StaggerProps = HTMLMotionProps<"div"> & { children?: ReactNode };

/** A container whose `FleetStaggerItem` children enter one after the other. */
export function FleetStagger(props: StaggerProps) {
  const { children, ...rest } = props;
  return (
    <motion.div variants={staggerParent} initial="hidden" animate="visible" {...rest}>
      {children}
    </motion.div>
  );
}

export function FleetStaggerItem(props: StaggerProps) {
  const { children, ...rest } = props;
  const reducedMotion = useReducedMotion();
  return (
    <motion.div variants={reducedMotion ? staggerChildReduced : staggerChild} {...rest}>
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- counter */

type CounterProps = {
  value: number | null | undefined;
  /** Rendered when the value is not a number. */
  fallback?: ReactNode;
  format?: (value: number) => string;
  className?: string;
};

const defaultFormat = (value: number) => new Intl.NumberFormat().format(Math.round(value));

/** A number that counts from its previous value to the new one. */
export function FleetCounter(props: CounterProps) {
  const { value, fallback = "–", format = defaultFormat, className } = props;
  const reducedMotion = useReducedMotion();
  const previous = useRef<number>(typeof value === "number" ? value : 0);
  const [shown, setShown] = useState<number>(typeof value === "number" ? value : 0);

  useEffect(() => {
    if (typeof value !== "number" || Number.isNaN(value)) return;
    const from = previous.current;
    previous.current = value;
    if (reducedMotion || from === value) {
      setShown(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setShown(latest),
    });
    return () => controls.stop();
  }, [value, reducedMotion]);

  if (typeof value !== "number" || Number.isNaN(value)) return <span className={className}>{fallback}</span>;
  return (
    <span className={cn("tabular-nums", className)} aria-label={format(value)}>
      {format(shown)}
    </span>
  );
}

/* ------------------------------------------------------------------- pulse */

const PULSE_CLASS: Record<TFleetTone, string> = {
  neutral: "bg-layer-3",
  accent: "bg-accent-primary",
  success: "bg-success-primary",
  danger: "bg-danger-primary",
  warning: "bg-warning-primary",
  info: "bg-info-primary",
};

type PulseProps = {
  tone?: TFleetTone;
  /** Animate a ring outwards; off for settled states. */
  live?: boolean;
  className?: string;
  label?: string;
};

/** A status dot with an optional breathing ring. */
export function FleetPulse(props: PulseProps) {
  const { tone = "neutral", live = false, className, label } = props;
  const reducedMotion = useReducedMotion();
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("relative inline-flex h-2 w-2 flex-shrink-0 items-center justify-center", className)}
    >
      {live && !reducedMotion && (
        <motion.span
          aria-hidden="true"
          className={cn("absolute inline-flex h-full w-full rounded-full", PULSE_CLASS[tone])}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity, repeatDelay: 0.4 }}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", PULSE_CLASS[tone])} />
    </span>
  );
}

/* -------------------------------------------------------------------- chip */

const CHIP_CLASS: Record<TFleetTone, string> = {
  neutral: "bg-layer-2 text-secondary border-subtle",
  accent: "bg-accent-subtle text-accent-primary border-accent-subtle",
  success: "bg-success-subtle text-success-primary border-success-subtle",
  danger: "bg-danger-subtle text-danger-primary border-danger-subtle",
  warning: "bg-warning-subtle text-warning-primary border-warning-subtle",
  info: "bg-info-subtle text-info-primary border-info-subtle",
};

type ChipProps = {
  tone?: TFleetTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A small rounded label. */
export function FleetChip(props: ChipProps) {
  const { tone = "neutral", icon, children, className } = props;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-11 font-medium whitespace-nowrap",
        CHIP_CLASS[tone],
        className
      )}
    >
      {icon && <span className="flex items-center [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- segmented */

export type TFleetSegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  options: TFleetSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
};

/** A pill tab bar whose highlight glides between options. */
export function FleetSegmented<T extends string>(props: SegmentedProps<T>) {
  const { options, value, onChange, size = "sm", className } = props;
  const reducedMotion = useReducedMotion();
  const groupId = useId();
  return (
    <div
      role="tablist"
      aria-label={props["aria-label"]}
      className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-layer-2 p-1", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors outline-none",
              "focus-visible:ring-accent-primary/60 focus-visible:ring-2",
              size === "sm" ? "h-7 px-2.5 text-12" : "h-8 px-3 text-13",
              selected ? "text-primary" : "text-secondary hover:text-primary",
              option.disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {selected && (
              <motion.span
                layoutId={groupId}
                aria-hidden="true"
                transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                className="absolute inset-0 rounded-lg border border-subtle bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
              />
            )}
            {option.icon && (
              <span className="relative flex items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{option.icon}</span>
            )}
            <span className="relative">{option.label}</span>
            {typeof option.count === "number" && (
              <span
                className={cn(
                  "relative rounded-md px-1.5 py-px text-10 tabular-nums",
                  selected ? "bg-accent-subtle text-accent-primary" : "bg-layer-3 text-tertiary"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- card */

type CardProps = HTMLMotionProps<"div"> & {
  /** Lift and brighten on hover; for cards that open something. */
  interactive?: boolean;
  tone?: TFleetTone;
  children?: ReactNode;
};

const CARD_TONE_CLASS: Record<TFleetTone, string> = {
  neutral: "",
  accent: "border-accent-subtle",
  success: "border-success-subtle",
  danger: "border-danger-subtle",
  warning: "border-warning-subtle",
  info: "border-info-subtle",
};

/** The fleet's surface: rounded, layered, with a soft hover lift when interactive. */
export function FleetCard(props: CardProps) {
  const { interactive = false, tone = "neutral", className, children, ...rest } = props;
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      whileHover={interactive && !reducedMotion ? { y: -2 } : undefined}
      whileTap={interactive && !reducedMotion ? { scale: 0.995 } : undefined}
      transition={SPRING}
      className={cn(
        "relative rounded-2xl border border-subtle bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
        interactive && "cursor-pointer hover:border-strong hover:shadow-[0_12px_32px_-18px_rgba(0,0,0,0.45)]",
        CARD_TONE_CLASS[tone],
        className
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
