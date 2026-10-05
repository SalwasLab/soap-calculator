// Recipe summary, INCI names, print / PDF / JSON export, and the "open in a new tab" option.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const sc = window.soapCalc;
  const G = sc.G_PER;

  // Inside the published (framed) page, printing, downloads and new tabs are blocked.
  const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (framed) {
    // Hide what the embedding frame can't do; JSON export falls back to a copy box.
    document.querySelectorAll('[data-act="print"], [data-act="pdf"], .sum-opts').forEach((el) => { el.hidden = true; });
    document.querySelector(".tabs-opt").hidden = true;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const f = (n, d) => (Number.isFinite(n) ? n.toFixed(d) : "—");
  const ltr = (s) => `<span dir="ltr">${s}</span>`;
  // Number + unit as separate boxes: keeps their order (and the gap) intact in the PDF render.
  const nu = (a, b) => `<span class="nu"><span>${a}</span><span>${b}</span></span>`;
  const UNIT_SHORT = { g: "غ", oz: "أونصة", lb: "رطل" };

  // Weight cell (grams only).
  const triple = (g) => `<td>${f(g, 2)}</td>`;

  function bar(v) {
    const w = Math.max(0, Math.min(100, v));
    return `<td class="bar-cell"><span class="bar"><span style="width:${w}%"></span></span></td>`;
  }

  function buildSummary(res) {
    const u = res.unit;
    const name = $("recipeName").value.trim();
    const lyeName = res.lyeType === "koh" ? (res.koh90 ? "KOH 90%" : "KOH") : "NaOH";
    const r = (k) => Math.round(res.props[k]);
    const fragRateTxt = Number.isFinite(res.fragRate) ? +res.fragRate.toFixed(2) : 0;
    const fragUnit = u === "g" ? "غ" : "أونصة";
    const fragShown = u === "g" ? res.grams.fragrance : res.grams.fragrance / G.oz;

    const quality = sc.PROPS.filter((p) => p.min != null).map((p) => `
      <tr><th scope="row">${p.ar}</th><td>${ltr(p.min + " - " + p.max)}</td><td>${r(p.key)}</td>${p.key === "iodine" || p.key === "ins" ? "<td></td>" : bar(r(p.key))}</tr>`).join("");
    const acids = sc.PROPS.filter((p) => p.min == null).map((p) => `
      <tr><th scope="row">${p.ar}</th><td>${r(p.key)}</td>${bar(r(p.key))}</tr>`).join("");

    const oils = res.rows.map((row, n) => {
      const g = row.wt * G[u];
      return `<tr><td>${n + 1}</td><td><input type="checkbox" aria-label="تم وزن ${esc(row.oil.ar)}"><span class="print-box"></span></td><td>${esc(row.oil.ar)}</td><td>${f(row.pct, 2)}</td>${triple(g)}</tr>`;
    }).join("");
    const oilsG = res.rows.reduce((s, row) => s + row.wt * G[u], 0);

    const brand = `
      <div class="sum-brand">
        ${window.BRAND_LOGO ? `<img src="${window.BRAND_LOGO}" alt="شعار معمل الطبيعة">` : ""}
        <div class="sum-brand-text">
          <b>معمل الطبيعة</b>
          <span class="sum-brand-line"><span>دورة الصابون</span><span>المدربة: سلوى شرف</span></span>
          <span class="sum-brand-site" dir="ltr">www.salwalab.com</span>
        </div>
      </div>`;

    return `
      ${brand}
      ${name ? `<h2 class="sum-title">${esc(name)}</h2>` : ""}
      <div class="kv-grid">
        <div class="frame cyan"><table class="sum-table kv">
          <tr><th scope="row">وزن الزيوت الإجمالي</th><td>${nu(+(res.grams.oils / G[u]).toFixed(3), UNIT_SHORT[u])}</td></tr>
          <tr><th scope="row">الماء كنسبة من وزن الزيوت</th><td>${f(res.waterPctOfOils, 2)}%</td></tr>
          <tr><th scope="row">الدهن الزائد / خصم القلوي</th><td>${+res.superfat}%</td></tr>
          <tr class="strong"><th scope="row">تركيز القلوي</th><td>${f(res.lyeConcentration, 3)}%</td></tr>
          <tr><th scope="row">نسبة الماء إلى القلوي</th><td>${ltr(f(res.waterLyeRatio, 4) + ":1")}</td></tr>
        </table></div>
        <div class="frame cyan"><table class="sum-table kv">
          <tr><th scope="row">مشبع : غير مشبع</th><td>${ltr(res.satUnsat)}</td></tr>
          <tr><th scope="row">اليود</th><td>${r("iodine")}</td></tr>
          <tr><th scope="row">INS</th><td>${r("ins")}</td></tr>
          <tr><th scope="row">معدل العطر</th><td>${nu(fragRateTxt, u === "g" ? "غ لكل كغ" : "أونصة لكل رطل")}</td></tr>
          <tr><th scope="row">وزن العطر</th><td>${nu(+fragShown.toFixed(2), fragUnit)}</td></tr>
        </table></div>
      </div>

      <div class="frame"><table class="sum-table items">
        <thead><tr><th scope="col">البند</th><th scope="col">غرامات</th></tr></thead>
        <tbody>
          <tr class="water"><th scope="row">الماء</th>${triple(res.grams.water)}</tr>
          <tr class="lye"><th scope="row">${nu("القلوي", `<b dir="ltr">${lyeName}</b>`)}</th>${triple(res.grams.lye)}</tr>
          <tr class="oils"><th scope="row">الزيوت</th>${triple(oilsG)}</tr>
          <tr class="frag"><th scope="row">العطر</th>${triple(res.grams.fragrance)}</tr>
          <tr class="total"><th scope="row">وزن الصابون قبل التجفيف (البارد) أو الطهي (الساخن)</th>${triple(oilsG + res.grams.lye + res.grams.water + res.grams.fragrance)}</tr>
        </tbody>
      </table></div>

      <div class="frame"><table class="sum-table oil-list">
        <thead><tr><th scope="col">#</th><th scope="col">✓</th><th scope="col">الزيت / الدهن</th><th scope="col">%</th><th scope="col">غرامات</th></tr></thead>
        <tbody>${oils}</tbody>
        <tfoot><tr><td></td><td></td><th scope="row">المجموع</th><td>${f(res.totalPct, 2)}</td>${triple(oilsG)}</tr></tfoot>
      </table></div>

      <div class="qa-grid">
        <div class="frame green"><table class="sum-table quality">
          <thead><tr><th scope="col">جودة قالب الصابون</th><th scope="col">المدى</th><th scope="col" colspan="2">وصفتك</th></tr></thead>
          <tbody>${quality}</tbody>
        </table></div>
        <div class="frame cyan"><table class="sum-table acids">
          <tbody>${acids}</tbody>
        </table></div>
      </div>`;
  }

  // ---------- Show / hide ----------
  const editorParts = () => [document.querySelector(".grid"), document.querySelector(".load-row")];

  function setView(view) {
    editorParts().forEach((el) => { el.hidden = view !== "editor"; });
    $("summary").hidden = view !== "summary";
    $("inciView").hidden = view !== "inci";
    $("jsonBox").hidden = true;
    $("sumNote").hidden = true;
    window.scrollTo(0, 0);
  }

  function syncNotes() {
    $("additives").value = sc.extra.additives;
    $("notes").value = sc.extra.notes;
    document.querySelectorAll(".print-text").forEach((el) => { el.textContent = $(el.dataset.for).value; });
  }
  ["additives", "notes"].forEach((id) => $(id).addEventListener("input", () => {
    sc.extra[id] = $(id).value;
    document.querySelector(`.print-text[data-for="${id}"]`).textContent = $(id).value;
    sc.autosave();
  }));

  function openSummary() {
    const res = sc.recalc();
    if (!res.valid) return;
    if ($("newTab").checked && openInNewTab(res)) return;
    $("sumBody").innerHTML = buildSummary(res);
    syncNotes();
    setView("summary");
  }

  $("viewSummary").addEventListener("click", openSummary);

  function note(msg) {
    $("sumNote").textContent = msg;
    $("sumNote").hidden = false;
  }

  document.querySelectorAll("#summary [data-act]").forEach((btn) => btn.addEventListener("click", () => {
    const act = btn.dataset.act;
    if (act === "edit") setView("editor");
    else if (act === "json") exportJSON();
    else if (act === "pdf") savePDF();
    else if (act === "inci") showInci();
    else if (act === "print") doPrint();
  }));

  // ---------- Print ----------
  function doPrint() {
    document.body.classList.toggle("print-charts", $("printCharts").checked);
    document.body.classList.toggle("print-plain", $("printPlain").checked);
    window.print();
  }

  // ---------- PDF (html2pdf, loaded on first use) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function savePDF() {
    try {
      if (!window.html2pdf) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js");
    } catch (e) {
      note("تعذّر تحميل أداة PDF (تحتاج اتصالًا بالإنترنت). استخدم زر «طباعة» واختر «حفظ بتنسيق PDF».");
      return;
    }
    document.body.classList.add("pdf-mode");
    document.body.classList.toggle("print-charts", $("printCharts").checked);
    document.body.classList.toggle("print-plain", $("printPlain").checked);
    const name = $("recipeName").value.trim() || "soap-recipe";
    try {
      await window.html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: name.replace(/[\\/:*?"<>|]/g, "-") + ".pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all"] }
      }).from($("printArea") || buildPrintArea()).save();
    } finally {
      document.body.classList.remove("pdf-mode");
      const pa = $("printArea"); if (pa) pa.remove();
    }
  }
  // The PDF gets the summary tables and the notes, without buttons.
  function buildPrintArea() {
    const div = document.createElement("div");
    div.id = "printArea";
    div.className = "summary print-area";
    div.dir = "rtl";
    div.innerHTML = $("sumBody").innerHTML + notesHTML();
    // html2canvas drops the spaces between Arabic words; non-breaking spaces survive.
    // Only touch nodes with real text, so the whitespace between table tags stays as it is.
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim()) node.nodeValue = node.nodeValue.replace(/ /g, " ");
    }
    document.body.appendChild(div);
    return div;
  }
  function notesHTML() {
    const a = $("additives").value.trim(), n = $("notes").value.trim();
    if (!a && !n) return "";
    return `<div class="sum-notes static">
      <div><b>الإضافات</b><p>${esc(a).replace(/\n/g, "<br>")}</p></div>
      <div><b>ملاحظات</b><p>${esc(n).replace(/\n/g, "<br>")}</p></div>
    </div>`;
  }

  // ---------- JSON export ----------
  function exportJSON() {
    const text = JSON.stringify(sc.toJSON(), null, 2);
    if (!framed) {
      try {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url; a.download = "soap-recipe.json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      } catch (e) { /* fall through to copy box */ }
    }
    $("jsonText").value = text;
    $("jsonBox").hidden = false;
  }
  $("copyJson").addEventListener("click", () => copyText($("jsonText").value, $("jsonText"), $("copyJson")));
  $("closeJson").addEventListener("click", () => { $("jsonBox").hidden = true; });

  function copyText(text, fallbackEl, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = "تم النسخ"; setTimeout(() => { btn.textContent = t; }, 1500); };
    const fallback = () => {
      if (fallbackEl && fallbackEl.select) { fallbackEl.select(); }
      else if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      btn.textContent = "النص محدد، اضغط Ctrl+C";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // ---------- INCI ----------
  function showInci() {
    const res = sc.last;
    const rows = res.rows.slice().sort((a, b) => b.pct - a.pct);
    $("inciRows").innerHTML = rows.map((r) => {
      const inci = r.oil.inci
        ? (r.oil.inciSuggested ? `<span class="muted-txt">لا يوجد اسم INCI معتمد — المقترح:</span> <span dir="ltr">${esc(r.oil.inci)}</span>` : `<span dir="ltr">${esc(r.oil.inci)}</span>`)
        : "—";
      return `<tr><td>${+r.pct.toFixed(2)}%</td><td>${esc(r.oil.ar)} <bdi class="en-small">${esc(r.oil.en)}</bdi></td><td>${inci}</td></tr>`;
    }).join("");
    const seen = new Set();
    $("inciList").textContent = rows.map((r) => r.oil.inci).filter((n) => n && !seen.has(n) && seen.add(n)).join(", ");
    setView("inci");
  }
  $("copyInci").addEventListener("click", () => copyText($("inciList").textContent, $("inciList"), $("copyInci")));
  $("backFromInci").addEventListener("click", () => setView("summary"));

  // ---------- Open in a new tab ----------
  function openInNewTab(res) {
    if (framed) return false;
    const w = window.open("", "_blank");
    if (!w) return false;
    const base = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <base href="${base}">
      <title>${esc($("recipeName").value.trim() || "ملخص الوصفة")}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Tajawal:wght@400;500;700;800&display=swap">
      <link rel="stylesheet" href="styles.css"></head>
      <body><main class="sheet"><section class="summary">
        <div class="sum-actions"><button type="button" class="btn dark" onclick="print()">طباعة</button></div>
        <div class="sum-body">${buildSummary(res)}</div>${notesHTML()}
      </section></main></body></html>`);
    w.document.close();
    return true;
  }
})();
