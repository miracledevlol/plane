/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { FleetJobsPanel } from "./jobs-panel";
import { describeFleetError } from "./json-view";
import { FleetOverviewPanel } from "./overview-panel";
import { FleetSearchPanel } from "./search";
import { FleetServicesPanel } from "./services-panel";
import { FleetSettingsForm } from "./settings-form";
import { FleetWatchesPanel } from "./watches";

type Props = {
  workspaceSlug: string;
};

type TTab = "search" | "overview" | "services" | "watches" | "jobs" | "settings";

const TABS: { key: TTab; label: string; adminOnly?: boolean }[] = [
  { key: "search", label: "Search" },
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "watches", label: "Watches" },
  { key: "jobs", label: "Jobs" },
  { key: "settings", label: "Settings", adminOnly: true },
];

export const FleetRoot = observer(function FleetRoot(props: Props) {
  const { workspaceSlug } = props;
  // states
  const [activeTab, setActiveTab] = useState<TTab>("search");
  // store hooks
  const { settingsLoader, fetchSettings, isReady } = useFleet();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  // the fleet's job endpoint is closed to guests, so only members and admins can run a search
  const canSearch = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug
  );
  const isLoading = settingsLoader[workspaceSlug] === "init-loader" || settingsLoader[workspaceSlug] === undefined;
  const ready = isReady(workspaceSlug);
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  useEffect(() => {
    fetchSettings(workspaceSlug).catch((error: unknown) =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: describeFleetError(error, "Fleet settings could not be loaded."),
      })
    );
  }, [workspaceSlug, fetchSettings]);

  if (!ready) {
    return (
      <div className="flex h-full w-full flex-col items-center overflow-y-auto px-6 py-12">
        <div className="flex w-full max-w-xl flex-col gap-4">
          <h2 className="text-16 font-semibold text-primary">Fleet is not connected</h2>
          <p className="text-13 text-secondary">
            {isLoading
              ? "Loading fleet settings..."
              : "The fleet runs scrape, search, crawl and uptime jobs for this workspace. Connect it with the fleet's URL and a bot key, then enable it."}
          </p>
          {!isLoading &&
            (isAdmin ? (
              <FleetSettingsForm workspaceSlug={workspaceSlug} />
            ) : (
              <p className="text-13 text-tertiary">Ask a workspace admin to connect thefleet.</p>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-subtle px-4">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-13",
              activeTab === tab.key
                ? "border-accent-primary font-medium text-primary"
                : "border-transparent text-secondary hover:text-primary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", activeTab === "search" ? "p-0" : "p-4")}>
        {activeTab === "search" && <FleetSearchPanel workspaceSlug={workspaceSlug} canSearch={canSearch} />}
        {activeTab === "overview" && <FleetOverviewPanel workspaceSlug={workspaceSlug} />}
        {activeTab === "services" && <FleetServicesPanel workspaceSlug={workspaceSlug} />}
        {activeTab === "watches" && <FleetWatchesPanel workspaceSlug={workspaceSlug} />}
        {activeTab === "jobs" && <FleetJobsPanel workspaceSlug={workspaceSlug} />}
        {activeTab === "settings" && isAdmin && <FleetSettingsForm workspaceSlug={workspaceSlug} />}
      </div>
    </div>
  );
});
