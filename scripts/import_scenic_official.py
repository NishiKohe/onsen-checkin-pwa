#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MASTER = DATA / "scenic-national-v70.json"
MANIFEST = DATA / "scenic-shards-v70.json"
OUT_MASTER = DATA / "scenic-official-v71.json"
OUT_ZONES = DATA / "scenic-checkin-zones-v71.json"

BASE = "https://kunishitei.bunka.go.jp"
CATEGORY_URL = BASE + "/bsys/categorylist?register_id=401"
SEARCH_URL = BASE + "/bsys/searchlist"
CSV_URL = BASE + "/utile/csv-list"
SOURCE_URL = "https://kunishitei.bunka.go.jp/bsys/categorylist?register_id=401"

PUNCT_RE = re.compile(r"[\s\u3000・･,，.。:：;；/／\\()（）\[\]［］{}「」『』<>〈〉《》\-―—_]+")
PREF_RE = re.compile(r"(北海道|東京都|京都府|大阪府|.{2,3}県)")
BROAD_TOKENS = (
    "海岸", "山", "岳", "峡", "渓", "湖", "島", "岬", "滝", "瀑", "松原", "岩", "洞", "湾",
    "河", "川", "高原", "丘", "砂丘", "浜", "浦", "森", "原", "サクラ", "桜", "梅林", "群", "連峰",
)
COMPACT_TOKENS = ("庭園", "橋", "湯畑")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(value: str) -> str:
    s = unicodedata.normalize("NFKC", str(value or "")).lower()
    s = s.replace("ヶ", "ケ").replace("ヵ", "カ").replace("附", "付")
    s = s.replace("及び", "および").replace("並びに", "ならびに")
    s = s.replace("髙", "高").replace("﨑", "崎").replace("德", "徳").replace("巖", "巌")
    return PUNCT_RE.sub("", s)


def loose_normalize(value: str) -> str:
    return normalize(value).replace("および", "").replace("ならびに", "").replace("付", "")


def legacy_catalog():
    rows = []
    master = load_json(MASTER)
    manifest = load_json(MANIFEST)
    for entry in master.get("entries", []):
        rows.append({
            "id": str(entry["id"]), "name": str(entry["name"]),
            "prefectures": list(entry.get("prefectures") or []), "special": bool(entry.get("specialScenic")),
        })
    for meta in manifest.get("shards", []):
        rel = str(meta.get("url") or "").replace("./", "")
        if not rel:
            continue
        shard = load_json(ROOT / rel)
        for entry in shard.get("entries", []):
            rows.append({
                "id": str(entry["id"]), "name": str(entry["name"]),
                "prefectures": list(entry.get("prefectures") or []), "special": False,
            })
        prefix = str(shard.get("idPrefix") or f"scenic_{shard.get('shardId', 'compact')}")
        for item in shard.get("compactEntries", []):
            if not isinstance(item, list) or len(item) < 3:
                continue
            prefs = item[2] if isinstance(item[2], list) else [item[2]]
            rows.append({"id": f"{prefix}_{item[0]}", "name": str(item[1]), "prefectures": [str(p) for p in prefs if p], "special": False})
    # Same legacy ID may have been accidentally repeated across shards. Keep it once here.
    dedup = {}
    for row in rows:
        dedup.setdefault(row["id"], row)
    return list(dedup.values())


def official_csv(session: requests.Session, kind: str):
    category = session.get(CATEGORY_URL, timeout=30)
    category.raise_for_status()
    soup = BeautifulSoup(category.text, "html.parser")
    form = None
    for candidate in soup.find_all("form"):
        if candidate.find("input", {"name": "entry_kind1_401[]", "value": kind}):
            form = candidate
            break
    if form is None:
        raise RuntimeError(f"official category form not found for {kind}")
    token = form.find("input", {"name": "_csrfToken"})["value"]
    query = [
        ("_method", "POST"), ("_csrfToken", token), ("register_sub_id", "401"),
        ("kind_page_check", "史跡名勝天然記念物"), ("entry_kind1_401[]", kind),
        ("sortTarget", "area"), ("sortType", "asc"),
    ]
    result = session.post(SEARCH_URL, data=query, timeout=30)
    result.raise_for_status()
    rs = BeautifulSoup(result.text, "html.parser")
    csv_form = next((f for f in rs.find_all("form") if (f.get("action") or "") == "/utile/csv-list"), None)
    if csv_form is None:
        raise RuntimeError(f"CSV form not found for {kind}")
    post = []
    for node in csv_form.find_all("input"):
        name = node.get("name")
        if name:
            post.append((name, node.get("value", "")))
    response = session.post(CSV_URL, data=post, timeout=120)
    response.raise_for_status()
    if "application/octet-stream" not in str(response.headers.get("content-type", "")):
        raise RuntimeError(f"unexpected CSV response for {kind}: {response.headers.get('content-type')}")
    text = response.content.decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    return rows


