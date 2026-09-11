(() => {
  const BUILD = "v73.1";

  const ascii = (view, offset, length) => {
    if (offset < 0 || offset + length > view.byteLength) return "";
    let out = "";
    for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
    return out;
  };

  function typeSize(type) {
    return ({ 1:1, 2:1, 3:2, 4:4, 5:8, 7:1, 9:4, 10:8 })[Number(type)] || 1;
  }

  function readIfd(view, tiffStart, offset, little) {
    const result = new Map();
    const base = tiffStart + Number(offset || 0);
    if (base < 0 || base + 2 > view.byteLength) return result;
    const count = view.getUint16(base, little);
    for (let i = 0; i < count; i += 1) {
      const p = base + 2 + i * 12;
      if (p + 12 > view.byteLength) break;
      const tag = view.getUint16(p, little);
      const type = view.getUint16(p + 2, little);
      const countValue = view.getUint32(p + 4, little);
      const bytes = typeSize(type) * countValue;
      const valueOffset = bytes <= 4 ? (p + 8 - tiffStart) : view.getUint32(p + 8, little);
      result.set(tag, { type, count: countValue, offset: valueOffset, bytes });
    }
    return result;
  }

  function absoluteOffset(entry, tiffStart) {
    return entry ? tiffStart + Number(entry.offset || 0) : -1;
  }

  function valueAsUint(entry, view, tiffStart, little) {
    if (!entry) return 0;
    const p = absoluteOffset(entry, tiffStart);
    if (p < 0 || p >= view.byteLength) return 0;
    if (entry.type === 3 && p + 2 <= view.byteLength) return view.getUint16(p, little);
    if ((entry.type === 4 || entry.type === 9) && p + 4 <= view.byteLength) return view.getUint32(p, little);
    return 0;
  }

  function valueAsAscii(entry, view, tiffStart) {
    if (!entry || entry.type !== 2) return "";
    const p = absoluteOffset(entry, tiffStart);
    const length = Math.max(0, Math.min(Number(entry.count || 0), view.byteLength - p));
    return ascii(view, p, length).replace(/\0+$/, "").trim();
  }

  function valueAsRationals(entry, view, tiffStart, little) {
    if (!entry || ![5,10].includes(entry.type)) return [];
    const p = absoluteOffset(entry, tiffStart);
    const out = [];
    for (let i = 0; i < Number(entry.count || 0); i += 1) {
      const q = p + i * 8;
      if (q + 8 > view.byteLength) break;
      const signed = entry.type === 10;
      const numerator = signed ? view.getInt32(q, little) : view.getUint32(q, little);
      const denominator = signed ? view.getInt32(q + 4, little) : view.getUint32(q + 4, little);
      if (!denominator) continue;
      out.push(numerator / denominator);
    }
    return out;
  }

  function parseExifDate(text) {
    const match = String(text || "").match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    const [, y, m, d, hh, mm, ss] = match.map(Number);
    const value = new Date(y, m - 1, d, hh, mm, ss).getTime();
    return Number.isFinite(value) ? value : null;
  }

  function parseTiffExif(view, tiffStart) {
    if (tiffStart + 8 > view.byteLength) throw new Error("invalid tiff header");
    const order = ascii(view, tiffStart, 2);
    const little = order === "II";
    if (!little && order !== "MM") throw new Error("bad tiff byte order");
    const u16 = (o) => view.getUint16(tiffStart + o, little);
    const u32 = (o) => view.getUint32(tiffStart + o, little);
    if (u16(2) !== 42) throw new Error("bad tiff magic");

    const ifd0 = readIfd(view, tiffStart, u32(4), little);
    const gpsOffset = valueAsUint(ifd0.get(0x8825), view, tiffStart, little);
    const exifOffset = valueAsUint(ifd0.get(0x8769), view, tiffStart, little);
    let lat = null, lng = null, takenAt = null, originalDateText = null;

    if (gpsOffset) {
      const gps = readIfd(view, tiffStart, gpsOffset, little);
      const latRef = valueAsAscii(gps.get(0x0001), view, tiffStart);
      const lngRef = valueAsAscii(gps.get(0x0003), view, tiffStart);
      const latValues = valueAsRationals(gps.get(0x0002), view, tiffStart, little);
      const lngValues = valueAsRationals(gps.get(0x0004), view, tiffStart, little);
      if (latValues.length >= 3 && lngValues.length >= 3) {
        lat = latValues[0] + latValues[1] / 60 + latValues[2] / 3600;
        lng = lngValues[0] + lngValues[1] / 60 + lngValues[2] / 3600;
        if (latRef.toUpperCase() === "S") lat *= -1;
        if (lngRef.toUpperCase() === "W") lng *= -1;
      }
    }

    if (exifOffset) {
      const exif = readIfd(view, tiffStart, exifOffset, little);
      originalDateText = valueAsAscii(exif.get(0x9003), view, tiffStart) || valueAsAscii(exif.get(0x9004), view, tiffStart);
      takenAt = parseExifDate(originalDateText);
    }
    return { lat, lng, takenAt, originalDateText };
  }

  async function readGps(file) {
    if (!file?.arrayBuffer) throw new Error("invalid file");
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) throw new Error("not jpeg");
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) { offset += 1; continue; }
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(offset + 2, false);
      if (length < 2 || offset + 2 + length > view.byteLength) break;
      if (marker === 0xe1 && length >= 8 && ascii(view, offset + 4, 6) === "Exif\u0000\u0000") {
        return parseTiffExif(view, offset + 10);
      }
      offset += 2 + length;
    }
    return null;
  }

  window.OnsenPhotoExifV731 = { build: BUILD, readGps };
  window.dispatchEvent(new CustomEvent("onsen-photo-exif-ready", { detail: { build: BUILD } }));
})();