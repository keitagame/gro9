'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const LS_KEY = 'aichat:v1';
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const PRESETS = [
  ['OpenAI', 'https://api.openai.com/v1'],
  ['xAI', 'https://api.x.ai/v1'],
  ['OpenRouter', 'https://openrouter.ai/api/v1'],
  ['Groq', 'https://api.groq.com/openai/v1'],
  ['DeepSeek', 'https://api.deepseek.com/v1'],
];

function normalizeEndpoint(e) {
  let u = (e || '').trim().replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(u)) u += '/chat/completions';
  return u;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  return [copied, (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }];
}

function CodeBlock({ children }) {
  const [copied, copy] = useCopy();
  const el = Array.isArray(children) ? children[0] : children;
  const cls = (el && el.props && el.props.className) || '';
  const lang = (cls.match(/language-(\S+)/) || [])[1] || '';
  const raw = el && el.props ? el.props.children : '';
  const text = (Array.isArray(raw) ? raw.join('') : String(raw ?? '')).replace(/\n$/, '');
  return (
    <div className="codeblock">
      <div className="codehead">
        <span>{lang || 'code'}</span>
        <button onClick={() => copy(text)}>
          <i className={'bi ' + (copied ? 'bi-check2' : 'bi-clipboard')} aria-hidden="true" /> {copied ? 'コピーしました' : 'コピー'}
        </button>
      </div>
      <pre><code>{text}</code></pre>
    </div>
  );
}

const mdComponents = {
  pre: CodeBlock,
  a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,
  table: ({ node, ...p }) => <div className="tablewrap"><table {...p} /></div>,
};

function Message({ m, streaming, canRegen, onRegen }) {
  const [copied, copy] = useCopy();
  if (m.role === 'user') return <div className="msg user">{m.content}</div>;
  return (
    <div className="msg assistant">
      {m.error ? (
        <p className="err"><i className="bi bi-exclamation-circle" aria-hidden="true" /> {m.content}</p>
      ) : (
        <div className="md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{m.content}</ReactMarkdown>
        </div>
      )}
      {streaming && <span className="cursor" />}
      {!streaming && m.content && (
        <div className="actions">
          <button className="act" aria-label="コピー" title="コピー" onClick={() => copy(m.content)}><i className={'bi ' + (copied ? 'bi-check2' : 'bi-clipboard')} aria-hidden="true" /></button>
          {canRegen && <button className="act" aria-label="再生成" title="再生成" onClick={onRegen}><i className="bi bi-arrow-repeat" aria-hidden="true" /></button>}
        </div>
      )}
    </div>
  );
}

const emptyForm = { id: '', name: '', model: '', endpoint: '', apiKey: '' };

