# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Minimal client for thefleet's bot API.

Mirrors the client shipped in the fleet's own integrations folder: a handful
of verbs, no dependencies beyond requests, fleet error codes surfaced as-is.
The API proxies calls on behalf of a workspace so the bot key never leaves
the server.
"""

# Python imports
from urllib.parse import urljoin

# Third party imports
import requests

API_PREFIX = "/api/bot/v1/"

# Seconds the fleet is asked to hold a service call before answering 202.
DEFAULT_WAIT_SEC = 45
MAX_WAIT_SEC = 60


class FleetError(Exception):
    """A fleet-side error. ``code`` follows the fleet's contract."""

    def __init__(self, code, message, status=None, retry_after=None, payload=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retry_after = retry_after
        self.payload = payload or {}

    def as_dict(self):
        body = {"code": self.code, "error": self.message}
        if self.retry_after is not None:
            body["retryAfterSec"] = self.retry_after
        if self.payload.get("quota") is not None:
            body["quota"] = self.payload["quota"]
        return body


class TheFleet:
    def __init__(self, url, key, timeout=DEFAULT_WAIT_SEC + 15):
        self.base = url.rstrip("/") + API_PREFIX
        self.key = key
        self.timeout = timeout

    def _url(self, path):
        return urljoin(self.base, path.lstrip("/"))

    def request(self, method, path, params=None, json=None, timeout=None):
        """Return ``(status, body)``. Raises FleetError for 4xx/5xx and transport errors."""
        headers = {"Authorization": f"Bearer {self.key}", "Accept": "application/json"}
        try:
            response = requests.request(
                method,
                self._url(path),
                params=params or None,
                json=json,
                headers=headers,
                timeout=timeout or self.timeout,
            )
        except requests.Timeout:
            raise FleetError("timeout", "The fleet did not answer in time.", status=504)
        except requests.RequestException as e:
            raise FleetError("fleet_unreachable", f"The fleet could not be reached: {e}", status=502)

        try:
            body = response.json() if response.content else {}
        except ValueError:
            body = {"raw": response.text[:2000]}
        if not isinstance(body, dict):
            body = {"data": body}

        if response.status_code >= 400:
            code = body.get("code") or f"http_{response.status_code}"
            message = body.get("message") or body.get("error") or response.reason or "Fleet request failed."
            retry_after = body.get("retryAfterSec")
            if retry_after is None and response.headers.get("Retry-After"):
                try:
                    retry_after = int(response.headers["Retry-After"])
                except ValueError:
                    retry_after = None
            raise FleetError(code, message, status=response.status_code, retry_after=retry_after, payload=body)
        return response.status_code, body

    def get(self, path, params=None):
        return self.request("GET", path, params=params)

    def post(self, path, json=None, params=None, timeout=None):
        return self.request("POST", path, params=params, json=json, timeout=timeout)

    # Convenience verbs matching the fleet's own client.

    def usage(self):
        return self.get("usage")[1]

    def services(self):
        return self.get("services")[1]

    def call_once(self, slug, params, wait=DEFAULT_WAIT_SEC, fresh=False):
        """One service call. Returns ``(status, body)``; 202 means still working."""
        wait = max(1, min(int(wait or DEFAULT_WAIT_SEC), MAX_WAIT_SEC))
        query = {"wait": wait}
        if fresh:
            query["fresh"] = "true"
        return self.post(f"services/{slug}", json={"params": params or {}}, params=query, timeout=wait + 15)
