# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import WorkspaceFleetIntegration


class FleetIntegrationSerializer(serializers.ModelSerializer):
    """What the browser sees. The key itself is never serialized."""

    has_key = serializers.BooleanField(read_only=True)
    instance_key_available = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceFleetIntegration
        fields = ["is_enabled", "base_url", "api_key_hint", "has_key", "instance_key_available", "updated_at"]
        read_only_fields = fields

    def get_instance_key_available(self, obj):
        return WorkspaceFleetIntegration.instance_key_available()


class FleetIntegrationUpdateSerializer(serializers.Serializer):
    is_enabled = serializers.BooleanField(required=False)
    base_url = serializers.URLField(required=False, max_length=512)
    # Empty string or null clears the stored key.
    api_key = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=512)

    def validate_base_url(self, value):
        if not value.startswith(("http://", "https://")):
            raise serializers.ValidationError("The fleet URL must start with http:// or https://.")
        return value.rstrip("/")


class FleetServiceCallSerializer(serializers.Serializer):
    params = serializers.DictField(required=False, default=dict)
    wait = serializers.IntegerField(required=False, min_value=1, max_value=60)
    fresh = serializers.BooleanField(required=False, default=False)
