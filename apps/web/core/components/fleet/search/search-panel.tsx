/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Radar, Search, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { TFleetSearchSession } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { FleetSearchBrief } from "./search-brief";
import { FleetSearchResults } from "./search-results";
import type { TFleetSearchSettings } from "./search-settings";
import { FleetSearchSettingsRow, useFleetSearchSettings } from "./search-settings";

type Props = {
  workspaceSlug: string;
  /** `POST /jobs` is members and admins only, so guests read searches but cannot run them. */
  canSearch: boolean;
};

const RECENT_QUERY_COUNT = 8;

/** Whether a session still has an engine the fleet has not settled. */
const isSessionPending = (session: TFleetSearchSession): boolean =>
  session.runs.some((run) => run.status === "queued" || run.status === "running");

type FormProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  settings: TFleetSearchSettings;
  onSettingsChange: (partial: Partial<TFleetSearchSettings>) => void;
  isRunning: boolean;
  canSearch: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputClassName?: string;
};

function SearchForm(props: FormProps) {
  const {
    query,
    onQueryChange,
    onSubmit,
    onCancel,
    settings,
    onSettingsChange,
    isRunning,
    canSearch,
    inputRef,
    inputClassName,
  } = props;
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex w-full items-center gap-2">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden="true" className="absolute left-3 h-4 w-4 text-tertiary" />
          <label htmlFor="fleet-search-query" className="sr-only">
            Search the web with thefleet
          </label>
          <input
            id="fleet-search-query"
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search the web"
            autoComplete="off"
            disabled={!canSearch}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onQueryChange("");
            }}
            className={cn(
              "focus:border-accent-primary w-full rounded-full border border-subtle bg-surface-1 py-2 pr-4 pl-9 text-13 text-primary outline-none placeholder:text-placeholder",
              inputClassName
            )}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          loading={isRunning}
          disabled={!canSearch || isRunning || !query.trim()}
        >
          Search
        </Button>
        {isRunning && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-shrink-0 px-1 text-12 text-secondary hover:text-primary"
          >
            Cancel
          </button>
        )}
      </div>
      <FleetSearchSettingsRow settings={settings} onChange={onSettingsChange} disabled={isRunning} />
      {!canSearch && <span className="text-12 text-tertiary">Only workspace members can run searches.</span>}
    </form>
  );
}

/** The Search tab: a search-engine style front page that turns into results and a keyword brief. */
export const FleetSearchPanel = observer(function FleetSearchPanel(props: Props) {
  const { workspaceSlug, canSearch } = props;
  // store hooks
  const { getSearchSessions, getActiveSearchSession, setActiveSearchSession, runSearch, cancelSearch } = useFleet();
  // states
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // the results view can be dismissed for a fresh search without discarding any session
  const [showHome, setShowHome] = useState(false);
  // refs
  const inputRef = useRef<HTMLInputElement>(null);
  const syncedSessionId = useRef<string | null>(null);
  // settings
  const { settings, update } = useFleetSearchSettings(workspaceSlug);
  // derived values
  const sessions = getSearchSessions(workspaceSlug);
  const session = getActiveSearchSession(workspaceSlug);
  // a Recent chip can leave an older session running, so every session of this workspace counts
  const pendingSessions = sessions.filter(isSessionPending);
  const isRunning = isSubmitting || pendingSessions.length > 0;
  const isHome = showHome || !session;
  const recent = sessions
    .filter((entry, index) => sessions.findIndex((other) => other.params.query === entry.params.query) === index)
    .slice(0, RECENT_QUERY_COUNT);

  // keep the input in step with whichever session is being shown, without overwriting what is being typed
  useEffect(() => {
    if (!session || syncedSessionId.current === session.id) return;
    syncedSessionId.current = session.id;
    setQuery(session.params.query);
  }, [session]);

  // the empty state reads as a search home, so the caret starts in the input
  useEffect(() => {
    if (isHome) inputRef.current?.focus();
  }, [isHome]);

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed || isRunning || !canSearch) return;
    setShowHome(false);
    setIsSubmitting(true);
    // runSearch settles every engine on its own and never rejects, so there is nothing to catch
    runSearch(workspaceSlug, {
      query: trimmed,
      engines: settings.engines,
      limit: settings.limit,
      fetchContent: settings.fetchContent,
    }).finally(() => setIsSubmitting(false));
  };

  const handleCancel = () => {
    pendingSessions.forEach((entry) => cancelSearch(workspaceSlug, entry.id));
  };

  const handleOpenSession = (entry: TFleetSearchSession) => {
    setShowHome(false);
    setQuery(entry.params.query);
    setActiveSearchSession(workspaceSlug, entry.id);
  };

  const handleSuggestQuery = (suggested: string) => {
    setQuery(suggested);
    inputRef.current?.focus();
  };

  // spelled out rather than reusing `isHome` so TypeScript narrows the session below
  if (showHome || !session)
    return (
      <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 px-4 py-12">
        <div className="flex flex-col items-center gap-2">
          <Radar aria-hidden="true" className="h-8 w-8 text-accent-primary" />
          <h2 className="text-16 font-semibold text-primary">Search the web with thefleet</h2>
          <p className="text-13 text-secondary">Run one query across several engines and read the results together.</p>
        </div>
        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <SearchForm
            query={query}
            onQueryChange={setQuery}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            settings={settings}
            onSettingsChange={update}
            isRunning={isRunning}
            canSearch={canSearch}
            inputRef={inputRef}
            inputClassName="py-2.5"
          />
          {recent.length > 0 && (
            <div className="flex w-full flex-col gap-1.5">
              <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">Recent</span>
              <div className="flex flex-wrap gap-1">
                {recent.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleOpenSession(entry)}
                    className="rounded-full border border-subtle px-2.5 py-1 text-12 text-secondary hover:text-primary"
                  >
                    {entry.params.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );

  return (
    <div className="flex w-full flex-col">
      <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-subtle bg-surface-1 px-4 py-3">
        <SearchForm
          query={query}
          onQueryChange={setQuery}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          settings={settings}
          onSettingsChange={update}
          isRunning={isRunning}
          canSearch={canSearch}
          inputRef={inputRef}
        />
        <button
          type="button"
          aria-label="Start a new search"
          onClick={() => {
            setQuery("");
            setShowHome(true);
          }}
          className="mt-1 flex-shrink-0 rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start">
        <FleetSearchResults key={session.id} workspaceSlug={workspaceSlug} session={session} canSearch={canSearch} />
        <FleetSearchBrief
          workspaceSlug={workspaceSlug}
          session={session}
          canSearch={canSearch}
          onSuggestQuery={handleSuggestQuery}
        />
      </div>
    </div>
  );
});
