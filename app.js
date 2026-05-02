/* ── State ──────────────────────────────────────────────────────── */
const state = {
  checked:     new Set(),   // qid strings
  openTopics:  new Set(["t1"]),
  openSubs:    new Set(),
  openAnswers: new Set(),
  katexReady:  false,
  copiedQid:   null,
  copyTimer:   null,
};

/* ── KaTeX ──────────────────────────────────────────────────────── */
function loadKaTeX(cb) {
  if (window.katex) { state.katexReady = true; cb(); return; }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";
  document.head.appendChild(link);
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";
  s.onload = () => { state.katexReady = true; cb(); };
  document.head.appendChild(s);
}

/* ── Math rendering ─────────────────────────────────────────────── */
function renderMath(text) {
  if (!text) return "";
  if (!state.katexReady || !window.katex) return escHtml(text);
  let out = "", rem = text;
  while (rem.length > 0) {
    if (rem.startsWith("$$")) {
      const end = rem.indexOf("$$", 2);
      if (end !== -1) {
        try { out += katex.renderToString(rem.slice(2, end), { displayMode: true, throwOnError: false }); }
        catch { out += escHtml(rem.slice(0, end + 2)); }
        rem = rem.slice(end + 2); continue;
      }
    }
    const di = rem.indexOf("$");
    if (di === -1) { out += escHtml(rem); break; }
    if (di > 0) { out += escHtml(rem.slice(0, di)); rem = rem.slice(di); continue; }
    const end = rem.indexOf("$", 1);
    if (end === -1) { out += escHtml(rem); break; }
    try { out += katex.renderToString(rem.slice(1, end), { displayMode: false, throwOnError: false }); }
    catch { out += escHtml(rem.slice(0, end + 1)); }
    rem = rem.slice(end + 1);
  }
  return out;
}

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ── ID helpers ─────────────────────────────────────────────────── */
const qid    = (tid, sid, i) => `${tid}|${sid}|${i}`;
const subKey = (tid, sid)    => `${tid}__${sid}`;

/* ── Counting ───────────────────────────────────────────────────── */
function countSub(sub, tid) {
  const total = sub.qs.length;
  const done  = sub.qs.filter((_, i) => state.checked.has(qid(tid, sub.id, i))).length;
  return { done, total };
}
function countTopic(topic) {
  let done = 0, total = 0;
  for (const s of topic.subs) { const c = countSub(s, topic.id); done += c.done; total += c.total; }
  return { done, total };
}
function globalCount() {
  let done = 0, total = 0;
  for (const t of TOPICS) { const c = countTopic(t); done += c.done; total += c.total; }
  return { done, total };
}
function stateOf(done, total) {
  if (!total || !done) return "empty";
  if (done === total)  return "full";
  return "partial";
}

/* ── Tick HTML ──────────────────────────────────────────────────── */
function tickHtml(st, size, title) {
  const s = size || 16;
  const tt = title ? ` title="${escHtml(title)}"` : "";
  return `<span class="tick ${st}"${tt} style="width:${s}px;height:${s}px;--tick-size:${s}px;"></span>`;
}

/* ── Full render ────────────────────────────────────────────────── */
function render() {
  renderHeader();
  renderTopics();
}

function renderHeader() {
  const { done, total } = globalCount();
  // global counter
  document.getElementById("global-counter").innerHTML =
    `${done}<span> / ${total}</span>`;

  // tick strip (one tick per topic)
  const strip = document.getElementById("tick-strip");
  strip.innerHTML = TOPICS.map(t => {
    const { done: d, total: tot } = countTopic(t);
    return tickHtml(stateOf(d, tot), 14, `${t.title} · ${d}/${tot}`);
  }).join("");
}

function renderTopics() {
  const container = document.getElementById("topics");
  container.innerHTML = TOPICS.map((topic, ti) => topicHtml(topic, ti)).join("");
}

function topicHtml(topic, ti) {
  const isOpen = state.openTopics.has(topic.id);
  const { done, total } = countTopic(topic);

  const subTickStrip = topic.subs.map(sub => {
    const c = countSub(sub, topic.id);
    return tickHtml(stateOf(c.done, c.total), 11, `${sub.title} · ${c.done}/${c.total}`);
  }).join("");

  const bodyHtml = isOpen ? `
    <div class="topic-body">
      <ul class="sub-list">
        ${topic.subs.map(sub => subHtml(topic.id, sub)).join("")}
      </ul>
    </div>` : "";

  return `
<div class="topic-card" id="card-${topic.id}">
  <div class="topic-hdr${isOpen ? " open" : ""}" onclick="toggleTopic('${topic.id}')">
    <div class="topic-left">
      <span class="topic-num">${String(ti + 1).padStart(2, "0")}</span>
      <span class="topic-name">${escHtml(topic.title)}</span>
    </div>
    <div class="topic-right">
      <div class="sub-tick-strip">${subTickStrip}</div>
      <span class="topic-count">${done} / ${total}</span>
      <span class="chevron">▶</span>
    </div>
  </div>
  ${bodyHtml}
</div>`;
}