export default function Page() {
  const [loaded, setLoaded] = useState(false);
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState('models');
  const [form, setForm] = useState(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const taRef = useRef(null);
  const scrollRef = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      setModels(d.models || []);
      setModelId(d.modelId || '');
      setSystemPrompt(d.systemPrompt || '');
      setChats(d.chats || []);
      setChatId(d.chatId || null);
    } catch {}
    setSidebar(window.innerWidth > 768);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ models, modelId, systemPrompt, chats, chatId }));
    } catch {}
  }, [loaded, models, modelId, systemPrompt, chats, chatId]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') setSettings(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const chat = chats.find((c) => c.id === chatId);
  const messages = chat ? chat.messages : [];
  const model = models.find((m) => m.id === modelId);
  const empty = messages.length === 0;

  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);
  useEffect(() => { stick.current = true; setAtBottom(true); }, [chatId]);
  useEffect(() => {
    const t = taRef.current;
    if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }
  }, [input]);
  useEffect(() => { if (loaded && !settings) taRef.current?.focus(); }, [loaded, chatId, settings]);

  function onScroll() {
    const el = scrollRef.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near;
    setAtBottom(near);
  }
  function jump() { stick.current = true; endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }

  function patchLast(id, fn) {
    setChats((p) => p.map((c) => c.id !== id ? c : {
      ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? fn(m) : m),
    }));
  }

  async function run(id, history) {
    setChats((p) => p.map((c) => c.id === id ? { ...c, messages: [...history, { role: 'assistant', content: '' }] } : c));
    stick.current = true;
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const payloadMessages = [
      ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt }] : []),
      ...history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
    ];
    let acc = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: normalizeEndpoint(model.endpoint),
          apiKey: model.apiKey,
          body: { model: model.model, messages: payloadMessages, stream: true },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        let msg = t;
        try { const j = JSON.parse(t); msg = j.error?.message || j.error || t; } catch {}
        throw new Error(`${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('event-stream')) {
        const j = await res.json();
        acc = j.choices?.[0]?.message?.content ?? '';
        patchLast(id, (m) => ({ ...m, content: acc }));
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith('data:')) continue;
            const data = l.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const d = JSON.parse(data).choices?.[0]?.delta?.content;
              if (d) { acc += d; const snap = acc; patchLast(id, (m) => ({ ...m, content: snap })); }
            } catch {}
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        patchLast(id, () => ({ role: 'assistant', content: acc ? acc + '\n\n' + e.message : e.message, error: true }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!model) { setTab('models'); setSettings(true); return; }
    let id = chatId;
    if (!chat) {
      id = uid();
      setChats((p) => [{ id, title: text.slice(0, 30), messages: [] }, ...p]);
      setChatId(id);
    }
    setInput('');
    run(id, [...messages, { role: 'user', content: text }]);
  }

  function regenerate() {
    if (busy || !model || messages.length < 2) return;
    run(chatId, messages.slice(0, -1));
  }

  function stop() { abortRef.current?.abort(); }
  function closeSide() { if (window.innerWidth <= 768) setSidebar(false); }
  function newChat() { setChatId(null); setInput(''); closeSide(); }
  function delChat(id) { setChats((p) => p.filter((c) => c.id !== id)); if (chatId === id) setChatId(null); }
  function openSettings(t) { setTab(t); setSettings(true); }

  function saveModel() {
    const f = { ...form, name: form.name.trim() || form.model.trim() };
    if (!f.model.trim() || !f.endpoint.trim()) return;
    if (f.id) setModels((p) => p.map((m) => m.id === f.id ? f : m));
    else { f.id = uid(); setModels((p) => [...p, f]); if (!modelId) setModelId(f.id); }
    setForm(emptyForm);
  }
  function delModel(id) {
    setModels((p) => p.filter((m) => m.id !== id));
    if (modelId === id) setModelId((models.find((m) => m.id !== id) || {}).id || '');
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="app">
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}
      <aside className={'sidebar ' + (sidebar ? 'open' : 'closed')}>
        <div className="brand">gro9</div>
        <button className="side-btn primary" onClick={newChat}><i className="bi bi-pencil-square" aria-hidden="true" /> 新しいチャット</button>
        <div className="side-label">履歴</div>
        <div className="chat-list">
          {chats.length === 0 && <p className="side-empty">チャットを始めると、ここに履歴が表示されます。</p>}
          {chats.map((c) => (
            <div key={c.id} className={'chat-item' + (c.id === chatId ? ' active' : '')}>
              <button className="title" onClick={() => { setChatId(c.id); closeSide(); }}>{c.title}</button>
              <button className="del" aria-label="削除" onClick={() => delChat(c.id)}><i className="bi bi-trash" aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <button className="side-btn" onClick={() => openSettings('models')}><i className="bi bi-gear" aria-hidden="true" /> 設定</button>
      </aside>

      <main className={'main' + (empty ? ' is-empty' : '')}>
        <header className="topbar">
          <button className="icon-btn" aria-label="サイドバー" onClick={() => setSidebar((s) => !s)}><i className="bi bi-layout-sidebar" aria-hidden="true" /></button>
          {models.length > 0 && (
            <select className="model-select" value={modelId} onChange={(e) => setModelId(e.target.value)} aria-label="モデル">
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <div className="spacer" />
          <button className="pill" onClick={() => openSettings('prompt')}><i className="bi bi-chat-square-text" aria-hidden="true" /> システムプロンプト</button>
        </header>

        <div className="scroll" ref={scrollRef} onScroll={onScroll}>
          {!empty && (
            <div className="thread">
              {messages.map((m, i) => {
                const last = i === messages.length - 1;
                return <Message key={i} m={m} streaming={busy && last && m.role === 'assistant'} canRegen={last && !busy} onRegen={regenerate} />;
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="dock">
          <div className="dock-in">
            <div className="hero" aria-hidden={!empty}>gro9</div>
            {!atBottom && !empty && <button className="jump" aria-label="最新へ移動" onClick={jump}><i className="bi bi-arrow-down" aria-hidden="true" /></button>}
            <div className="composer">
              <textarea ref={taRef} rows={1} value={input} placeholder={model ? `${model.name} に何でも聞く` : 'まずモデルを追加してください'}
                onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} />
              {busy ? (
                <button className="send stop" aria-label="停止" onClick={stop}><i className="bi bi-stop-fill" aria-hidden="true" /></button>
              ) : (
                <button className="send" aria-label="送信" disabled={!input.trim()} onClick={send}><i className="bi bi-arrow-up" aria-hidden="true" /></button>
              )}
            </div>
            <div className="under">
              {!model ? (
                <button className="btn" onClick={() => openSettings('models')}><i className="bi bi-plus-lg" aria-hidden="true" /> モデルを追加</button>
              ) : (
                <span className="hint">Enterで送信 / Shift+Enterで改行</span>
              )}
            </div>
          </div>
        </div>
      </main>

      {settings && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setSettings(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="設定">
            <div className="modal-head">設定<div className="spacer" /><button className="icon-btn" aria-label="閉じる" onClick={() => setSettings(false)}><i className="bi bi-x-lg" aria-hidden="true" /></button></div>
            <div className="tabs">
              <button className={'tab' + (tab === 'models' ? ' on' : '')} onClick={() => setTab('models')}><i className="bi bi-cpu" aria-hidden="true" /> モデル</button>
              <button className={'tab' + (tab === 'prompt' ? ' on' : '')} onClick={() => setTab('prompt')}><i className="bi bi-chat-square-text" aria-hidden="true" /> システムプロンプト</button>
            </div>
            <div className="modal-body">
              {tab === 'models' ? (
                <>
                  {models.map((m) => (
                    <div key={m.id} className="model-row">
                      <div className="info">{m.name}<small>{m.model} · {m.endpoint}</small></div>
                      <button className="btn ghost" onClick={() => setForm(m)}>編集</button>
                      <button className="btn ghost" onClick={() => delModel(m.id)}>削除</button>
                    </div>
                  ))}
                  <div className="form-title">{form.id ? 'モデルを編集' : 'モデルを追加'}</div>
                  <div className="field"><label>表示名</label><input value={form.name} onChange={set('name')} placeholder="例: GPT-4o" /></div>
                  <div className="field"><label>モデルID</label><input value={form.model} onChange={set('model')} placeholder="例: gpt-4o" /></div>
                  <div className="field"><label>エンドポイント (OpenAI互換)</label>
                    <input value={form.endpoint} onChange={set('endpoint')} placeholder="https://api.openai.com/v1" />
                    <div className="chips">{PRESETS.map(([n, u]) => <button key={n} className="chip" onClick={() => setForm({ ...form, endpoint: u })}>{n}</button>)}</div>
                  </div>
                  <div className="field"><label>APIキー</label>
                    <div className="keyrow">
                      <input type={showKey ? 'text' : 'password'} autoComplete="off" value={form.apiKey} onChange={set('apiKey')} placeholder="sk-..." />
                      <button className="icon-btn" aria-label={showKey ? 'キーを隠す' : 'キーを表示'} onClick={() => setShowKey((s) => !s)}><i className={'bi ' + (showKey ? 'bi-eye-slash' : 'bi-eye')} aria-hidden="true" /></button>
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn" disabled={!form.model.trim() || !form.endpoint.trim()} onClick={saveModel}>{form.id ? '更新' : '追加'}</button>
                    {form.id && <button className="btn ghost" onClick={() => setForm(emptyForm)}>キャンセル</button>}
                  </div>
                  <p className="note">/chat/completions は自動で補完されます。APIキーはこのブラウザのlocalStorageにのみ保存され、送信時にVercel上の中継APIを通ります(サーバーには保存されません)。</p>
                </>
              ) : (
                <>
                  <div className="field"><label>システムプロンプト (全モデル共通)</label>
                    <textarea rows={12} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="ここにシステムプロンプトを入力。空欄なら送信しません。" /></div>
                  <p className="note">変更は自動保存され、次の送信から反映されます。</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
