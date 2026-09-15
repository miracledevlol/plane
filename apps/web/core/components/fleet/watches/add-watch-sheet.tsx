/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { observer } from "mobx-react";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TFleetWatch, TFleetWatchKind } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { describeFleetError } from "../json-view";
import { FleetButton, FleetField, FleetInput, FleetSelect, FleetSheet } from "../ui";
import { SERP_ENGINES, WATCH_KINDS, parseSerpTarget, watchKindMeta } from "./watch-kinds";
import type { TSerpEngine } from "./watch-kinds";

type Props = {
  workspaceSlug: string;
  open: boolean;
  /** Skip the kind picker and open straight on this kind's form. */
  initialKind?: TFleetWatchKind | null;
  onClose: () => void;
  onCreated?: (watch: TFleetWatch) => void;
};

type LeaderboardMode = "gamba" | "url";

const TONE_CLASS: Record<string, string> = {
  success: "text-success-primary bg-success-subtle border-success-subtle",
  info: "text-info-primary bg-info-subtle border-info-subtle",
  warning: "text-warning-primary bg-warning-subtle border-warning-subtle",
  accent: "text-accent-primary bg-accent-subtle border-accent-subtle",
  danger: "text-danger-primary bg-danger-subtle border-danger-subtle",
  neutral: "text-secondary bg-layer-2 border-subtle",
};

/**
 * Two steps: pick what to watch, then say what to watch. Each kind shapes its
 * own target so operators never have to know the fleet's `engine:keyword` or
 * `gamba:<raceId>` spellings.
 */
