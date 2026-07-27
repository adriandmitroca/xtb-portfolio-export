// gRPC-Web frame parsing + generic protobuf decoding.
// Runs in the MAIN world (document_start). No app schema needed: decodes
// protobuf structurally (field-number -> value) and a small semantic mapper
// layer names the fields we care about. Nothing here touches auth tokens.
(function () {
  'use strict';

  const UTF8 = new TextDecoder('utf-8', { fatal: true });

  // gRPC-Web wire: [1 flag byte][4-byte big-endian length][payload], repeated.
  // Data frames have flag & 0x80 === 0; the trailer frame has flag 0x80.
  function grpcFrames(u8) {
    const frames = [];
    let p = 0;
    while (p + 5 <= u8.length) {
      const flag = u8[p];
      const len = (u8[p + 1] << 24) | (u8[p + 2] << 16) | (u8[p + 3] << 8) | u8[p + 4];
      p += 5;
      if (len < 0 || p + len > u8.length) break;
      frames.push({ flag, payload: u8.subarray(p, p + len) });
      p += len;
    }
    return frames;
  }

  function dataFrames(u8) {
    return grpcFrames(u8).filter((f) => (f.flag & 0x80) === 0);
  }

  function readVarint(u8, s) {
    let shift = 0;
    let result = 0n;
    while (true) {
      const b = u8[s.i++];
      result |= BigInt(b & 0x7f) << BigInt(shift);
      if (!(b & 0x80)) break;
      shift += 7;
      if (shift > 70) break;
    }
    return result;
  }

  // Printable = tab/lf/cr + printable ASCII + Latin-1 supplement. Kept ASCII-only
  // in source (escapes, no literal high chars) so the file is plain UTF-8 that
  // Chrome's content-script loader accepts.
  const printable = (str) => /^[\t\n\r\x20-\x7e\xa0-\xff]*$/.test(str);

  // Generic protobuf -> plain object keyed "fN". Length-delimited fields are
  // decoded as string when valid printable UTF-8, else recursed as a nested
  // message, else kept as {"_bytes": length}. Repeats collapse into arrays.
  function decode(u8, depth) {
    depth = depth || 0;
    const out = {};
    if (depth > 8) return { _deep: true };
    const s = { i: 0 };
    try {
      while (s.i < u8.length) {
        const tag = readVarint(u8, s);
        const field = Number(tag >> 3n);
        const wt = Number(tag & 7n);
        if (field <= 0) break;
        let val;
        if (wt === 0) {
          const v = readVarint(u8, s);
          val = v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
        } else if (wt === 1) {
          const dv = new DataView(u8.buffer, u8.byteOffset + s.i, 8);
          val = dv.getFloat64(0, true);
          s.i += 8;
        } else if (wt === 5) {
          const dv = new DataView(u8.buffer, u8.byteOffset + s.i, 4);
          val = dv.getFloat32(0, true);
          s.i += 4;
        } else if (wt === 2) {
          const len = Number(readVarint(u8, s));
          const sub = u8.subarray(s.i, s.i + len);
          s.i += len;
          let str = null;
          try {
            str = UTF8.decode(sub);
          } catch (e) {
            /* not utf-8 */
          }
          if (str !== null && printable(str) && str.length > 0) {
            val = str;
          } else if (len === 0) {
            val = '';
          } else {
            const nested = decode(sub, depth + 1);
            val = nested && Object.keys(nested).length ? nested : { _bytes: len };
          }
        } else {
          break; // unknown wire type -> stop this message
        }
        const key = 'f' + field;
        if (key in out) {
          if (!Array.isArray(out[key])) out[key] = [out[key]];
          out[key].push(val);
        } else {
          out[key] = val;
        }
      }
    } catch (e) {
      out._err = String(e);
    }
    return out;
  }

  window.__XTB_DECODE = { grpcFrames, dataFrames, decode };
})();
