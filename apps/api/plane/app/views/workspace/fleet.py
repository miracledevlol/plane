# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace-scoped proxy to thefleet.

Admins configure the connection; members operate it. Every call reaches the
fleet with the workspace's own bot key, so the fleet's scopes, host policy
and quotas apply exactly as minted. Fleet errors are passed through with their
``code`` so the web app can branch on them the way the fleet client would.
"""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    FleetIntegrationSerializer,
    FleetIntegrationUpdateSerializer,
    FleetServiceCallSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace, WorkspaceFleetIntegration
from plane.utils.thefleet import DEFAULT_WAIT_SEC, FleetError, TheFleet

OPERATORS = [ROLE.ADMIN, ROLE.MEMBER]
EVERYONE = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]

# Query parameters the operator screens may pass straight through to the fleet.
PASSTHROUGH_QUERY = {"limit", "cursor", "before", "after", "kind", "watchId", "watch", "status", "since"}


def integration_for(slug):
    return WorkspaceFleetIntegration.objects.filter(workspace__slug=slug).first()


def fleet_error_response(err):
    return Response(err.as_dict(), status=err.status or status.HTTP_502_BAD_GATEWAY)


class FleetBaseView(BaseAPIView):
    def client(self, slug):
        """Return ``(client, None)`` for a ready workspace, or ``(None, error Response)``."""
        integration = integration_for(slug)
        if integration is None or not integration.is_ready:
            return None, Response(
                {"code": "fleet_disabled", "error": "The fleet integration is not enabled for this workspace."},
                status=status.HTTP_409_CONFLICT,
            )
        return TheFleet(integration.base_url, integration.api_key), None

    def passthrough_query(self, request):
        return {k: v for k, v in request.query_params.items() if k in PASSTHROUGH_QUERY}

    def proxy_get(self, request, slug, path):
        fleet, error = self.client(slug)
        if error:
            return error
        try:
            fleet_status, body = fleet.get(path, params=self.passthrough_query(request))
        except FleetError as e:
            return fleet_error_response(e)
        return Response(body, status=fleet_status)

    def proxy_post(self, request, slug, path):
        fleet, error = self.client(slug)
        if error:
            return error
        try:
            fleet_status, body = fleet.post(path, json=request.data)
        except FleetError as e:
            return fleet_error_response(e)
        return Response(body, status=fleet_status)


class FleetIntegrationSettingsEndpoint(FleetBaseView):
    @allow_permission(EVERYONE, level="WORKSPACE")
    def get(self, request, slug):
        integration = integration_for(slug)
        if integration is None:
            return Response(
                {
                    "is_enabled": False,
                    "base_url": WorkspaceFleetIntegration.DEFAULT_BASE_URL,
                    "api_key_hint": "",
                    "has_key": False,
                    "updated_at": None,
                }
            )
        return Response(FleetIntegrationSerializer(integration).data)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        serializer = FleetIntegrationUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        workspace = Workspace.objects.get(slug=slug)
        integration, _ = WorkspaceFleetIntegration.objects.get_or_create(workspace=workspace)
        if "base_url" in data:
            integration.base_url = data["base_url"]
        if "api_key" in data:
            integration.set_api_key(data["api_key"])
        if "is_enabled" in data:
            integration.is_enabled = data["is_enabled"]
        if integration.is_enabled and not integration.has_key:
            return Response(
                {"api_key": ["Paste a fleet bot key before enabling the integration."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        integration.save()
        return Response(FleetIntegrationSerializer(integration).data)


class FleetConnectionTestEndpoint(FleetBaseView):
    """Ask the fleet for today's usage with the stored key. Proves URL, key and network."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        integration = integration_for(slug)
        if integration is None or not integration.has_key:
            return Response(
                {"code": "fleet_disabled", "error": "No fleet key is stored yet."}, status=status.HTTP_409_CONFLICT
            )
        try:
            usage = TheFleet(integration.base_url, integration.api_key).usage()
        except FleetError as e:
            return fleet_error_response(e)
        return Response({"ok": True, "usage": usage})


class FleetUsageEndpoint(FleetBaseView):
    @allow_permission(EVERYONE, level="WORKSPACE")
    def get(self, request, slug):
        return self.proxy_get(request, slug, "usage")


class FleetServicesEndpoint(FleetBaseView):
    @allow_permission(EVERYONE, level="WORKSPACE")
    def get(self, request, slug):
        return self.proxy_get(request, slug, "services")


class FleetServiceCallEndpoint(FleetBaseView):
    """Call one service. A 202 from the fleet is passed through: re-post the same params to resume."""

    @allow_permission(OPERATORS, level="WORKSPACE")
    def post(self, request, slug, service_slug):
        serializer = FleetServiceCallSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        fleet, error = self.client(slug)
        if error:
            return error
        data = serializer.validated_data
        try:
            fleet_status, body = fleet.call_once(
                service_slug,
                data.get("params") or {},
                wait=data.get("wait") or DEFAULT_WAIT_SEC,
                fresh=data.get("fresh", False),
            )
        except FleetError as e:
            return fleet_error_response(e)
        return Response(body, status=fleet_status)


class FleetWatchesEndpoint(FleetBaseView):
    @allow_permission(EVERYONE, level="WORKSPACE")
    def get(self, request, slug):
        return self.proxy_get(request, slug, "watches")

    @allow_permission(OPERATORS, level="WORKSPACE")
    def post(self, request, slug):
        return self.proxy_post(request, slug, "watches")


class FleetChecksEndpoint(FleetBaseView):
    @allow_permission(EVERYONE, level="WORKSPACE")
    def get(self, request, slug):
        return self.proxy_get(request, slug, "checks")


class FleetJobsEndpoint(FleetBaseView):
    @allow_permission(OPERATORS, level="WORKSPACE")
    def post(self, request, slug):
        return self.proxy_post(request, slug, "jobs")


class FleetJobDetailEndpoint(FleetBaseView):
    @allow_permission(EVERYONE, level="WORKSPACE")
    def get(self, request, slug, job_id):
        return self.proxy_get(request, slug, f"jobs/{job_id}")
