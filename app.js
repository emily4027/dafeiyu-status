// 讀 Firebase 或 repo 的公開快照。資料由 AstrBot 插件 astrbot_plugin_status_page 產生。
// 版面跟 AstrBot 儀表板一樣；這裡沒有任何寫入功能。所有資料都用 textContent 放進畫面。
(function () {
  const $ = (id) => document.getElementById(id);
  const configuredDb = (document.querySelector('meta[name="firebase-database-url"]')?.content || "").replace(/\/$/, "");
  const firebaseDb = /^https:\/\/[a-z0-9-]+(?:\.firebaseio\.com|\.[a-z0-9-]+\.firebasedatabase\.app)$/.test(configuredDb)
    ? configuredDb : "";

  async function readJson(url, cache = "no-store") {
    const response = await fetch(url, { cache, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function loadCabinImage(img, version) {
    try {
      const picture = await readJson(firebaseDb + "/image/" + version + ".json", "force-cache");
      if (picture?.mime === "image/jpeg" && typeof picture.base64 === "string"
          && picture.base64.length <= 133336 && /^[A-Za-z0-9+/]+={0,2}$/.test(picture.base64)) {
        img.src = "data:image/jpeg;base64," + picture.base64;
        img.hidden = false;
      }
    } catch {
      // 圖片讀取失敗時保留文字近況。
    }
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== "") n.append(c instanceof Node ? c : String(c));
    return n;
  }
  const safeUrl = (u, bvid) => /^https:\/\/(www\.)?(bilibili\.com|b23\.tv)\//.test(String(u || "")) ? u
    : /^BV[0-9A-Za-z]{10}$/.test(String(bvid || "")) ? "https://www.bilibili.com/video/" + bvid : null;
  const link = (title, u, bvid) => { const h = safeUrl(u, bvid);
    return h ? el("a", { class: "lnk", href: h, target: "_blank", rel: "noopener noreferrer" }, title) : el("span", {}, title); };

  function ago(ts) {
    const s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 90) return "剛剛";
    if (s < 3600) return Math.round(s / 60) + " 分鐘前";
    if (s < 86400) return Math.round(s / 3600) + " 小時前";
    return Math.round(s / 86400) + " 天前";
  }
  const clock = (ts) => new Date(ts * 1000).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const hm = (ts) => new Date(ts * 1000).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  const scoreCls = (s) => s == null ? "muted" : s >= 7 ? "ok" : s <= 5 ? "bad" : "";
  const scoreCell = (s) => el("td", { class: "num " + scoreCls(s) }, el("b", {}, s == null ? "—" : s));
  const row = (...cells) => el("tr", {}, ...cells);
  const head = (...names) => el("tr", {}, ...names.map((x) => el("th", {}, x)));
  const empty = (text) => el("div", { class: "muted" }, text);

  // ------------------------------------------------------------ 看影片
  let vFilter = "全部", videos = [];
  function renderVideos() {
    const srcs = ["全部", ...new Set(videos.map((v) => v.source))];
    if (!srcs.includes(vFilter)) vFilter = "全部";
    $("v-filters").replaceChildren(...srcs.map((k) => {
      const n = k === "全部" ? videos.length : videos.filter((v) => v.source === k).length;
      const b = el("button", { type: "button", class: k === vFilter ? "on" : "", "aria-pressed": String(k === vFilter) }, `${k}（${n}）`);
      b.onclick = () => { vFilter = k; renderVideos(); $("v-table").parentElement.scrollTop = 0; };
      return b;
    }));
    const rows = videos.filter((v) => vFilter === "全部" || v.source === vFilter);
    $("v-table").replaceChildren(head("分數", "影片", "來源", "時間", "她的感想"), ...rows.map((v) => row(
      scoreCell(v.score),
      el("td", {}, link(v.title, v.url, v.bvid), el("div", { class: "muted" }, v.author || "")),
      el("td", {}, el("span", { class: "pill" }, v.source)),
      el("td", { class: "num" }, ago(v.time)),
      el("td", {}, v.review ? (v.kind === "reply" ? "💬 " + v.review : v.review) : ""))));
    if (!rows.length) $("v-table").append(row(el("td", { class: "muted", colspan: "5" }, "最近還沒看影片")));
  }

  // ------------------------------------------------------------ 興趣
  const POL = { like: ["喜歡", "--c2"], curious: ["好奇", "--c1"], fatigue: ["看膩", "--c7"], dislike: ["不喜歡", "--c5"] };
  function renderInterests(items) {
    $("s-interest").hidden = !items.length;
    const top = Math.max(0.1, ...items.map((x) => x.weight));
    $("interests").replaceChildren(...items.map((x) => {
      const p = POL[x.polarity] || [x.polarity, "--c1"];
      return el("div", { class: "hbar", title: `${x.value}：${p[0]}` }, el("span", { class: "name" }, x.value),
        el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(100 * x.weight / top).toFixed(1)}%;background:var(${p[1]})` })),
        el("span", { class: "n" }, Number(x.weight).toFixed(1)));
    }));
    $("int-legend").replaceChildren(...Object.values(POL).map((p) => el("span", {}, el("i", { style: `background:var(${p[1]})` }), p[0])));
  }

  // ------------------------------------------------------------ 追劇
  const ranges = (nums) => { const a = [...new Set(nums || [])].sort((x, y) => x - y), out = [];
    for (let i = 0; i < a.length; i++) { let j = i; while (a[j + 1] === a[j] + 1) j++; out.push(i === j ? `${a[i]}` : `${a[i]}～${a[j]}`); i = j; }
    return out.join("、"); };
  function epLine(x) {
    const p = x.progress;
    if (!p) return x.total ? `看到第 ${x.watched} 集／共 ${x.total} 集` : "";
    const next = x.state === "active" ? ranges(p.new) : "";
    const gaps = ranges([...(p.missing || []), ...(next ? [] : p.new || [])]);
    return `看到第 ${p.current ?? "?"} 集／共 ${p.total ?? "?"} 集・看過 ${p.watched ?? 0} 集${gaps ? `（缺 ${gaps}）` : ""}${next ? `・接下來 ${next}` : ""}`;
  }
  const biItem = (title, author, line, tag) => el("div", { class: "bi" },
    el("div", { class: "t" }, title, tag ? " " : "", tag ? el("span", { class: "pill " + tag[1] }, tag[0]) : null),
    author ? el("div", { class: "d" }, author) : null, line ? el("div", {}, line) : null);
  function zone(id, nodes, none) {
    $(id + "-n").textContent = nodes.length ? `（${nodes.length}）` : "";
    $(id).replaceChildren(...(nodes.length ? nodes : [empty(none)]));
  }
  function renderBinge(series, queue) {
    const list = series.slice().reverse();
    zone("bz-active", list.filter((x) => x.state === "active").map((x) => biItem(x.title, x.author, epLine(x))), "目前沒有在看的合集");
    zone("bz-wait", list.filter((x) => x.state === "caught_up").map((x) => biItem(x.title, x.author, epLine(x))), "目前沒有等更新的合集");
    zone("bz-queue", queue.map((q) => biItem(`${q.rank}. ${q.title}`, q.author, "", q.has_new ? ["有新集", "ok"] : null)), "目前沒有在排隊的合集");
    const ended = list.filter((x) => !["active", "caught_up", "update_wait"].includes(x.state));
    $("bz-ended").hidden = !ended.length;
    $("bz-ended-sum").textContent = `已結束（${ended.length}）`;
    $("bz-ended-list").replaceChildren(...ended.map((x) => biItem(x.title, x.author, epLine(x), [x.status, x.state === "done" ? "" : "bad"])));
  }

  // ------------------------------------------------------------ 其他區
  function renderCabin(c, fromFirebase) {
    $("s-cabin").hidden = !c;
    if (!c) return;
    $("cabin-line").textContent = !c.open ? "🚪 小屋現在沒開" : c.asleep ? "💤 在小屋的床上睡覺"
      : "📍 在" + (c.place || "小屋") + (c.zone ? "（" + c.zone + "）" : "") + "・" + (c.doing || "沒在做什麼");
    const meta = [];
    if (c.open) {
      if (c.mood) meta.push("心情：" + c.mood);
      if (c.wallet != null) meta.push("零用錢 " + c.wallet);
      if (c.weather) meta.push(c.weather + (c.temp != null ? " " + Math.round(c.temp) + "°C" : ""));
    }
    if (c.img) meta.push("畫面拍於 " + clock(c.img));
    $("cabin-meta").textContent = meta.join("・");
    const img = $("cabin-img");
    img.hidden = true;
    if (fromFirebase) {
      if (typeof c.image_version === "string" && /^[0-9a-f]{64}$/.test(c.image_version)) {
        void loadCabinImage(img, c.image_version);
      }
    } else if (Number.isFinite(c.img)) {
      img.src = "data/cabin.jpg?v=" + c.img;
      img.hidden = false;
    }
    const today = c.today || [];
    $("cabin-today").replaceChildren(...(today.length ? today.map((x) => row(el("td", { class: "num" }, hm(x.t)), el("td", {}, x.text + (x.n > 1 ? `（${x.n} 次）` : ""))))
      : [row(el("td", { class: "muted" }, "今天在小屋還沒做什麼"))]));
  }
  function renderBrowse(b) {
    $("s-browse").hidden = !b;
    if (!b) return;
    const kws = (b.keywords || []).join("、");
    $("browse-meta").textContent = clock(b.time) + "，看了 " + b.picks.length + " 支" + (kws ? "，搜了：" + kws : "");
    $("picks").replaceChildren(head("分數", "影片", "為什麼點進去"), ...b.picks.map((p) => row(scoreCell(p.score), el("td", {}, link(p.title, null, p.bvid)), el("td", {}, p.why || ""))));
    const words = (b.next_keywords || []).join("、");
    $("next-kw").textContent = (b.next_at ? "下一輪大約 " + clock(b.next_at) : "") + (words ? (b.next_at ? "，" : "") + "想搜：" + words : "");
  }

  // ------------------------------------------------------------ 規則說明
  let rules = {};
  const dlg = $("help-dlg");
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button.help"); if (!b) return;
    const t = rules[b.dataset.help];
    $("help-title").textContent = (t && t.title) || "說明";
    $("help-body").replaceChildren(...(t && t.groups.length ? t.groups.flatMap((g) => [el("h4", {}, g.h), el("ul", {}, ...g.items.map((x) => el("li", {}, x)))])
      : [el("div", { class: "muted", style: "padding-top:10px" }, "目前讀不到這項規則")]));
    $("help-body").scrollTop = 0; dlg.showModal();
  });
  $("help-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  // ------------------------------------------------------------ 深淺色：只記在這台瀏覽器
  const store = { get() { try { return localStorage.getItem("theme"); } catch { return null; } }, set(v) { try { localStorage.setItem("theme", v); } catch {} } };
  const saved = store.get();
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  $("theme").onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; store.set(next);
  };

  function render(d, fromFirebase = false) {
    const stale = Date.now() / 1000 - d.generated_at > 3 * 3600;
    $("updated").textContent = "更新於 " + clock(d.generated_at) + "（" + ago(d.generated_at) + "）" + (stale ? "・家裡電腦可能關機了" : "");
    $("now-line").textContent = d.now.text;
    const formLine = $("form-line");
    const formName = d.form?.name;
    formLine.hidden = formName !== "大隻" && formName !== "Q 版";
    formLine.textContent = formLine.hidden ? "" : "現在：" + formName;
    $("stats").replaceChildren(...(d.now.chips || []).map((s) => el("span", { class: "pill" }, s)));
    rules = d.rules || {};
    document.querySelectorAll("button.help").forEach((b) => { b.hidden = !rules[b.dataset.help]; });
    videos = d.recent || []; renderVideos();
    renderInterests(d.interests || []);
    renderBinge(d.binge || [], d.queue || []);
    renderBrowse(d.browse);
    $("s-learned").hidden = !(d.learned || []).length;
    $("learned").replaceChildren(...(d.learned || []).map((k) => el("div", { class: "bi" }, k.body)));
    renderCabin(d.cabin, fromFirebase);
  }

  async function loadStatus() {
    if (firebaseDb) {
      try {
        const data = await readJson(firebaseDb + "/status.json");
        if (Number.isFinite(data?.generated_at) && typeof data?.now?.text === "string") {
          render(data, true);
          return;
        }
      } catch {
        // Firebase 無法讀取時沿用 Pages 快照。
      }
    }
    render(await readJson("data/status.json?t=" + Date.now()));
  }
  loadStatus().catch(() => {
    $("updated").textContent = "還沒有資料，或資料讀不到。";
    $("now-line").textContent = "大肥魚還沒上線";
  });
})();
