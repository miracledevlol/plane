/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFleetError } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  value: unknown;
  className?: string;
};

/** Pretty-printed JSON in a scrollable block. */
export function JsonView(props: Props) {
  const { value, className } = props;
  return (
    <pre
      className={cn(
        "max-h-96 overflow-auto rounded border border-subtle bg-surface-1 p-3 text-11 whitespace-pre text-primary",
        className
      )}
    >
      {JSON.stringify(value, null, 2) ?? "null"}
    </pre>
  );
}

/** Top-level keys whose values are not objects or arrays, stringified for display. */
export const primitiveEntries = (value: unknown): [string, string][] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry === null || typeof entry !== "object")
    .map(([key, entry]) => [key, entry === null || entry === undefined ? "" : String(entry)]);
};

/** One readable line for an error thrown by the fleet store. */
export const describeFleetError = (error: unknown, fallback: string): string => {
  const data = (error ?? {}) as TFleetError;
  const parts = [data.code, data.error].filter((part): part is string => typeof part === "string" && part !== "");
  let message = parts.length ? parts.join(": ") : fallback;
  if (typeof data.retryAfterSec === "number") message += ` (retry in ${data.retryAfterSec} s)`;
  return message;
};

/** Parse a JSON object typed into a textarea; returns an error string when it is not an object. */
export const parseJsonObject = (text: string): { value?: Record<string, unknown>; error?: string } => {
  const trimmed = text.trim();
  if (!trimmed) return { value: {} };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "Enter a JSON object." };
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: "This is not valid JSON." };
  }
};

export const TEXTAREA_CLASS =
  "focus:border-accent-primary w-full resize-y rounded border border-subtle bg-surface-1 px-2 py-1.5 font-mono text-12 text-primary outline-none placeholder:text-placeholder";

export const TABLE_CLASS = "w-full border-collapse text-12";
export const TH_CLASS =
  "border-b border-subtle px-2 py-1.5 text-left text-11 font-semibold tracking-wide text-tertiary uppercase";
export const TD_CLASS = "border-b border-subtle px-2 py-1.5 align-top text-secondary";