function subHtml(tid, sub) {
  const sk = subKey(tid, sub.id);
  const isOpen = state.openSubs.has(sk);
  const { done, total } = countSub(sub, tid);
  const st = stateOf(done, total);

  const qsHtml = isOpen ? `
    <ul class="q-list" id="qlist-${sk}">
      ${sub.qs.map((q, i) => qHtml(tid, sub.id, i, q)).join("")}
    </ul>` : "";

  return `
<li class="sub-item">
  <div class="sub-row${isOpen ? " open" : ""}" id="subrow-${sk}">
    ${tickHtml(st, 16)}
    <button class="sub-btn" onclick="toggleSub('${tid}','${sub.id}')">
      <span class="sub-name">${escHtml(sub.title)}</span>
      <div class="sub-meta">
        <span class="sub-count">${done} / ${total}</span>
        <span class="sub-chev">▶</span>
      </div>
    </button>
  </div>
  ${qsHtml}
</li>`;
}

function qHtml(tid, sid, idx, q) {
  const id       = qid(tid, sid, idx);
  const isChk    = state.checked.has(id);
  const ansOpen  = state.openAnswers.has(id);
  const isCopied = state.copiedQid === id;

  const dotHtml = q.k === "t"
    ? `<span class="q-dot tricky" title="Хитрый"></span>`
    : q.k === "s"
      ? `<span class="q-dot situational" title="Ситуативный"></span>`
      : "";

  const ansHtml = (ansOpen && q.a) ? `
    <div class="ans-block" id="ans-${id}">
      ${q.a.map(line => `<p class="ans-line">${renderMath(line)}</p>`).join("")}
    </div>` : "";

  const copyIcon = isCopied ? "✓" : "⎘";
  const copyClass = isCopied ? "q-copy copied" : "q-copy";

  return `
<li class="q-item" id="qi-${id}">
  <div class="q-row">
    <div class="q-cb${isChk ? " checked" : ""}" onclick="toggleCheck('${id}')"></div>
    <button class="q-text-btn${isChk ? " done" : ""}" onclick="toggleAnswer('${id}')">
      ${dotHtml}<span class="q-text-inner">${renderMath(q.t)}</span><span class="q-toggle-icon">${ansOpen ? "▲" : "▼"}</span>
    </button>
    <button class="${copyClass}" id="copy-${id}" onclick="copyQ('${id}',this)" title="Скопировать вопрос">${copyIcon}</button>
  </div>
  ${ansHtml}
</li>`;
}

/* ── Toggle handlers ────────────────────────────────────────────── */
function toggleTopic(tid) {
  if (state.openTopics.has(tid)) state.openTopics.delete(tid);
  else state.openTopics.add(tid);
  // re-render just this card
  const topic = TOPICS.find(t => t.id === tid);
  const card  = document.getElementById("card-" + tid);
  const ti    = TOPICS.indexOf(topic);
  card.outerHTML = topicHtml(topic, ti);
  // after replacement, new card is sibling — re-select and update
  renderHeader();
}

function toggleSub(tid, sid) {
  const sk = subKey(tid, sid);
  if (state.openSubs.has(sk)) state.openSubs.delete(sk);
  else state.openSubs.add(sk);
  const topic = TOPICS.find(t => t.id === tid);
  const sub   = topic.subs.find(s => s.id === sid);
  const li    = document.getElementById("subrow-" + sk).closest("li.sub-item");
  li.outerHTML = subHtml(tid, sub);
}

function toggleCheck(id) {
  if (state.checked.has(id)) state.checked.delete(id);
  else state.checked.add(id);
  saveProgress();

  // update checkbox visual
  const cb = document.querySelector(`#qi-${id} .q-cb`);
  if (cb) cb.classList.toggle("checked", state.checked.has(id));

  // update text strikethrough
  const tb = document.querySelector(`#qi-${id} .q-text-btn`);
  if (tb) tb.classList.toggle("done", state.checked.has(id));

  // update tick indicators up the tree
  // find parent sub and topic
  const [tid, sid] = id.split("|");
  updateSubTick(tid, sid);
  updateTopicTick(tid);
  renderHeader();
}

function updateSubTick(tid, sid) {
  const sk = subKey(tid, sid);
  const row = document.getElementById("subrow-" + sk);
  if (!row) return;
  const topic = TOPICS.find(t => t.id === tid);
  const sub   = topic.subs.find(s => s.id === sid);
  const { done, total } = countSub(sub, tid);
  const st = stateOf(done, total);
  const existingTick = row.querySelector(".tick");
  if (existingTick) existingTick.outerHTML = tickHtml(st, 16);
  // update count
  const cnt = row.querySelector(".sub-count");
  if (cnt) cnt.textContent = `${done} / ${total}`;
}

