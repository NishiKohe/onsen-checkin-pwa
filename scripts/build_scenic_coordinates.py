#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MASTER_PATH = DATA / "scenic-national-v70.json"
MANIFEST_PATH = DATA / "scenic-shards-v70.json"
OUT_PATH = DATA / "scenic-checkin-zones-v70.json"

PREF_SLUGS = {
    "北海道":"hokkaido","青森県":"aomori","岩手県":"iwate","宮城県":"miyagi","秋田県":"akita","山形県":"yamagata","福島県":"fukushima",
    "茨城県":"ibaraki","栃木県":"tochigi","群馬県":"gunma","埼玉県":"saitama","千葉県":"chiba","東京都":"tokyo","神奈川県":"kanagawa",
    "新潟県":"niigata","富山県":"toyama","石川県":"ishikawa","福井県":"fukui","山梨県":"yamanashi","長野県":"nagano",
    "岐阜県":"gifu","静岡県":"shizuoka","愛知県":"aichi","三重県":"mie",
    "滋賀県":"shiga","京都府":"kyoto","大阪府":"osaka","兵庫県":"hyogo","奈良県":"nara","和歌山県":"wakayama",
    "鳥取県":"tottori","島根県":"shimane","岡山県":"okayama","広島県":"hiroshima","山口県":"yamaguchi",
    "徳島県":"tokushima","香川県":"kagawa","愛媛県":"ehime","高知県":"kochi",
    "福岡県":"fukuoka","佐賀県":"saga","長崎県":"nagasaki","熊本県":"kumamoto","大分県":"oita","宮崎県":"miyazaki","鹿児島県":"kagoshima","沖縄県":"okinawa",
}

COORD_RE = re.compile(r"(?<!\d)(2[0-9]|3[0-9]|4[0-6])\.\d{3,}\s+((?:12[2-9]|13[0-9]|14[0-9]|15[0-4])\.\d{3,})(?!\d)")
PUNCT_RE = re.compile(r"[\s\u3000・･,，.。:：;；/／\\()（）\[\]［］{}「」『』<>〈〉《》\-―—_]+")

# Compact sites can safely use the official/reference point with a generous radius.
# Broad natural landscapes are map-only until multiple check-in zones are manually audited.
COMPACT_TOKENS = ("庭園", "橋", "園地", "泉", "井泉")
BROAD_TOKENS = ("峡", "渓", "海岸", "湖", "山", "岳", "島", "松原", "滝", "瀑", "岬", "浜", "浦", "湾", "河", "川", "高原", "丘", "岩", "洞", "瀬", "群", "連峰", "温泉")


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def normalize(value: str) -> str:
    s = unicodedata.normalize("NFKC", str(value or "")).lower()
    s = s.replace("ヶ", "ケ").replace("ヵ", "カ").replace("附", "付")
    s = s.replace("及び", "および").replace("並びに", "ならびに")
    return PUNCT_RE.sub("", s)


def expand_catalog():
    master = load_json(MASTER_PATH)
    manifest = load_json(MANIFEST_PATH)
    by_id: dict[str, dict] = {}
    for entry in master.get("entries", []):
        if entry.get("id"):
            by_id[entry["id"]] = dict(entry)
    for shard_meta in manifest.get("shards", []):
        rel = shard_meta.get("url", "").replace("./", "")
        if not rel:
            continue
        shard = load_json(ROOT / rel)
        for entry in shard.get("entries", []):
            if entry.get("id"):
                by_id[entry["id"]] = dict(entry)
        prefix = str(shard.get("idPrefix") or f"scenic_{shard.get('shardId', 'compact')}")
        for row in shard.get("compactEntries", []):
            if not isinstance(row, list) or len(row) < 3:
                continue
            key, name, raw_prefs = row[:3]
            prefs = raw_prefs if isinstance(raw_prefs, list) else [raw_prefs]
            sid = f"{prefix}_{key}"
            by_id[sid] = {
                "id": sid,
                "name": str(name),
                "designation": "名勝",
                "prefectures": [str(p) for p in prefs if p],
                "specialScenic": False,
            }
    entries = list(by_id.values())
    special = sum(1 for e in entries if e.get("specialScenic"))
    ordinary = len(entries) - special
    if len(entries) != 433 or ordinary != 397 or special != 36:
        raise RuntimeError(f"catalog count mismatch: total={len(entries)} ordinary={ordinary} special={special}")
    return entries