def prefectures_from_row(row: dict):
    raw = str(row.get("都道府県") or "").strip()
    if raw:
        return [raw]
    address = str(row.get("所在地") or "")
    return list(dict.fromkeys(PREF_RE.findall(address)))


def valid_coordinate(lat, lng):
    try:
        a, b = float(lat), float(lng)
        return 20.0 <= a <= 46.5 and 122.0 <= b <= 154.0
    except Exception:
        return False


def classify_site(name: str):
    if any(token in name for token in BROAD_TOKENS):
        if "庭園" not in name and "橋" not in name and "湯畑" not in name:
            return "broad", False, 1500
    if "庭園" in name:
        return "compact_garden", True, 750
    if "橋" in name:
        return "compact_bridge", True, 750
    if "湯畑" in name:
        return "compact_site", True, 750
    return "reference_only", False, 750


def choose_legacy_id(name: str, prefs: list[str], special: bool, legacy: list[dict], already_used: set[str]):
    target = normalize(name)
    loose = loose_normalize(name)
    prefset = set(prefs)
    pool = [r for r in legacy if bool(r["special"]) == special]

    exact = []
    for row in pool:
        if normalize(row["name"]) == target:
            exact.append(row)
    exact_ids = list(dict.fromkeys(r["id"] for r in exact if r["id"] not in already_used))
    if len(exact_ids) == 1:
        return exact_ids[0], "exact"

    candidates = []
    for row in pool:
        if row["id"] in already_used:
            continue
        row_loose = loose_normalize(row["name"])
        if len(row_loose) < 4:
            continue
        row_prefs = set(row.get("prefectures") or [])
        if prefset and row_prefs and not prefset.intersection(row_prefs):
            continue
        # Composite designations in the official CSV append component-site names to a shorter legacy title.
        if loose.startswith(row_loose) or row_loose.startswith(loose):
            candidates.append((min(len(loose), len(row_loose)), row))
    candidates.sort(key=lambda x: x[0], reverse=True)
    if candidates:
        best_len = candidates[0][0]
        best_ids = list(dict.fromkeys(r["id"] for score, r in candidates if score == best_len))
        if len(best_ids) == 1:
            return best_ids[0], "prefix_same_prefecture"
    return None, "new_official_id"


