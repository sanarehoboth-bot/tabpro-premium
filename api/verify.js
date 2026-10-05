'use strict';
// Vercel serverless function: POST /api/verify  { key, deviceId, isNewDevice }
// Env vars (Vercel > Settings > Environment Variables):
//   GUMROAD_PRODUCT_IDS  comma-separated product IDs allowed on THIS site, each with an optional
//                        device cap after a colon, e.g.  TOOLID:3,BUNDLEID:15
//   MAX_USES             default cap when no colon is given (default 3, 0 = no limit)
var API = 'https://api.gumroad.com/v2/licenses/verify';

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

// Gumroad keys are hex (0-9, A-F). Fix look-alikes: O->0, I/L->1.
function normalize(k) {
  return String(k || '').toUpperCase().replace(/\s+/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-F-]/g, '');
}

function callGumroad(productId, key, increment) {
  var body = 'product_id=' + encodeURIComponent(productId) +
    '&license_key=' + encodeURIComponent(key) +
    '&increment_uses_count=' + (increment ? 'true' : 'false');
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      return { status: r.status, data: j };
    });
  });
}

module.exports = function (req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, code: 'method' });
  var body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  var defCap = parseInt(process.env.MAX_USES || '3', 10);
  if (isNaN(defCap)) defCap = 3;
  var ids = String(process.env.GUMROAD_PRODUCT_IDS || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean)
    .map(function (e) {
      var p = e.split(':'), c = p.length > 1 ? parseInt(p[1], 10) : defCap;
      return { id: p[0].trim(), cap: isNaN(c) ? defCap : c };
    });
  if (!ids.length) return send(res, 500, { ok: false, code: 'config' });

  var key = normalize(body.key);
  if (key.length < 20) return send(res, 200, { ok: false, code: 'invalid' });

  function tryId(i) {
    if (i >= ids.length) return send(res, 200, { ok: false, code: 'invalid' });
    return callGumroad(ids[i].id, key, false).then(function (r) {
      if (r.status === 404 || (r.data && r.data.success === false && r.status < 500)) return tryId(i + 1);
      if (r.status !== 200 || !r.data || r.data.success !== true) return send(res, 502, { ok: false, code: 'upstream' });
      var p = r.data.purchase || {};
      if (p.refunded || p.chargebacked || (p.disputed && !p.dispute_won)) {
        return send(res, 200, { ok: false, code: 'refunded' });
      }
      var uses = parseInt(r.data.uses || 0, 10) || 0;
      if (body.isNewDevice === true && body.deviceId) {
        if (ids[i].cap > 0 && uses >= ids[i].cap) return send(res, 200, { ok: false, code: 'limit' });
        return callGumroad(ids[i].id, key, true).then(function () {
          return send(res, 200, { ok: true, key: key });
        });
      }
      return send(res, 200, { ok: true, key: key });
    });
  }

  tryId(0).catch(function () { send(res, 502, { ok: false, code: 'upstream' }); });
};
