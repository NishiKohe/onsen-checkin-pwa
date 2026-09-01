#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MASTER_PATH = DATA / "scenic-official-v71.json"
ZONES_PATH = DATA / "scenic-checkin-zones-v71.json"

# Conservative one-point promotion rules. These are applied only when Culture Agency CSV
# already supplies exactly one official coordinate and the importer classified the item as
# reference_only. Broad/natural classifications are never promoted here.
RULES = (
    ("public_park", lambda n: "公園" in n, 2000),
    ("named_garden_enclosure", lambda n: (n.endswith("園") or n.endswith("苑") or "神苑" in n or "植物園" in n), 1000),
    ("archaeological_site", lambda n: "遺跡" in n, 1000),
    ("historic_site_suffix", lambda n: n.endswith("跡"), 1000),
    ("residence_site", lambda n: any(t in n for t in ("旧宅", "別邸", "屋敷", "邸跡")), 750),
)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def choose_rule(name: str):
    first_line = str(name or "").splitlines()[0].strip()
    for rule_id, predicate, radius in RULES:
        if predicate(first_line):
            return rule_id, radius
    return None


def main():
    master = load(MASTER_PATH)
    zones = load(ZONES_PATH)
    master_ids = {str(e["id"]) for e in master.get("entries", [])}
    promoted = []

    for entry in zones.get("entries", []):
        sid = str(entry.get("scenicId") or "")
        if sid not in master_ids:
            raise RuntimeError(f"unknown scenic ID in zones: {sid}")
        if entry.get("checkinEnabled") or entry.get("siteClass") != "reference_only":
            continue
        zlist = entry.get("zones") or []
        if len(zlist) != 1:
            continue
        selected = choose_rule(str(entry.get("name") or ""))
        if not selected:
            continue
        rule_id, radius = selected
        zone = zlist[0]
        zone["radiusM"] = max(500, int(radius))
        zone["accuracyRequiredM"] = max(500, int(zone.get("accuracyRequiredM") or 500))
        entry["checkinEnabled"] = True
        entry["siteClass"] = f"reviewed_{rule_id}"
        entry["auditStatus"] = "rule_reviewed_single_official_reference"
        entry["auditRule"] = rule_id
        entry["auditNote"] = "Culture Agency official coordinate; compact/single-site naming rule reviewed for one-point GPS use."
        promoted.append({"scenicId": sid, "name": entry.get("name"), "rule": rule_id, "radiusM": zone["radiusM"]})

    enabled = sum(1 for e in zones.get("entries", []) if e.get("checkinEnabled"))
    zones.setdefault("counts", {})["gpsEnabled"] = enabled
    zones["counts"]["pendingMultiZoneOrAudit"] = len(zones.get("entries", [])) - enabled
    zones["singleReferencePromotion"] = {
        "version": 1,
        "promotedCount": len(promoted),
        "rules": [{"id": rid, "radiusM": radius} for rid, _, radius in RULES],
        "entries": promoted,
    }
    ZONES_PATH.write_text(json.dumps(zones, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"promoted={len(promoted)} gpsEnabled={enabled} pending={zones['counts']['pendingMultiZoneOrAudit']}")
    for row in promoted:
        print(row["rule"], row["radiusM"], str(row["name"]).replace("\n", " / "))


if __name__ == "__main__":
    main()
