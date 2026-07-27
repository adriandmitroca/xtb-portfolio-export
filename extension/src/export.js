// Export builders (isolated world). Pure functions: snapshot -> JSON / CSV.
(function () {
  'use strict';

  function toJSON(snapshot) {
    return JSON.stringify(snapshot, null, 2);
  }

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows, columns) {
    const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
    const head = cols.map(csvCell).join(',');
    const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')).join('\n');
    return head + '\n' + body;
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.__XTB_EXPORT = { toJSON, toCSV, download };
})();
