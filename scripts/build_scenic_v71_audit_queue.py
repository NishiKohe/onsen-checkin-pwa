#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MASTER_PATH = DATA / "scenic-official-v71.json"
ZONES_PATH = DATA / "scenic-checkin-zones-v71.json"
OUT_PATH = DATA / "scenic-gps-audit-queue-v71.json"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    master = load(MASTER_PATH)
    zones = load(ZONES_PATH)
    by_id = {str(e["id"]): e for e in master.get("entries", [])}
    queue = []

    for zone_entry in zones.get("entries", []):
        if zone_entry.get("checkinEnabled"):
            continue
        sid = str(zone_entry.get("scenicId") or "")
        entry = by_id.get(sid)
        if not entry:
            raise RuntimeError(f"zone entry missing from master: {sid}")
        refs = zone_entry.get("zones") or []
        site_class = str(zone_entry.get("siteClass") or "")
        if not refs:
            audit_type = "missing_official_coordinate"
            priority = 1
            next_action = "Find a fixed public reference point from an official local-government or cultural-property source; then add one or more >=500m zones."
        elif site_class == "reference_only":
            audit_type = "single_reference_review"
            priority = 2
            next_action = "Review site extent. If the designation is spatially compact, enable a 750-1000m zone around the official point; otherwise convert to multiple zones."
        elif site_class == "broad":
            audit_type = "broad_multi_zone"
            priority = 3
            next_action = "Define multiple accessible representative zones from official component/site information. Use >=500m per zone; 1000-2500m is allowed for broad landscapes."
        else:
            audit_type = "other_pending"
            priority = 2
            next_action = "Review coordinate and site extent before enabling GPS."
        queue.append({
            "priority": priority,
            "auditType": audit_type,
            "scenicId": sid,
            "officialManageId": entry.get("officialManageId"),
            "name": entry.get("name"),
            "specialScenic": bool(entry.get("specialScenic")),
            "prefectures": entry.get("prefectures") or [],
            "location": entry.get("location") or "",
            "siteClass": site_class,
            "officialReferencePoints": refs,
            "sourceUrl": entry.get("sourceUrl"),
            "nextAction": next_action,
        })

    queue.sort(key=lambda e: (e["priority"], (e["prefectures"] or [""])[0], str(e["name"])))
    type_counts = Counter(e["auditType"] for e in queue)
    prefecture_counts = Counter(p for e in queue for p in e.get("prefectures", []))
    class_counts = Counter(e["siteClass"] for e in queue)
    by_type_examples = defaultdict(list)
    for e in queue:
        if len(by_type_examples[e["auditType"]]) < 12:
            by_type_examples[e["auditType"]].append({
                "scenicId": e["scenicId"],
                "name": e["name"],
                "prefectures": e["prefectures"],
                "location": e["location"],
            })

    expected_pending = int(zones.get("counts", {}).get("pendingMultiZoneOrAudit", -1))
    if len(queue) != expected_pending:
        raise RuntimeError(f"pending queue mismatch: queue={len(queue)} expected={expected_pending}")

    payload = {
        "version": 1,
        "dataset": "national_places_of_scenic_beauty_gps_audit_queue",
        "sourceMaster": "./data/scenic-official-v71.json",
        "sourceZones": "./data/scenic-checkin-zones-v71.json",
        "policy": {
            "minimumRadiusM": 500,
            "accuracyRequiredM": 500,
            "priorityOrder": ["missing_official_coordinate", "single_reference_review", "broad_multi_zone", "other_pending"],
            "note": "This queue is an engineering audit plan only. Items remain GPS-disabled until their generated zone record explicitly sets checkinEnabled=true."
        },
        "counts": {
            "pending": len(queue),
            "byAuditType": dict(sorted(type_counts.items())),
            "bySiteClass": dict(sorted(class_counts.items())),
            "byPrefecture": dict(sorted(prefecture_counts.items())),
        },
        "examples": dict(by_type_examples),
        "entries": queue,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["counts"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
