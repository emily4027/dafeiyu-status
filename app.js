// 讀 data/status.json 畫出近況。資料由家裡電腦上的 AstrBot 插件 astrbot_plugin_status_page 產生。
(function () {
  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) n.append(c instanceof Node ? c : String(c));
    return n;
  }

  function ago(ts) {
    const s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 90) return "剛剛";
    if (s < 3600) return Math.round(s / 60) + " 分鐘前";
    if (s < 86400) return Math.round(s / 3600) + " 小時前";
    return Math.round(s / 86400) + " 天前";
  }

  function clock(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function scoreClass(s) {
    if (s == null) return "";
    return s >= 7.5 ? "hi" : s >= 6 ? "mid" : "lo";
  }

  function render(d) {
    const stale = Date.now() / 1000 - d.generated_at > 3 * 3600;
    $("updated").textContent = "更新於 " + clock(d.generated_at) + "（" + ago(d.generated_at) + "）" + (stale ? "・家裡電腦可能關機了" : "");

    $("now-line").textContent = d.now.text;
    const stats = $("stats");
    stats.replaceChildren();
    for (const s of d.now.chips || []) stats.append(el("li", {}, s));

    const vids = $("videos");
    vids.replaceChildren();
    for (const v of d.recent || []) {
      const row = el("div", { class: "vrow" },
        el("span", { class: "score " + scoreClass(v.score) }, v.score == null ? "–" : v.score),
        el("a", { class: "vtitle", href: v.url, target: "_blank", rel: "noopener" }, v.title));
      const meta = el("div", { class: "vmeta" },
        el("span", { class: "tag" }, v.source), (v.author ? "UP：" + v.author + "・" : "") + ago(v.time));
      const li = el("li", {}, row, meta);
      if (v.review) li.append(el("p", { class: "vreview" }, v.review));
      vids.append(li);
    }
    if (!vids.children.length) vids.append(el("li", { class: "muted" }, "最近還沒看影片"));

    const b = d.browse;
    if (b) {
      $("browse-card").hidden = false;
      const kws = (b.keywords || []).join("、");
      $("browse-meta").textContent = clock(b.time) + "，看了 " + b.picks.length + " 支" + (kws ? "，搜了：" + kws : "");
      const picks = $("picks");
      picks.replaceChildren();
      for (const p of b.picks) {
        picks.append(el("li", {},
          el("div", { class: "vrow" },
            el("span", { class: "score " + scoreClass(p.score) }, p.score == null ? "–" : p.score),
            el("a", { class: "vtitle", href: "https://www.bilibili.com/video/" + p.bvid, target: "_blank", rel: "noopener" }, p.title)),
          p.why ? el("div", { class: "why vmeta" }, "為什麼點進去：" + p.why) : null));
      }
      const nk = $("next-kw");
      nk.replaceChildren();
      if (b.next_at || (b.next_keywords || []).length) {
        nk.append(b.next_at ? "下一輪大約 " + clock(b.next_at) + "，" : "", "想搜：");
        for (const k of b.next_keywords || []) nk.append(el("span", { class: "kw" }, k));
      }
    }

    const binge = $("binge");
    binge.replaceChildren();
    for (const s of d.binge || []) {
      binge.append(el("li", {}, el("b", {}, s.title), "（" + (s.author || "") + "）", " 看到第 " + s.watched + "／" + s.total + " 集・" + s.status));
    }
    $("binge-card").hidden = !binge.children.length;

    const learned = $("learned");
    learned.replaceChildren();
    for (const k of d.learned || []) learned.append(el("li", {}, k.body));
    $("learn-card").hidden = !learned.children.length;
  }

  fetch("data/status.json?t=" + Date.now(), { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(() => { $("updated").textContent = "還沒有資料，或資料讀不到。"; $("now-line").textContent = "大肥魚還沒上線"; });
})();
