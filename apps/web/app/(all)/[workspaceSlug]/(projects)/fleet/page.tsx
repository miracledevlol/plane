/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { FleetRoot } from "@/components/fleet";

const WorkspaceFleetPage = observer(function WorkspaceFleetPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";

  if (!slug) return null;

  return (
    <>
      <PageHead title="Fleet" />
      <div className="relative h-full w-full overflow-hidden">
        <FleetRoot workspaceSlug={slug} />
      </div>
    </>
  );
});

export default WorkspaceFleetPage;