export const FleetAddWatchSheet = observer(function FleetAddWatchSheet(props: Props) {
  const { workspaceSlug, open, initialKind = null, onClose, onCreated } = props;
  const reducedMotion = useReducedMotion();
  // store hooks
  const { createWatch } = useFleet();
  // states
  const [kind, setKind] = useState<TFleetWatchKind | null>(initialKind);
  const [raw, setRaw] = useState("");
  const [engine, setEngine] = useState<TSerpEngine>("google");
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("gamba");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // every open starts clean, on the requested kind
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setRaw("");
    setEngine("google");
    setLeaderboardMode("gamba");
    setTouched(false);
    setSubmitting(false);
    setSubmitError(null);
  }, [open, initialKind]);

  const targetRef = useRef<HTMLInputElement | null>(null);
  const meta = kind ? watchKindMeta(kind) : null;

  // the sheet only focuses on open, so a kind picked afterwards focuses its field here
  useEffect(() => {
    if (!open || !meta) return;
    const frame = requestAnimationFrame(() => targetRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, meta]);

  const target = useMemo(() => {
    if (!meta) return "";
    if (meta.kind === "serp") return `${engine}:${raw.trim()}`;
    if (meta.kind === "leaderboard" && leaderboardMode === "gamba") {
      return meta.normalize(/^gamba:/i.test(raw.trim()) ? raw : `gamba:${raw}`);
    }
    return meta.normalize(raw);
  }, [meta, raw, engine, leaderboardMode]);

  const validation = meta ? meta.validate(target) : "Pick a kind.";
  const showError = touched && validation ? validation : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!meta || validation) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const watch = await createWatch(workspaceSlug, { kind: meta.kind, target });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `${meta.label} added`,
        message: `Watching ${meta.displayTarget({ ...watch, kind: meta.kind, target: watch.target ?? target })}.`,
      });
      onCreated?.(watch);
      onClose();
    } catch (error) {
      setSubmitError(describeFleetError(error, "The watch could not be added."));
    } finally {
      setSubmitting(false);
    }
  };

  const slideIn = reducedMotion ? { opacity: 0 } : { opacity: 0, x: 16 };
  const slideOut = reducedMotion ? { opacity: 0 } : { opacity: 0, x: -16 };

  return (
    <FleetSheet
      open={open}
      onClose={onClose}
      side="right"
      size="md"
      title={meta ? meta.label : "Add a watch"}
      description={meta ? meta.description : "The fleet checks it on a schedule and keeps the history."}
      footer={
        meta ? (
          <>
            <FleetButton
              variant="ghost"
              size="sm"
              icon={<ArrowLeft />}
              onClick={() => setKind(null)}
              disabled={submitting}
            >
              Change kind
            </FleetButton>
            <FleetButton
              variant="primary"
              size="sm"
              icon={<Plus />}
              loading={submitting}
              form="fleet-add-watch-form"
              type="submit"
            >
              Add {meta.label.toLowerCase()}
            </FleetButton>
          </>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {!meta ? (
          <motion.div
            key="picker"
            initial={slideOut}
            animate={{ opacity: 1, x: 0 }}
            exit={slideOut}
            transition={{ duration: 0.16 }}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {WATCH_KINDS.map((option, index) => {
              const Icon = option.icon;
              return (
                <motion.button
                  key={option.kind}
                  type="button"
                  data-autofocus={index === 0 ? "" : undefined}
                  onClick={() => {
                    setKind(option.kind);
                    setTouched(false);
                  }}
                  whileHover={reducedMotion ? undefined : { y: -2 }}
                  whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                  className="focus-visible:ring-accent-primary/60 flex flex-col items-start gap-2 rounded-2xl border border-subtle bg-layer-1 p-4 text-left outline-none hover:border-strong hover:bg-layer-2 focus-visible:ring-2"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl border",
                      TONE_CLASS[option.tone] ?? TONE_CLASS.neutral
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-13 font-semibold text-primary">{option.label}</span>
                  <span className="text-11 leading-snug text-secondary">{option.description}</span>
                </motion.button>
              );
            })}
          </motion.div>
        ) : (
          <motion.form
            key={meta.kind}
            id="fleet-add-watch-form"
            onSubmit={handleSubmit}
            initial={slideIn}
            animate={{ opacity: 1, x: 0 }}
            exit={slideIn}
            transition={{ duration: 0.16 }}
            className="flex flex-col gap-5"
          >
            {meta.kind === "serp" && (
              <FleetField label="Search engine" hint="Where the keyword gets looked up.">
                <FleetSelect
                  value={engine}
                  onChange={setEngine}
                  options={SERP_ENGINES.map((option) => ({ value: option.key, label: option.label }))}
                  buttonClassName="h-10 w-full"
                  className="w-full"
                />
              </FleetField>
            )}

            {meta.kind === "leaderboard" && (
              <FleetField label="Where the race lives">
                <FleetSelect<LeaderboardMode>
                  value={leaderboardMode}
                  onChange={(mode) => {
                    setLeaderboardMode(mode);
                    setRaw("");
                    setTouched(false);
                  }}
                  options={[
                    { value: "gamba", label: "Gamba race", description: "Tracked by race id" },
                    { value: "url", label: "Promo page", description: "Any public leaderboard URL" },
                  ]}
                  buttonClassName="h-10 w-full"
                  className="w-full"
                />
              </FleetField>
            )}

            <FleetField
              label={
                meta.kind === "leaderboard"
                  ? leaderboardMode === "gamba"
                    ? "Race id"
                    : "Leaderboard URL"
                  : meta.targetLabel
              }
              htmlFor="fleet-add-watch-target"
              hint={
                meta.kind === "leaderboard"
                  ? leaderboardMode === "gamba"
                    ? "The id from the Gamba race link."
                    : "The page that shows the standings."
                  : meta.targetHint
              }
              error={showError}
            >
              <FleetInput
                ref={targetRef}
                id="fleet-add-watch-target"
                data-autofocus=""
                value={raw}
                invalid={Boolean(showError)}
                onChange={(event) => setRaw(event.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={
                  meta.kind === "leaderboard"
                    ? leaderboardMode === "gamba"
                      ? "abc123"
                      : "https://promo.example.com/race"
                    : meta.targetPlaceholder
                }
                prefix={
                  meta.kind === "xprofile"
                    ? "@"
                    : meta.kind === "leaderboard" && leaderboardMode === "gamba"
                      ? "gamba:"
                      : undefined
                }
                autoComplete="off"
                spellCheck={false}
              />
            </FleetField>

            <div className="rounded-xl border border-subtle bg-layer-2 px-3 py-2.5">
              <span className="text-10 font-semibold tracking-wide text-tertiary uppercase">Sent to the fleet</span>
              <div className="mt-1 flex items-center gap-2 font-code text-12 text-primary">
                <span className="rounded-md bg-layer-3 px-1.5 py-0.5 text-11 text-secondary">{meta.kind}</span>
                <span className="min-w-0 truncate">
                  {meta.kind === "serp" && !parseSerpTarget(target).keyword ? `${engine}:…` : target || "…"}
                </span>
                {!validation && <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-success-primary" />}
              </div>
            </div>

            {submitError && (
              <p className="rounded-xl border border-danger-subtle bg-danger-subtle px-3 py-2 text-12 text-danger-primary">
                {submitError}
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </FleetSheet>
  );
});
