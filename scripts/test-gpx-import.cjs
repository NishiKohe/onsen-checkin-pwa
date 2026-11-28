"use strict";
const assert = require("node:assert/strict");
const { matchPoints, mergeCandidates } = require("../trip-gpx-import.js");
const time = Date.parse("2026-11-20T03:00:00Z"), point = { lat: 35, lng: 139, time };
const entry = (entityType, id, lat = 35) => ({ entityType, entityId: id, name: id, zones: [{ lat, lng: 139, radiusM: 500 }] });
const catalog = [entry("onsen", "o"), entry("castle", "c"), { ...entry("scenic", "s"), zones: [{ lat: 34, lng: 139, radiusM: 500 }, { lat: 35, lng: 139, radiusM: 500 }] }];
const matches = matchPoints([point, { ...point, time: time + 60000 }, { ...point, lat: 45 }], catalog);
assert.equal(matches.length, 3);
for (const m of matches) {
  assert.equal(m.strength, "gpx_in_range"); assert.equal(m.source, "gpx_import");
  assert.equal(m.accuracyM, null); assert.equal(m.status, "pending");
  assert.equal(m.evidence[0].accuracyKnown, false); assert.equal(m.detectedAt, time);
}
assert.equal(matchPoints([{ ...point, time: time + 86400000 }, point], catalog).length, 6);
const nearby = matchPoints([{ ...point, lat: 35.006 }], [catalog[0]])[0];
assert.equal(nearby.strength, "gpx_nearby");
assert.equal(matchPoints([{ ...point, lat: 35.02 }], catalog).length, 0);
// A sparse track never acquires places between the actual recorded samples.
assert.equal(matchPoints([{ ...point, lat: 34 }, { ...point, lat: 36 }], [catalog[0]]).length, 0);
const first = mergeCandidates([], matches);
assert.equal(first.added, 3); assert.equal(mergeCandidates(first.candidates, matches).added, 0);
const before = JSON.stringify(first.candidates);
const confirmed = first.candidates.map(x => ({ ...x, status: "confirmed" }));
assert.equal(mergeCandidates(confirmed, matches).updated, 0);
const dismissed = first.candidates.map(x => ({ ...x, status: "dismissed" }));
assert.equal(mergeCandidates(dismissed, matches).added, 0);
const closer = mergeCandidates([nearby], [matches[0]]);
assert.equal(closer.updated, 1); assert.equal(closer.candidates[0].strength, "gpx_in_range");
assert.equal(JSON.stringify(first.candidates), before);
assert.equal(mergeCandidates([{ id: matches[0].id, source: "photo_exif", status: "pending" }], matches).updated, 0);
console.log("PASS GPX matching: 3 domains, multizone, range/nearby, dates, no interpolation, repeat imports, resolved history and immutable merge");
