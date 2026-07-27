// Toolbar popup. Talks to the content script on the active xStation tab.
(function () {
  'use strict';

  const XSTATION = 'https://xstation5.xtb.com/';
  const ORDER = ['My Transactions', 'IKE', 'IKZE', 'Investment Plans'];
  const BUCKET_MSG = { 'My Transactions': 'bucketMyTransactions', 'Investment Plans': 'bucketInvestmentPlans' };
  const $ = (id) => document.getElementById(id);
  const contentEl = $('content');
  const warnEl = $('warn');
  const captureBtn = $('capture');
  const histBtn = $('csvHist');
  const exportBtns = [$('json'), $('csvPos'), $('csvPlans')];

  const t = (k) => chrome.i18n.getMessage(k) || k;
  const bucketLabel = (id) => (BUCKET_MSG[id] ? t(BUCKET_MSG[id]) : id);

  // Localize static text + tooltips, and set the version.
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.getAttribute('data-i18n'))));
  document.querySelectorAll('[data-i18n-title]').forEach((el) => el.setAttribute('title', t(el.getAttribute('data-i18n-title'))));
  try {
    $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  } catch (e) {}

  let CUR = ''; // account currency, filled from the summary
  const pnf = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cnf = () => (CUR ? new Intl.NumberFormat(undefined, { style: 'currency', currency: CUR }) : pnf);
  const money = (n) => cnf().format(n || 0);
  const signed = (n) => (n >= 0 ? '+' : '−') + cnf().format(Math.abs(n || 0));
  const pct = (n) => (n >= 0 ? '+' : '−') + pnf.format(Math.abs(n || 0)) + '%';
  const cls = (n) => (n >= 0 ? 'pos' : 'neg');
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function activeTab() {
    return new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (a) => resolve(a && a[0])));
  }

  function send(tabId, type) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { type }, (resp) => resolve(chrome.runtime.lastError ? null : resp));
      } catch (e) {
        resolve(null);
      }
    });
  }

  function setExportsEnabled(on) {
    exportBtns.forEach((b) => (b.disabled = !on));
  }

  function showWarnings(list) {
    if (list && list.length) {
      warnEl.textContent = t('schemaWarning');
      warnEl.hidden = false;
    } else {
      warnEl.hidden = true;
    }
  }

  function renderOffSite() {
    showWarnings(null);
    contentEl.innerHTML =
      '<div class="empty">' + esc(t('offSite')) + '<br><a href="' + XSTATION + '" target="_blank">' + esc(t('openXstation')) + '</a></div>';
    captureBtn.disabled = true;
    setExportsEnabled(false);
    histBtn.disabled = true;
  }

  function renderSummary(s) {
    CUR = (s && s.currency) || '';
    showWarnings(s && s.warnings);
    const buckets = (s && s.buckets) || {};
    const names = Object.keys(buckets);
    const hasData = names.length > 0;
    setExportsEnabled(hasData);
    histBtn.disabled = !(s && s.historyCount > 0);
    captureBtn.disabled = false;

    if (!hasData) {
      contentEl.innerHTML = '<div class="empty">' + esc(t('emptyState')) + '</div>';
      return;
    }

    const total = s.total || { value: 0, marketValue: 0, netPL: 0, cost: 0 };
    const tp = total.cost ? (total.netPL / total.cost) * 100 : 0;
    const rows = ORDER.filter((b) => buckets[b])
      .concat(names.filter((b) => ORDER.indexOf(b) === -1))
      .map((b) => {
        const v = buckets[b];
        const p = v.cost ? (v.netPL / v.cost) * 100 : 0;
        const val = v.value != null ? v.value : v.marketValue;
        return (
          '<div class="brow"><span class="bn">' + esc(bucketLabel(b)) + '</span><span class="cnt">' + v.positions +
          '</span><span class="bv"><div class="v">' + money(val) + '</div><div class="p ' + cls(v.netPL) + '">' + pct(p) + '</div></span></div>'
        );
      })
      .join('');

    contentEl.innerHTML =
      '<div class="hero"><div class="label">' + esc(t('portfolioValue')) + '</div><div class="value">' + money(total.value != null ? total.value : total.marketValue) +
      '</div><div class="pl ' + cls(total.netPL) + '"><span>' + (total.netPL >= 0 ? '▲' : '▼') + ' ' + signed(total.netPL) +
      '</span><span class="pct">' + pct(tp) + '</span></div></div><div class="buckets">' + rows + '</div>';
  }

  async function refresh() {
    const tab = await activeTab();
    if (!tab) return renderOffSite();
    // No "tabs" permission: probe the content script; no reply => not xStation.
    const s = await send(tab.id, 'xtb-summary');
    if (s === null) return renderOffSite();
    renderSummary(s);
  }

  captureBtn.onclick = async () => {
    const tab = await activeTab();
    if (!tab) return;
    captureBtn.disabled = true;
    setExportsEnabled(false);
    histBtn.disabled = true;
    captureBtn.innerHTML = '<span class="spin"></span>' + esc(t('capturing'));
    const resp = await send(tab.id, 'xtb-capture-all');
    captureBtn.textContent = t('capture');
    if (resp && resp.summary) renderSummary(resp.summary);
    else refresh();
  };

  async function doExport(type) {
    const tab = await activeTab();
    if (!tab) return;
    const resp = await send(tab.id, type);
    if (resp && resp.ok === false) return; // nothing to export
    window.close();
  }

  $('json').onclick = () => doExport('xtb-export-json');
  $('csvPos').onclick = () => doExport('xtb-export-positions');
  $('csvPlans').onclick = () => doExport('xtb-export-plans');
  histBtn.onclick = () => doExport('xtb-export-history');
  $('clear').onclick = async () => {
    const tab = await activeTab();
    if (!tab) return;
    const resp = await send(tab.id, 'xtb-clear');
    if (resp && resp.summary) renderSummary(resp.summary);
    else refresh();
  };

  refresh();
})();
