# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from plane.license.utils.encryption import decrypt_data, encrypt_data

from .base import BaseModel


class WorkspaceFleetIntegration(BaseModel):
    """The thefleet connection for one workspace.

    A workspace admin pastes a ``bk_`` bot key minted on the fleet's Agents
    screen. The key is stored encrypted and never returned to the browser;
    every fleet call the workspace makes goes through the API, which signs it
    with this key. The restrictions live on the key on the fleet side, so a
    workspace can only ever reach what its key allows.
    """

    DEFAULT_BASE_URL = "https://thefleet-production.up.railway.app"

    workspace = models.OneToOneField("db.Workspace", on_delete=models.CASCADE, related_name="fleet_integration")
    base_url = models.CharField(max_length=512, default=DEFAULT_BASE_URL)
    api_key_encrypted = models.TextField(blank=True, default="")
    # The last characters of the key, so admins can tell which key is set.
    api_key_hint = models.CharField(max_length=12, blank=True, default="")
    is_enabled = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Workspace Fleet Integration"
        verbose_name_plural = "Workspace Fleet Integrations"
        db_table = "workspace_fleet_integrations"
        ordering = ("-created_at",)

    def __str__(self):
        return f"fleet:{self.workspace_id}"

    @property
    def has_key(self):
        return bool(self.api_key_encrypted)

    @property
    def api_key(self):
        return decrypt_data(self.api_key_encrypted) if self.api_key_encrypted else ""

    def set_api_key(self, raw):
        raw = (raw or "").strip()
        if not raw:
            self.api_key_encrypted = ""
            self.api_key_hint = ""
            return
        self.api_key_encrypted = encrypt_data(raw)
        self.api_key_hint = raw[-4:]

    @staticmethod
    def instance_key_available():
        return bool(getattr(settings, "THEFLEET_DEFAULT_KEY", ""))

    @property
    def effective_key(self):
        """The workspace's own key, or the instance default when none is stored."""
        return self.api_key or getattr(settings, "THEFLEET_DEFAULT_KEY", "")

    @property
    def is_ready(self):
        return self.is_enabled and bool(self.effective_key) and bool(self.base_url)