function updateTopicTick(tid) {
  const card = document.getElementById("card-" + tid);
  if (!card) return;
  const topic = TOPICS.find(t => t.id === tid);
  const { done, total } = countTopic(topic);
  const cnt = card.querySelector(".topic-count");
  if (cnt) cnt.textContent = `${done} / ${total}`;
  // update sub tick strip
  const strip = card.querySelector(".sub-tick-strip");
  if (strip) {
    strip.innerHTML = topic.subs.map(sub => {
      const c = countSub(sub, topic.id);
      return tickHtml(stateOf(c.done, c.total), 11, `${sub.title} · ${c.done}/${c.total}`);
    }).join("");
  }
}

function toggleAnswer(id) {
  if (state.openAnswers.has(id)) state.openAnswers.delete(id);
  else state.openAnswers.add(id);

  const item = document.getElementById("qi-" + id);
  if (!item) return;

  // find q data
  const [tid, sid, idx] = id.split("|");
  const topic = TOPICS.find(t => t.id === tid);
  const sub   = topic.subs.find(s => s.id === sid);
  const q     = sub.qs[parseInt(idx)];

  // update toggle icon only (don't touch the math-rendered question text)
  const icon = item.querySelector(".q-toggle-icon");
  const ansOpen = state.openAnswers.has(id);
  if (icon) icon.textContent = ansOpen ? "▲" : "▼";
  // also keep copy button visibility correct (no side-effect from innerHTML replacement)

  // add/remove answer block
  const existing = document.getElementById("ans-" + id);
  if (ansOpen && q.a) {
    if (!existing) {
      const div = document.createElement("div");
      div.className = "ans-block";
      div.id = "ans-" + id;
      div.innerHTML = q.a.map(line => `<p class="ans-line">${renderMath(line)}</p>`).join("");
      item.appendChild(div);
    }
  } else {
    if (existing) existing.remove();
  }
}

function copyQ(id, btn) {
  const [tid, sid, idx] = id.split("|");
  const topic = TOPICS.find(t => t.id === tid);
  const sub   = topic.subs.find(s => s.id === sid);
  const q     = sub.qs[parseInt(idx)];
  navigator.clipboard.writeText(q.t).then(() => {
    btn.textContent = "✓";
    btn.classList.add("copied");
    state.copiedQid = id;
    clearTimeout(state.copyTimer);
    state.copyTimer = setTimeout(() => {
      btn.textContent = "⎘";
      btn.classList.remove("copied");
      state.copiedQid = null;
    }, 1500);
  }).catch(() => {});
}

/* ── Expand / Collapse / Reset ──────────────────────────────────── */
function expandAll() {
  TOPICS.forEach(t => {
    state.openTopics.add(t.id);
    t.subs.forEach(s => state.openSubs.add(subKey(t.id, s.id)));
  });
  render();
}

function collapseAll() {
  state.openTopics.clear();
  state.openSubs.clear();
  state.openAnswers.clear();
  render();
}

function resetProgress() {
  if (!confirm("Сбросить весь прогресс?")) return;
  state.checked.clear();
  saveProgress();
  render();
}

/* ── Persistence ────────────────────────────────────────────────── */
const STORAGE_KEY = "ml-checklist-v2";

function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.checked])); } catch {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) JSON.parse(raw).forEach(id => state.checked.add(id));
  } catch {}
}

/* ── Boot ───────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  loadProgress();
  render();
  loadKaTeX(() => {
    // re-render math in all visible question texts
    document.querySelectorAll(".q-text-inner").forEach(span => {
      const btn  = span.closest(".q-text-btn");
      if (!btn) return;
      const li   = btn.closest("li.q-item");
      if (!li) return;
      const id   = li.id.replace("qi-", "");
      const [tid, sid, idx] = id.split("|");
      const topic = TOPICS.find(t => t.id === tid);
      const sub   = topic && topic.subs.find(s => s.id === sid);
      const q     = sub && sub.qs[parseInt(idx)];
      if (q) span.innerHTML = renderMath(q.t);
    });
    // re-render all open answer blocks with math
    document.querySelectorAll(".ans-block").forEach(block => {
      const id = block.id.replace("ans-", "");
      const [tid, sid, idx] = id.split("|");
      const topic = TOPICS.find(t => t.id === tid);
      const sub   = topic && topic.subs.find(s => s.id === sid);
      const q     = sub && sub.qs[parseInt(idx)];
      if (q && q.a) {
        block.innerHTML = q.a.map(line => `<p class="ans-line">${renderMath(line)}</p>`).join("");
      }
    });
  });
});
