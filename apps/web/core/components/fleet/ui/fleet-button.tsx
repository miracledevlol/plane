/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
// plane imports
import { cn } from "@plane/utils";

export type TFleetButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type TFleetButtonSize = "xs" | "sm" | "md";

export type TFleetButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: TFleetButtonVariant;
  size?: TFleetButtonSize;
  loading?: boolean;
  /** Icon placed before the label. */
  icon?: ReactNode;
  /** Icon placed after the label. */
  iconRight?: ReactNode;
  /** Square button with no label padding. */
  iconOnly?: boolean;
  children?: ReactNode;
};

const VARIANT_CLASS: Record<TFleetButtonVariant, string> = {
  primary:
    "bg-accent-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_-14px_var(--color-accent-primary,rgba(0,0,0,0.5))] hover:bg-accent-primary-hover",
  secondary: "bg-layer-2 text-primary border border-subtle hover:bg-layer-2-hover",
  outline: "border border-strong text-primary bg-transparent hover:bg-layer-transparent-hover",
  ghost: "text-secondary hover:text-primary hover:bg-layer-transparent-hover",
  danger: "bg-danger-subtle text-danger-primary border border-danger-subtle hover:bg-danger-subtle-hover",
};

const SIZE_CLASS: Record<TFleetButtonSize, string> = {
  xs: "h-7 px-2.5 text-11 gap-1.5 rounded-lg",
  sm: "h-8 px-3 text-12 gap-2 rounded-xl",
  md: "h-10 px-4 text-13 gap-2 rounded-xl",
};

const ICON_ONLY_CLASS: Record<TFleetButtonSize, string> = {
  xs: "h-7 w-7 px-0 rounded-lg",
  sm: "h-8 w-8 px-0 rounded-xl",
  md: "h-10 w-10 px-0 rounded-xl",
};

/**
 * A pressable button with a spring press, used by every fleet screen instead of
 * the workspace's stock button so the fleet feels like its own surface.
 */
export const FleetButton = forwardRef<HTMLButtonElement, TFleetButtonProps>(function FleetButton(props, ref) {
  const {
    variant = "secondary",
    size = "sm",
    loading = false,
    icon,
    iconRight,
    iconOnly = false,
    className,
    disabled,
    children,
    type = "button",
    ...rest
  } = props;
  const reducedMotion = useReducedMotion();
  const isDisabled = Boolean(disabled) || loading;

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      whileHover={isDisabled || reducedMotion ? undefined : { y: -1 }}
      whileTap={isDisabled || reducedMotion ? undefined : { scale: 0.96, y: 0 }}
      transition={{ type: "spring", stiffness: 600, damping: 30, mass: 0.5 }}
      className={cn(
        "relative inline-flex flex-shrink-0 items-center justify-center font-medium whitespace-nowrap outline-none select-none",
        "focus-visible:ring-accent-primary/60 focus-visible:ring-offset-surface-1 focus-visible:ring-2 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        iconOnly && ICON_ONLY_CLASS[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
      ) : (
        icon && <span className="flex flex-shrink-0 items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      )}
      {children !== undefined && children !== null && <span className="truncate">{children}</span>}
      {iconRight && !loading && (
        <span className="flex flex-shrink-0 items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{iconRight}</span>
      )}
    </motion.button>
  );
});
