#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MASTER = DATA / "scenic-national-v70.json"
MANIFEST = DATA / "scenic-shards-v70.json"
OUTPUT = DATA / "scenic-catalog-audit-v70.json"
SEARCH_URL = "https://online.bunka.go.jp/heritages/search?genre_61=1&page={page}&sorttype=insert_asc"
SOURCE_LABEL = "国指定文化財等データベース（文化庁）"
PUNCT_RE = re.compile(r"[\s\u3000・･,，.。:：;；/／\\()（）\[\]［］{}「」『』<>〈〉《》\-―—_]+")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(value: str) -> str:
    s = unicodedata.normalize("NFKC", str(value or "")).lower()
    s = s.replace("ヶ", "ケ").replace("ヵ", "カ").replace("附", "付")
    s = s.replace("及び", "および").replace("並びに", "ならびに")
    s = s.replace("髙", "高").replace("﨑", "崎").replace("德", "徳")
    return PUNCT_RE.sub("", s)


def repo_catalog():
    master = load_json(MASTER)
    manifest = load_json(MANIFEST)
    rows = []
    for entry in master.get("entries", []):
        rows.append({"id": entry["id"], "name": entry["name"], "special": bool(entry.get("specialScenic")), "source": "master"})
    for meta in manifest.get("shards", []):
        rel = meta.get("url", "").replace("./", "")
        if not rel:
            continue
        shard = load_json(ROOT / rel)
        for entry in shard.get("entries", []):
            rows.append({"id": entry["id"], "name": entry["name"], "special": False, "source": rel})
        prefix = str(shard.get("idPrefix") or f"scenic_{shard.get('shardId', 'compact')}")
        for item in shard.get("compactEntries", []):
            if isinstance(item, list) and len(item) >= 2:
                rows.append({"id": f"{prefix}_{item[0]}", "name": str(item[1]), "special": False, "source": rel})
    return rows


def card_for_heading(h2):
    node = h2
    best = None
    for _ in range(8):
        node = getattr(node, "parent", None)
        if node is None:
            break
        text = " ".join(node.stripped_strings)
        if SOURCE_LABEL in text:
            best = node
            if len(text) < 1800:
                return node
    return best


def scrape_online():
    session = requests.Session()
    session.headers.update({"User-Agent": "onsen-checkin-pwa scenic catalog audit/1.0"})
    records = {}
    page_stats = []
    for page in range(1, 24):
        url = SEARCH_URL.format(page=page)
        response = session.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        page_count = 0
        for h2 in soup.find_all("h2"):
            name = " ".join(h2.stripped_strings).strip()
            if not name:
                continue
            link = h2.find("a", href=True)
            if link is None:
                link = h2.find_parent("a", href=True)
            if link is None:
                link = h2.find_next("a", href=True)
            detail_url = urljoin(url, link.get("href")) if link and link.get("href") else None
            card = card_for_heading(h2)
            if card is None:
                continue
            text = " ".join(card.stripped_strings)
            if SOURCE_LABEL not in text:
                continue
            # Registered scenic monuments use the distinct label 記念物(名勝); they are outside the 433 designated scenic sites.
            if "記念物(名勝)" in text:
                kind = "registered_scenic"
            elif "特別名勝" in text:
                kind = "special_scenic"
            elif "名勝" in text:
                kind = "ordinary_scenic"
            else:
                continue
            key = detail_url or f"{normalize(name)}:{kind}"
            records[key] = {"name": name, "normalizedName": normalize(name), "kind": kind, "detailUrl": detail_url, "cardText": text[:800]}
            page_count += 1
        page_stats.append({"page": page, "cards": page_count})
        print(f"page {page}: {page_count} national scenic cards")
    return list(records.values()), page_stats


def main():
    repo_rows = repo_catalog()
    online_rows, page_stats = scrape_online()

    repo_by_norm = {}
    duplicate_repo_ids = {}
    ids = {}
    for row in repo_rows:
        ids.setdefault(row["id"], []).append(row)
        repo_by_norm.setdefault(normalize(row["name"]), []).append(row)
    duplicate_repo_ids = {sid: vals for sid, vals in ids.items() if len(vals) > 1}

    designated = [r for r in online_rows if r["kind"] in ("ordinary_scenic", "special_scenic")]
    online_by_norm = {}
    for row in designated:
        online_by_norm.setdefault(row["normalizedName"], []).append(row)

    missing = []
    for norm, rows in sorted(online_by_norm.items()):
        if norm not in repo_by_norm:
            missing.extend(rows)
    extra = []
    for norm, rows in sorted(repo_by_norm.items()):
        if norm not in online_by_norm:
            extra.extend(rows)

    result = {
        "version": 1,
        "source": "文化遺産オンライン / 国指定文化財等データベース（文化庁）",
        "searchUrl": SEARCH_URL.replace("{page}", "1"),
        "repoRawRows": len(repo_rows),
        "repoUniqueIds": len(ids),
        "repoDuplicateIds": {sid: [{"name": v["name"], "source": v["source"]} for v in vals] for sid, vals in duplicate_repo_ids.items()},
        "onlineUniqueSearchRecords": len(online_rows),
        "onlineOrdinaryScenic": sum(1 for r in designated if r["kind"] == "ordinary_scenic"),
        "onlineSpecialScenic": sum(1 for r in designated if r["kind"] == "special_scenic"),
        "onlineDesignatedScenicTotal": len(designated),
        "onlineRegisteredScenicExcluded": sum(1 for r in online_rows if r["kind"] == "registered_scenic"),
        "missingInRepo": missing,
        "extraInRepo": extra,
        "pageStats": page_stats,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("AUDIT SUMMARY")
    print("repoRawRows", len(repo_rows), "repoUniqueIds", len(ids), "duplicateIds", list(duplicate_repo_ids))
    print("online designated", len(designated), "ordinary", result["onlineOrdinaryScenic"], "special", result["onlineSpecialScenic"], "registered excluded", result["onlineRegisteredScenicExcluded"])
    print("MISSING IN REPO")
    for row in missing:
        print(" +", row["kind"], row["name"], row["detailUrl"])
    print("EXTRA IN REPO")
    for row in extra:
        print(" -", row["name"], row["id"], row["source"])


if __name__ == "__main__":
    main()
