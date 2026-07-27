// MAIN world, document_start. Wraps fetch to capture the handful of ipax.xtb.com
// gRPC-Web calls we care about, decodes them incrementally, and forwards ONLY the
// decoded portfolio data — tagged with the bucket's account number — to the
// isolated content script.
//
// Bucket attribution: ipax data requests have an empty body and carry no account
// header; the only per-bucket signal is the session token, which is scoped to the
// account being viewed (IKE / IKZE / main each get their own token). We read ONLY
// the non-secret `acn` (account number) claim from that token, in memory, to label
// the capture. The token itself — signature and all — is never stored, exported,
// logged, or transmitted anywhere. The account number is a public identifier shown
// throughout the xStation UI.
(function () {
  'use strict';

  const HOST = 'ipax.xtb.com';
  const D = () => window.__XTB_DECODE;

  // Only these methods are teed/decoded. Everything else (esp. the high-rate
  // InstrumentQuoteService quote stream) is left completely untouched — teeing
  // and decoding that stream is what froze the page.
  const ALLOW = /(SubscribePortfolioPositionGroups|GetAccountBalance|SavingsPortfolioSubscribe|GetRetirementAccounts|GetAccountDepositLimitWithPositionInfo|SubscribeOrderGroups)/;

  function methodName(url) {
    const path = url.split('/').slice(3).join('/');
    return path.split('.').slice(-2).join('.');
  }

  function b64urlToJson(seg) {
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  }

  // Read ONLY the account-number claim from the request's bearer token. Returns
  // { accountNo, branch } or null. The token is never retained.
  function tokenAccount(init, input) {
    try {
      let auth = null;
      const h = (init && init.headers) || (input && input.headers);
      if (h) {
        if (typeof h.get === 'function') auth = h.get('authorization');
        else auth = h.authorization || h.Authorization;
      }
      if (!auth) return null;
      const seg = auth.replace(/^Bearer\s+/i, '').split('.');
      if (seg.length < 2) return null;
      const payload = b64urlToJson(seg[1]);
      if (payload && payload.acn != null) {
        return { accountNo: String(payload.acn), branch: payload.branch };
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function localAccount() {
    try {
      const a = JSON.parse(localStorage.getItem('lastAccountIpax') || 'null');
      if (a && a.accountNo) return { accountNo: String(a.accountNo), currency: a.currency };
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function post(method, decoded, account) {
    try {
      window.postMessage(
        { source: 'xtb-export', kind: 'capture', method, decoded, account },
        window.location.origin
      );
    } catch (e) {
      /* ignore */
    }
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    const p = origFetch.apply(this, arguments);
    if (!url || url.indexOf(HOST) === -1) return p;
    const method = methodName(url);
    if (!ALLOW.test(method)) return p; // leave everything else fully alone

    const account = tokenAccount(init, input) || localAccount();
    if (account) (window.__XTB_DEBUG_ACN || (window.__XTB_DEBUG_ACN = {}))[method] = account.accountNo;

    return p.then((res) => {
      try {
        if (!res.body) return res;
        const [a, b] = res.body.tee();
        const dec = D();
        (async () => {
          const reader = b.getReader();
          let buf = new Uint8Array(0);
          let off = 0;
          const decoded = [];
          let total = 0;
          try {
            while (total < 5_000_000) {
              const { done, value } = await reader.read();
              if (done) break;
              total += value.length;
              const nb = new Uint8Array(buf.length + value.length);
              nb.set(buf);
              nb.set(value, buf.length);
              buf = nb;
              let changed = false;
              while (buf.length - off >= 5) {
                const flag = buf[off];
                const len = (buf[off + 1] << 24) | (buf[off + 2] << 16) | (buf[off + 3] << 8) | buf[off + 4];
                if (buf.length - off - 5 < len) break;
                const payload = buf.subarray(off + 5, off + 5 + len);
                off += 5 + len;
                if ((flag & 0x80) === 0 && dec) {
                  try {
                    decoded.push(dec.decode(payload));
                    changed = true;
                  } catch (e) {
                    /* skip frame */
                  }
                }
              }
              if (off > 65536) {
                buf = buf.slice(off);
                off = 0;
              }
              if (changed) {
                post(method, decoded, account);
                (window.__XTB_DEBUG || (window.__XTB_DEBUG = {}))[method] = decoded;
              }
            }
          } catch (e) {
            /* stream closed */
          }
        })();
        return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
      } catch (e) {
        return res;
      }
    });
  };

  window.postMessage({ source: 'xtb-export', kind: 'ready' }, window.location.origin);
})();
