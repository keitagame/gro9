export const runtime = 'edge';

const json = (obj, status = 400) =>
  new Response(JSON.stringify({ error: obj }), { status, headers: { 'Content-Type': 'application/json' } });

// Block obvious private/local targets so the proxy can't be used to reach internal hosts.
function isBlockedHost(h) {
  h = h.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h === '[::1]' || h.startsWith('[fc') || h.startsWith('[fd') || h.startsWith('[fe80')
  );
}

export async function POST(req) {
  let payload;
  try { payload = await req.json(); } catch { return json('Invalid JSON'); }
  const { endpoint, apiKey, body } = payload || {};

  let url;
  try { url = new URL(endpoint); } catch { return json('エンドポイントのURLが不正です'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return json('http/https のみ対応しています');
  if (isBlockedHost(url.hostname)) return json('ローカル/内部アドレスには接続できません');

  try {
    const up = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return new Response(up.body, {
      status: up.status,
      headers: {
        'Content-Type': up.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return json('接続に失敗しました: ' + (e?.message || e), 502);
  }
}
