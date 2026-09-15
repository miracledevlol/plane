# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    FleetChecksEndpoint,
    FleetConnectionTestEndpoint,
    FleetIntegrationSettingsEndpoint,
    FleetJobDetailEndpoint,
    FleetJobsEndpoint,
    FleetServiceCallEndpoint,
    FleetServicesEndpoint,
    FleetUsageEndpoint,
    FleetWatchesEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/fleet/settings/",
        FleetIntegrationSettingsEndpoint.as_view(),
        name="workspace-fleet-settings",
    ),
    path("workspaces/<str:slug>/fleet/test/", FleetConnectionTestEndpoint.as_view(), name="workspace-fleet-test"),
    path("workspaces/<str:slug>/fleet/usage/", FleetUsageEndpoint.as_view(), name="workspace-fleet-usage"),
    path("workspaces/<str:slug>/fleet/services/", FleetServicesEndpoint.as_view(), name="workspace-fleet-services"),
    path(
        "workspaces/<str:slug>/fleet/services/<slug:service_slug>/call/",
        FleetServiceCallEndpoint.as_view(),
        name="workspace-fleet-service-call",
    ),
    path("workspaces/<str:slug>/fleet/watches/", FleetWatchesEndpoint.as_view(), name="workspace-fleet-watches"),
    path("workspaces/<str:slug>/fleet/checks/", FleetChecksEndpoint.as_view(), name="workspace-fleet-checks"),
    path("workspaces/<str:slug>/fleet/jobs/", FleetJobsEndpoint.as_view(), name="workspace-fleet-jobs"),
    path(
        "workspaces/<str:slug>/fleet/jobs/<str:job_id>/",
        FleetJobDetailEndpoint.as_view(),
        name="workspace-fleet-job",
    ),
]