def main():
    session = requests.Session()
    session.headers.update({"User-Agent": "onsen-checkin-pwa official scenic importer/1.0"})
    ordinary = official_csv(session, "名勝")
    special = official_csv(session, "特別名勝")
    if len(ordinary) != 397:
        raise RuntimeError(f"ordinary scenic official CSV must be 397 rows; got {len(ordinary)}")
    if len(special) != 36:
        raise RuntimeError(f"special scenic official CSV must be 36 rows; got {len(special)}")

    legacy = legacy_catalog()
    used_ids: set[str] = set()
    records = []
    zones = []
    match_counts = defaultdict(int)

    for is_special, rows in ((False, ordinary), (True, special)):
        for row in rows:
            manage_id = str(row.get("管理対象ID") or "").strip()
            name = str(row.get("名称") or "").strip()
            if not manage_id or not name:
                raise RuntimeError(f"missing official ID/name: {row}")
            prefs = prefectures_from_row(row)
            legacy_id, match_mode = choose_legacy_id(name, prefs, is_special, legacy, used_ids)
            stable_id = legacy_id or f"scenic_bunka_401_{manage_id}"
            if stable_id in used_ids:
                stable_id = f"scenic_bunka_401_{manage_id}"
                match_mode = "collision_fallback"
            if stable_id in used_ids:
                raise RuntimeError(f"duplicate final scenic id {stable_id}")
            used_ids.add(stable_id)
            match_counts[match_mode] += 1

            lat_raw, lng_raw = row.get("緯度"), row.get("経度")
            has_coord = valid_coordinate(lat_raw, lng_raw)
            lat = float(lat_raw) if has_coord else None
            lng = float(lng_raw) if has_coord else None
            site_class, compact_enabled, radius = classify_site(name)
            gps_enabled = bool(has_coord and compact_enabled)
            official_kind = str(row.get("種別1") or ("特別名勝" if is_special else "名勝"))
            record = {
                "id": stable_id,
                "officialManageId": manage_id,
                "name": name,
                "designation": official_kind,
                "specialScenic": is_special,
                "prefectures": prefs,
                "location": str(row.get("所在地") or "").strip(),
                "designatedDate": str(row.get("重文指定年月日") or "").strip() or None,
                "lat": lat,
                "lng": lng,
                "coordinateStatus": "official_csv" if has_coord else "official_no_coordinate",
                "verificationStatus": "official_csv",
                "legacyMatch": match_mode,
                "sourceUrl": f"https://kunishitei.bunka.go.jp/heritage/detail/401/{manage_id}",
            }
            records.append(record)
            zone_entry = {
                "scenicId": stable_id,
                "officialManageId": manage_id,
                "name": name,
                "prefectures": prefs,
                "siteClass": site_class,
                "coordinateStatus": record["coordinateStatus"],
                "checkinEnabled": gps_enabled,
                "zones": [],
            }
            if has_coord:
                zone_entry["zones"].append({
                    "id": "official_ref_1",
                    "label": "文化庁DB公式参照点",
                    "lat": lat,
                    "lng": lng,
                    "radiusM": max(500, radius),
                    "accuracyRequiredM": 500,
                    "source": "国指定文化財等データベースCSV",
                    "sourceUrl": record["sourceUrl"],
                })
            zones.append(zone_entry)

    if len(records) != 433 or len(used_ids) != 433:
        raise RuntimeError(f"final scenic master must have 433 unique entries; got records={len(records)} ids={len(used_ids)}")

    coordinate_count = sum(1 for r in records if r["lat"] is not None)
    gps_count = sum(1 for z in zones if z["checkinEnabled"])
    today = datetime.now(timezone.utc).date().isoformat()
    master_payload = {
        "version": 1,
        "dataset": "national_places_of_scenic_beauty_official",
        "asOf": today,
        "source": {"name": "国指定文化財等データベース（文化庁）", "url": SOURCE_URL, "method": "filtered CSV export"},
        "counts": {"ordinary": 397, "special": 36, "total": 433, "uniqueIds": 433, "officialCoordinates": coordinate_count},
        "legacyMatchCounts": dict(sorted(match_counts.items())),
        "entries": records,
    }
    zones_payload = {
        "version": 1,
        "dataset": "national_places_of_scenic_beauty_checkin_zones",
        "asOf": today,
        "source": {"name": "国指定文化財等データベース（文化庁）", "url": SOURCE_URL, "method": "filtered CSV export"},
        "policy": {
            "minimumRadiusM": 500,
            "accuracyRequiredM": 500,
            "compactAutoEnable": "庭園・橋・湯畑のみ。公式CSV座標を750m判定で使用",
            "broadRule": "山・峡谷・海岸・湖・島などは公式参照点を地図表示に使うが、複数zone監査までGPSチェックイン無効",
        },
        "counts": {"entries": 433, "officialCoordinates": coordinate_count, "gpsEnabled": gps_count, "pendingMultiZoneOrAudit": 433 - gps_count},
        "entries": zones,
    }
    OUT_MASTER.write_text(json.dumps(master_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_ZONES.write_text(json.dumps(zones_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("OFFICIAL IMPORT COMPLETE")
    print(json.dumps(master_payload["counts"], ensure_ascii=False))
    print("legacyMatchCounts", dict(match_counts))
    print("gpsEnabled", gps_count)


if __name__ == "__main__":
    main()
