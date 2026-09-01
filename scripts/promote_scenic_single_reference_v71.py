#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MASTER_PATH = DATA / "scenic-official-v71.json"
ZONES_PATH = DATA / "scenic-checkin-zones-v71.json"

# Conservative lexical one-point promotion rules. These are applied only when Culture Agency
# CSV already supplies exactly one official coordinate and the importer classified the item as
# reference_only. Clearly broad/composite items are explicitly diverted to multi-zone audit.
RULES = (
    ("public_park", lambda n: "公園" in n, 2000),
    ("named_garden_enclosure", lambda n: (n.endswith("園") or n.endswith("苑") or "神苑" in n or "植物園" in n), 1000),
    ("archaeological_site", lambda n: "遺跡" in n, 1000),
    ("historic_site_suffix", lambda n: n.endswith("跡"), 1000),
    ("residence_site", lambda n: any(t in n for t in ("旧宅", "別邸", "屋敷", "邸跡")), 750),
)

# Explicitly reviewed official single-reference sites. Radius is deliberately generous because
# this app prioritizes avoiding false negatives; 500m remains the absolute floor.
CURATED_SINGLE = {
    "scenic_ord_kinki_052": ("curated_hill_site", 1500),          # 雙ヶ岡
    "scenic_noike": ("curated_pond_site", 1000),                 # 納池
    "scenic_ord_kinki_086": ("curated_archaeological_pond", 1000),# 飛鳥京跡苑池
    "scenic_banji": ("curated_cliff_site", 2000),                # 磐司
    "scenic_ord_kyushu_035": ("curated_coastal_shrine_area", 2000),# 鵜戸
    "scenic_ord_chushi_052": ("curated_coastal_point", 1500),    # 龍宮の潮吹
    "scenic_ord_chushi_016": ("curated_sea_cave_area", 2000),    # 潜戸
    "scenic_ord_chushi_018": ("curated_gorge_area", 2500),       # 立久恵
    "scenic_ord_chushi_014": ("curated_tea_garden", 750),        # 菅田庵
    "scenic_ord_chushi_012": ("curated_headland", 1500),         # 隠岐海苔田ノ鼻
    "scenic_ord_chushi_009": ("curated_cliff_viewpoint", 1500),  # 隠岐知夫赤壁
    "scenic_ord_chushi_013": ("curated_gorge_area", 2500),       # 鬼舌振
    "scenic_ord_chushi_056": ("curated_strait_viewpoint", 2500), # 鳴門
    "scenic_tashiro_nanatsugama": ("curated_gorge_area", 2500),  # 田代の七ツ釜
    "scenic_ord_kyushu_054": ("curated_viewpoint", 1500),        # サンニヌ台
    "scenic_ord_kyushu_052": ("curated_viewpoint", 1500),        # ティンダバナ
    "scenic_ord_kyushu_047": ("curated_cape", 2000),             # 東平安名崎
    "scenic_shiroyone_senmaida": ("curated_terrace_landscape", 1500),# 白米の千枚田
    "scenic_shinsenkyo": ("curated_garden_area", 1000),          # 神仙郷
    "scenic_tojinbo": ("curated_coastal_cliff", 2000),           # 東尋坊
    "scenic_tsutsujigaoka": ("curated_flower_landscape", 1500), # 躑躅ヶ岡（ツツジ）
    "scenic_obasute_tagoto": ("curated_terrace_landscape", 2500),# 姨捨（田毎の月）
    "scenic_nezame_no_toko": ("curated_gorge_area", 2000),       # 寝覚の床
    "scenic_kanehiranarien": ("curated_garden_area", 1000),      # 金平成園（澤成園）
    "scenic_ord_tokai_011": ("curated_plateau_viewpoint", 2500), # 日本平
    "scenic_ord_tokai_016": ("curated_park_enclosure", 1500),    # 旧沼津御用邸苑地
    "scenic_mannoike": ("curated_reservoir", 2500),              # 満濃池
}

