/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
// plane imports
import { cn } from "@plane/utils";

export type TFleetInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** A prefix rendered inside the field, before the text. */
  prefix?: ReactNode;
  /** Something rendered inside the field, after the text. */
  suffix?: ReactNode;
  invalid?: boolean;
  wrapperClassName?: string;
};

/** A rounded text field with an accent glow on focus. */
export const FleetInput = forwardRef<HTMLInputElement, TFleetInputProps>(function FleetInput(props, ref) {
  const { prefix, suffix, invalid = false, className, wrapperClassName, disabled, ...rest } = props;
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2 rounded-xl border bg-layer-1 px-3 transition-[box-shadow,border-color] duration-150",
        "focus-within:border-accent-strong focus-within:shadow-[0_0_0_3px_var(--color-accent-subtle,rgba(59,130,246,0.15))]",
        invalid ? "border-danger-strong" : "border-subtle",
        disabled && "opacity-60",
        wrapperClassName
      )}
    >
      {prefix && <span className="flex flex-shrink-0 items-center text-12 text-tertiary">{prefix}</span>}
      <input
        ref={ref}
        disabled={disabled}
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder",
          className
        )}
        {...rest}
      />
      {suffix && <span className="flex flex-shrink-0 items-center text-12 text-tertiary">{suffix}</span>}
    </div>
  );
});

type FieldProps = {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
};

/** Label, control, hint and an animated error line. */
export function FleetField(props: FieldProps) {
  const { label, htmlFor, hint, error, children, className } = props;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-12 font-medium text-secondary">
        {label}
      </label>
      {children}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.span
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-11 text-danger-primary"
          >
            {error}
          </motion.span>
        ) : hint ? (
          <motion.span
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-11 text-tertiary"
          >
            {hint}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