def fetch_pref_rows(pref: str, slug: str):
    url = f"https://japan-geographic.tv/index-cultural-{slug}.html"
    response = requests.get(url, timeout=30, headers={"User-Agent":"onsen-checkin-pwa scenic coordinate builder/1.0"})
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    soup = BeautifulSoup(response.text, "html.parser")
    rows = []
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if not cells:
            continue
        joined = " ".join(cells)
        if "名勝" not in joined:
            continue
        matches = list(COORD_RE.finditer(joined))
        if not matches:
            continue
        m = matches[-1]
        lat, lng = float(m.group(1) + joined[m.start(1)+2:m.end(1)]) if False else float(m.group(0).split()[0]), float(m.group(2))
        if not (20 <= lat <= 46.5 and 122 <= lng <= 154):
            continue
        rows.append({"cells": cells, "norm_cells": [normalize(c) for c in cells], "text": joined, "lat": lat, "lng": lng, "sourceUrl": url})
    return rows


def site_class(name: str):
    if any(token in name for token in BROAD_TOKENS):
        # A garden name may contain a temple mountain name; explicit garden wins.
        if "庭園" not in name:
            return "broad_natural", False, 1500
    if "庭園" in name:
        return "compact_garden", True, 750
    if "橋" in name:
        return "compact_bridge", True, 750
    if any(token in name for token in COMPACT_TOKENS):
        return "compact_site", True, 750
    return "reference_only", False, 750


def match_entry(entry: dict, rows_by_pref: dict[str, list[dict]]):
    target = normalize(entry.get("name", ""))
    if not target:
        return None
    candidates = []
    for pref in entry.get("prefectures") or []:
        for row in rows_by_pref.get(pref, []):
            exact = target in row["norm_cells"]
            contains = any(target in cell or (len(cell) >= 4 and cell in target) for cell in row["norm_cells"] if cell)
            if exact:
                score = 100
            elif contains:
                score = 82
            else:
                continue
            candidates.append((score, row))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score = candidates[0][0]
    best = [row for score, row in candidates if score == best_score]
    # Multiple exact rows can occur where one designation has several published reference points.
    unique = []
    seen = set()
    for row in best:
        key = (round(row["lat"], 7), round(row["lng"], 7))
        if key not in seen:
            seen.add(key)
            unique.append(row)
    return {"score": best_score, "rows": unique[:12]}


def main():
    entries = expand_catalog()
    rows_by_pref = {}
    failures = []
    for pref, slug in PREF_SLUGS.items():
        try:
            rows_by_pref[pref] = fetch_pref_rows(pref, slug)
            print(f"{pref}: {len(rows_by_pref[pref])} scenic coordinate rows")
        except Exception as exc:
            rows_by_pref[pref] = []
            failures.append({"prefecture": pref, "error": str(exc)})
            print(f"WARN {pref}: {exc}", file=sys.stderr)

    output_entries = []
    unmatched = []
    enabled = 0
    for entry in entries:
        match = match_entry(entry, rows_by_pref)
        if not match:
            unmatched.append({"id": entry["id"], "name": entry["name"], "prefectures": entry.get("prefectures", [])})
            continue
        klass, allow_checkin, radius = site_class(entry["name"])
        zones = []
        for idx, row in enumerate(match["rows"]):
            zones.append({
                "id": f"ref_{idx+1}",
                "label": "文化庁DB由来参照点" if len(match["rows"]) == 1 else f"文化庁DB由来参照点{idx+1}",
                "lat": row["lat"],
                "lng": row["lng"],
                "radiusM": max(500, radius),
                "accuracyRequiredM": 500,
                "sourceUrl": row["sourceUrl"],
            })
        if allow_checkin and match["score"] >= 100:
            enabled += 1
        output_entries.append({
            "scenicId": entry["id"],
            "name": entry["name"],
            "prefectures": entry.get("prefectures", []),
            "siteClass": klass,
            "coordinateStatus": "source_matched",
            "matchConfidence": "exact" if match["score"] >= 100 else "normalized_contains",
            "checkinEnabled": bool(allow_checkin and match["score"] >= 100),
            "zones": zones,
        })

    payload = {
        "version": 1,
        "dataset": "national_places_of_scenic_beauty_checkin_zones",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "catalogTotal": 433,
        "referencePointEntries": len(output_entries),
        "gpsEnabledEntries": enabled,
        "unmatchedEntries": len(unmatched),
        "policy": {
            "minimumRadiusM": 500,
            "accuracyRequiredM": 500,
            "broadNaturalRule": "single reference points are map-only until multi-zone manual audit",
            "compactRule": "exact name matches for gardens/bridges may enable GPS at 750m",
        },
        "sources": [
            {
                "name": "Japan Geographic cultural-property pages",
                "role": "coordinate mirror / bootstrap",
                "note": "Coordinates are cross-matched by exact normalized name and prefecture. The pages reproduce cultural-property coordinate tables; broad natural sites remain map-only pending multi-zone audit.",
            }
        ],
        "entries": output_entries,
        "unmatched": unmatched,
        "fetchFailures": failures,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH}: refs={len(output_entries)} gps={enabled} unmatched={len(unmatched)} failures={len(failures)}")


if __name__ == "__main__":
    main()