# One Culture Agency reference point is not enough for these composite or very broad assets.
# They remain disabled until representative accessible zones are individually defined.
FORCE_MULTI_ZONE = {
    "scenic_ord_tokai_026",      # 熊野の鬼ケ城 附 獅子巖
    "scenic_bunka_401_1682",     # 琉璃溪
    "scenic_nagatoro",           # 長瀞
    "scenic_ord_kyushu_025",     # 別府の地獄
    "scenic_ord_kyushu_028",     # 天念寺耶馬及び無動寺耶馬
    "scenic_ord_chushi_024",     # 磐窟谷
    "scenic_ord_chushi_026",     # 鬼ヶ嶽
    "scenic_ord_chushi_017",     # 千丈溪
    "scenic_bunka_401_2186",     # 断魚溪
    "scenic_ord_chushi_057",     # 大歩危小歩危
    "scenic_ord_kyushu_053",     # アマミクヌムイ
    "scenic_ord_kyushu_051",     # 久部良バリ及び久部良フリシ
    "scenic_ord_kyushu_048",     # 八重干瀬
    "scenic_ord_kyushu_014",     # 三井楽（みみらくのしま）
    "scenic_kamikochi",          # 上高地
    "scenic_ord_kyushu_040",     # 坊津
    "scenic_dorohatcho",         # 瀞八丁
}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def choose_rule(name: str):
    first_line = str(name or "").splitlines()[0].strip()
    for rule_id, predicate, radius in RULES:
        if predicate(first_line):
            return rule_id, radius
    return None


def enable_single(entry: dict, rule_id: str, radius: int, source: str, promoted: list[dict]):
    zlist = entry.get("zones") or []
    if len(zlist) != 1:
        return False
    zone = zlist[0]
    zone["radiusM"] = max(500, int(radius))
    zone["accuracyRequiredM"] = max(500, int(zone.get("accuracyRequiredM") or 500))
    entry["checkinEnabled"] = True
    entry["siteClass"] = f"reviewed_{rule_id}"
    entry["auditStatus"] = "reviewed_single_official_reference"
    entry["auditRule"] = rule_id
    entry["auditNote"] = "Culture Agency official coordinate reviewed for one-point GPS use with a false-negative-resistant radius."
    promoted.append({
        "scenicId": str(entry.get("scenicId") or ""),
        "name": entry.get("name"),
        "rule": rule_id,
        "radiusM": zone["radiusM"],
        "source": source,
    })
    return True


def main():
    master = load(MASTER_PATH)
    zones = load(ZONES_PATH)
    master_ids = {str(e["id"]) for e in master.get("entries", [])}
    promoted: list[dict] = []
    forced_multi: list[dict] = []

    for entry in zones.get("entries", []):
        sid = str(entry.get("scenicId") or "")
        if sid not in master_ids:
            raise RuntimeError(f"unknown scenic ID in zones: {sid}")
        if entry.get("checkinEnabled"):
            continue

        if sid in FORCE_MULTI_ZONE:
            entry["siteClass"] = "broad"
            entry["auditStatus"] = "explicit_multi_zone_review_required"
            entry["auditRule"] = "curated_multi_zone_required"
            entry["auditNote"] = "Composite or broad scenic asset: keep GPS disabled until multiple representative accessible zones are reviewed."
            forced_multi.append({"scenicId": sid, "name": entry.get("name")})
            continue

        curated = CURATED_SINGLE.get(sid)
        if curated:
            rule_id, radius = curated
            enable_single(entry, rule_id, radius, "curated_id_review", promoted)
            continue

        if entry.get("siteClass") != "reference_only":
            continue
        selected = choose_rule(str(entry.get("name") or ""))
        if not selected:
            continue
        rule_id, radius = selected
        enable_single(entry, rule_id, radius, "lexical_review", promoted)

    enabled = sum(1 for e in zones.get("entries", []) if e.get("checkinEnabled"))
    zones.setdefault("counts", {})["gpsEnabled"] = enabled
    zones["counts"]["pendingMultiZoneOrAudit"] = len(zones.get("entries", [])) - enabled
    zones["singleReferencePromotion"] = {
        "version": 2,
        "promotedCount": len(promoted),
        "curatedPromotedCount": sum(1 for e in promoted if e["source"] == "curated_id_review"),
        "lexicalPromotedCount": sum(1 for e in promoted if e["source"] == "lexical_review"),
        "forcedMultiZoneCount": len(forced_multi),
        "rules": [{"id": rid, "radiusM": radius} for rid, _, radius in RULES],
        "curatedSingles": [{"scenicId": sid, "rule": rule, "radiusM": radius} for sid, (rule, radius) in CURATED_SINGLE.items()],
        "forcedMultiZone": forced_multi,
        "entries": promoted,
    }
    ZONES_PATH.write_text(json.dumps(zones, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"promoted={len(promoted)} gpsEnabled={enabled} pending={zones['counts']['pendingMultiZoneOrAudit']} forcedMulti={len(forced_multi)}")
    for row in promoted:
        print(row["source"], row["rule"], row["radiusM"], str(row["name"]).replace("\n", " / "))
    for row in forced_multi:
        print("multi_zone", row["scenicId"], str(row["name"]).replace("\n", " / "))


if __name__ == "__main__":
    main()
