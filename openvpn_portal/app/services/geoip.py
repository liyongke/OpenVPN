from __future__ import annotations

import ipaddress
import json
import os
import time
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


class GeoIpService:
    def __init__(self, ttl_seconds: int = 21600, request_timeout_seconds: float = 3.0) -> None:
        self.ttl_seconds = max(300, int(ttl_seconds))
        self.request_timeout_seconds = max(1.0, float(request_timeout_seconds))
        self._cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self.geoip_db_path = os.getenv("PORTAL_GEOIP_DB_PATH", "").strip()

        self._geoip2_reader = None
        if self.geoip_db_path:
            try:
                import geoip2.database

                self._geoip2_reader = geoip2.database.Reader(self.geoip_db_path)
            except Exception:
                # Fallback to public API if local DB is unavailable.
                self._geoip2_reader = None

    @staticmethod
    def _empty_payload(ip_value: str, *, lookup: str, reason: str, provider: str = "") -> dict[str, Any]:
        return {
            "ip": ip_value,
            "lookup": lookup,
            "reason": reason,
            "provider": provider,
            "country": "",
            "country_code": "",
            "region": "",
            "city": "",
            "timezone": "",
            "latitude": None,
            "longitude": None,
            "isp": "",
            "asn": "",
            "org": "",
        }

    @staticmethod
    def _parse_real_address(value: str) -> tuple[str, int | None]:
        real = (value or "").strip()
        if not real:
            return "", None

        if real.startswith("[") and "]" in real:
            host = real[1 : real.index("]")]
            rest = real[real.index("]") + 1 :]
            if rest.startswith(":"):
                try:
                    return host, int(rest[1:])
                except ValueError:
                    return host, None
            return host, None

        try:
            ipaddress.ip_address(real)
            return real, None
        except ValueError:
            pass

        if ":" in real:
            host, port = real.rsplit(":", 1)
            try:
                ipaddress.ip_address(host)
                return host, int(port)
            except (ValueError, TypeError):
                return "", None

        return "", None

    @staticmethod
    def _is_public_ip(ip_value: str) -> bool:
        try:
            ip_obj = ipaddress.ip_address(ip_value)
        except ValueError:
            return False

        return not (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_multicast
            or ip_obj.is_reserved
            or ip_obj.is_unspecified
        )

    def _lookup_geo(self, ip_value: str) -> dict[str, Any]:
        now = time.time()
        cached = self._cache.get(ip_value)
        if cached and cached[0] > now:
            return cached[1]

        if not self._is_public_ip(ip_value):
            payload = self._empty_payload(ip_value, lookup="skipped", reason="non_public_ip")
            self._cache[ip_value] = (now + self.ttl_seconds, payload)
            return payload

        payload = self._lookup_geo_maxmind(ip_value)
        if payload is None:
            payload = self._lookup_geo_ipwhois(ip_value)

        if len(self._cache) > 4096:
            # Keep cache bounded during long-lived service runs.
            cutoff = time.time()
            self._cache = {k: v for k, v in self._cache.items() if v[0] > cutoff}

        self._cache[ip_value] = (now + self.ttl_seconds, payload)
        return payload

    def _lookup_geo_maxmind(self, ip_value: str) -> dict[str, Any] | None:
        if self._geoip2_reader is None:
            return None

        try:
            city_record = self._geoip2_reader.city(ip_value)
        except Exception:
            return None

        country = city_record.country
        subdiv = city_record.subdivisions.most_specific
        city = city_record.city
        location = city_record.location

        return {
            "ip": ip_value,
            "lookup": "ok",
            "reason": "",
            "provider": "maxmind_geolite2",
            "country": str(country.name or ""),
            "country_code": str(country.iso_code or ""),
            "region": str(subdiv.name or ""),
            "city": str(city.name or ""),
            "timezone": str(location.time_zone or ""),
            "latitude": location.latitude,
            "longitude": location.longitude,
            "isp": "",
            "asn": "",
            "org": "",
        }

    def _lookup_geo_ipwhois(self, ip_value: str) -> dict[str, Any]:
        url = f"https://ipwho.is/{ip_value}"
        req = Request(url, headers={"User-Agent": "openvpn-portal-geo/1.0"})

        try:
            with urlopen(req, timeout=self.request_timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="ignore")
            body = json.loads(raw)
        except (URLError, TimeoutError, json.JSONDecodeError, OSError):
            body = {"success": False}

        success = bool(body.get("success"))
        connection = body.get("connection") if isinstance(body.get("connection"), dict) else {}
        timezone = body.get("timezone") if isinstance(body.get("timezone"), dict) else {}

        if not success:
            return self._empty_payload(ip_value, lookup="failed", reason="lookup_failed", provider="ipwhois")

        return {
            "ip": ip_value,
            "lookup": "ok",
            "reason": "",
            "provider": "ipwhois",
            "country": str(body.get("country", "")),
            "country_code": str(body.get("country_code", "")),
            "region": str(body.get("region", "")),
            "city": str(body.get("city", "")),
            "timezone": str(timezone.get("id", "")),
            "latitude": body.get("latitude"),
            "longitude": body.get("longitude"),
            "isp": str(connection.get("isp", "")),
            "asn": str(connection.get("asn", "")),
            "org": str(connection.get("org", "")),
        }

    def enrich_sessions(self, sessions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        enriched: list[dict[str, Any]] = []

        for session in sessions:
            real_address = str(session.get("real_address", ""))
            ip_value, port = self._parse_real_address(real_address)
            geo = (
                self._lookup_geo(ip_value)
                if ip_value
                else self._empty_payload("", lookup="skipped", reason="missing_or_invalid_real_address")
            )

            row = {
                "username": str(session.get("username", "")),
                "common_name": str(session.get("common_name", "")),
                "protocol": str(session.get("protocol", "unknown")),
                "audit_class": str(session.get("audit_class", "trusted")),
                "audit_flags": session.get("audit_flags", []),
                "device_type": str(session.get("device_type", "unknown")),
                "device_platform": str(session.get("device_platform", "unknown")),
                "bytes_received": int(session.get("bytes_received", 0)),
                "bytes_sent": int(session.get("bytes_sent", 0)),
                "mib_received": float(session.get("mib_received", 0.0)),
                "mib_sent": float(session.get("mib_sent", 0.0)),
                "connected_since": str(session.get("connected_since", "")),
                "connected_for_minutes": session.get("connected_for_minutes"),
                "real_address": real_address,
                "virtual_address": str(session.get("virtual_address", "")),
                "source_file": str(session.get("source_file", "")),
                "endpoint_ip": ip_value,
                "endpoint_port": port,
                "geo": geo,
                "map_eligible": geo.get("latitude") is not None and geo.get("longitude") is not None,
            }
            enriched.append(row)

        return enriched
