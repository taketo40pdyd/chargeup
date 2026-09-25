/* ChargeUp（ガジェット貯金）サービスワーカー
   - ホーム画面への追加(PWA化)のために登録します
   - プッシュ通知の受信時、サーバーからは何も詳しい内容を受け取らず、
     この端末のキャッシュ(gadget-ctx-v1)に保存された目標名・残り金額などから
     その場で通知文言を組み立てます（目標名や金額は一切サーバーに送りません）
*/
const PUSH_CACHE = 'gadget-ctx-v1';
const PUSH_CTX = '__gadget_ctx__';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await updateBadgeFromCtx(await readCtx());
  })());
});

// 特別なオフラインキャッシュ戦略は持たず、通常通りネットワークから取得します
self.addEventListener('fetch', () => {});

async function readCtx() {
  try {
    const cache = await caches.open(PUSH_CACHE);
    const res = await cache.match(new URL(PUSH_CTX, self.location.href).href);
    if (!res) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function buildNotification(ctx, payload) {
  if (payload && typeof payload === 'object' && payload.title) {
    return { title: payload.title, body: payload.body || '', tag: payload.tag || 'chargeup-reminder' };
  }
  if (ctx && ctx.name) {
    const remain = Math.max(0, ctx.remain || 0);
    const pct = Math.max(0, Math.min(100, Math.round(ctx.pct || 0)));
    const body = remain > 0
      ? `「${ctx.name}」進捗${pct}%・あと${remain.toLocaleString('ja-JP')}円です。今日も少し貯金しませんか？`
      : `「${ctx.name}」の目標金額に到達しました！`;
    return { title: 'ChargeUp', body, tag: 'chargeup-reminder' };
  }
  return { title: 'ChargeUp', body: '貯金のリマインドです。アプリを開いて記録しましょう。', tag: 'chargeup-reminder' };
}

// ホーム画面アイコンのバッジも、通知と同じタイミングで最新の進捗に更新する
// （対応環境のみ。未対応ブラウザでは何もしない）
async function updateBadgeFromCtx(ctx) {
  if (!('setAppBadge' in self.navigator)) return;
  try {
    const pct = ctx && typeof ctx.pct === 'number' ? Math.max(0, Math.min(100, Math.round(ctx.pct))) : 0;
    if (pct > 0) await self.navigator.setAppBadge(pct);
    else await self.navigator.clearAppBadge();
  } catch (e) {}
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = null;
    try {
      payload = event.data ? event.data.json() : null;
    } catch (e) {
      try { payload = { body: event.data ? event.data.text() : '' }; } catch (e2) { payload = null; }
    }
    const ctx = await readCtx();
    const n = buildNotification(ctx, payload);
    await self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      renotify: true,
      data: { url: './' }
    });
    await updateBadgeFromCtx(ctx);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      if ('focus' in c) { await c.focus(); return; }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
