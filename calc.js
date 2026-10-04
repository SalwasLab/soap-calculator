// Soap calculator: UI wiring + calculation engine.
// Behaviour mirrors the reference calculator:
//  - typing a % sets that oil's weight to % × total oil weight;
//  - typing a weight makes the total the sum of weights and recomputes every %;
//  - changing the total rescales every weight;
//  - the "الكل" column is the %-weighted average of each oil's own values, rounded;
//  - NaOH = Σ weight × KOH SAP × 40/56.1 × (1 − superfat).
(function () {
  "use strict";

  // When published, the page is wrapped in a host document without dir/lang; make the whole page RTL Arabic.
  document.documentElement.setAttribute("dir", "rtl");
  document.documentElement.setAttribute("lang", "ar");

  const $ = (id) => document.getElementById(id);
  const SLOTS = 14;
  const NAOH_PER_KOH = 40 / 56.1;
  const G_PER = { g: 1, oz: 28.349523125, lb: 453.59237 };

  const UNIT = {
    g:  { short: "غ",     frag: "العطر (غ/كغ)",       fragUnit: "غ" },
    oz: { short: "أونصة", frag: "العطر (أونصة/رطل)", fragUnit: "أونصة" },
    lb: { short: "رطل",   frag: "العطر (أونصة/رطل)", fragUnit: "أونصة" }
  };

  // Soap qualities and fatty acids, with the tooltip text shown on hover/tap.
  const PROPS = [
    { key: "hardness",     ar: "الصلابة",   min: 29,  max: 54,  desc: "كلما ارتفع الرقم كان القالب أصلب." },
    { key: "cleansing",    ar: "التنظيف",   min: 12,  max: 22,  desc: "كل صابون ينظّف، لكن الأرقام الأعلى تنظّف بقوة أكبر وقد تجفف البشرة." },
    { key: "conditioning", ar: "الترطيب",   min: 44,  max: 69,  desc: "كلما ارتفع الرقم زادت نعومة الصابون على البشرة." },
    { key: "bubbly",       ar: "الفقاعات",  min: 14,  max: 46,  desc: "كلما ارتفع الرقم كثرت الرغوة الكبيرة الخفيفة." },
    { key: "creamy",       ar: "الكريمية",  min: 16,  max: 48,  desc: "كلما ارتفع الرقم صارت الرغوة أكثف وأنعم." },
    { key: "iodine",       ar: "اليود",     min: 41,  max: 70,  desc: "الرقم الأقل يعني قالبًا أصلب؛ وفوق 70 قد يلين الصابون." },
    { key: "ins",          ar: "INS",       min: 136, max: 165, desc: "مقياس عام لصلابة القالب وجودته؛ القيمة المثالية الشائعة 160." },
    { key: "lauric",       ar: "لوريك",     tag: "12:0 · مشبع",  desc: "يعطي صلابة وتنظيفًا قويًا ورغوة كثيرة." },
    { key: "myristic",     ar: "ميريستيك",  tag: "14:0 · مشبع",  desc: "يعطي صلابة وتنظيفًا ورغوة كثيفة." },
    { key: "palmitic",     ar: "بالميتيك",  tag: "16:0 · مشبع",  desc: "يعطي صلابة ورغوة ثابتة كريمية." },
    { key: "stearic",      ar: "ستياريك",   tag: "18:0 · مشبع",  desc: "يعطي صلابة ورغوة ثابتة كريمية." },
    { key: "ricinoleic",   ar: "ريسينوليك", tag: "18:1 · أحادي غير مشبع", desc: "موجود في زيت الخروع؛ يرطب ويثبّت الرغوة." },
    { key: "oleic",        ar: "أوليك",     tag: "18:1 · أحادي غير مشبع", desc: "يرطب البشرة؛ الحمض الغالب في زيت الزيتون." },
    { key: "linoleic",     ar: "لينوليك",   tag: "18:2 · متعدد غير مشبع", desc: "يرطب، لكن الكثير منه يقصّر عمر الصابون." },
    { key: "linolenic",    ar: "لينولينيك", tag: "18:3 · متعدد غير مشبع", desc: "يرطب، لكنه أسرع الأحماض تأكسدًا." }
  ];
  const SAT = ["lauric", "myristic", "palmitic", "stearic"];
  const UNSAT = ["ricinoleic", "oleic", "linoleic", "linolenic"];

  const state = {
    selected: -1,
    recipe: Array(SLOTS).fill(null) // { oil, pct: number|null, wt: number|null }
  };

  const unit = () => $("unit").value;

  // Accept Arabic-Indic digits and the Arabic decimal comma as well as Western input.
  function parseNum(s) {
    if (s == null) return NaN;
    const t = String(s).trim()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[٫,]/g, ".");
    return t === "" ? NaN : Number(t);
  }
  const fmt = (n, d) => (Number.isFinite(n) ? n.toFixed(d) : "");

  // ---------- Help toggles ----------
  document.querySelectorAll(".q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = $(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      panel.hidden = open;
    });
  });

  // ---------- Properties table + tooltips ----------
  $("propRows").innerHTML = PROPS.map((p) => `
    <tr data-key="${p.key}">
      <th scope="row" tabindex="0" data-tip="${p.key}">${p.ar}</th>
      <td data-col="one">0</td>
      <td data-col="all">0</td>
    </tr>`).join("");
  const cell = (key, col) => document.querySelector(`#propRows tr[data-key="${key}"] td[data-col="${col}"]`);

  const tip = $("tip");
  function showTip(th) {
    const p = PROPS.find((x) => x.key === th.dataset.tip);
    const line = p.min != null ? `المدى المقترح: ${p.min} – ${p.max}` : p.tag;
    tip.innerHTML = `<b>${p.ar}</b>${line}<br>${p.desc}`;
    tip.hidden = false;
    const r = th.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + tip.offsetHeight > window.innerHeight - 8) top = r.top - tip.offsetHeight - 6;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  $("propRows").addEventListener("mouseover", (e) => { const th = e.target.closest("th[data-tip]"); if (th) showTip(th); });
  $("propRows").addEventListener("mouseout", (e) => { if (e.target.closest("th[data-tip]")) hideTip(); });
  $("propRows").addEventListener("focusin", (e) => { const th = e.target.closest("th[data-tip]"); if (th) showTip(th); });
  $("propRows").addEventListener("focusout", hideTip);
  $("propRows").addEventListener("click", (e) => { const th = e.target.closest("th[data-tip]"); if (th) showTip(th); });
  window.addEventListener("scroll", hideTip, { passive: true });

  // ---------- Oil list ----------
  const norm = (s) => s.toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");

  // Alphabetical by Arabic name, ignoring a leading "ال" (so "السمن" sorts under س).
  const sortKey = (s) => s.replace(/^ال/, "");
  const order = window.OILS.map((o, i) => i)
    .sort((a, b) => sortKey(window.OILS[a].ar).localeCompare(sortKey(window.OILS[b].ar), "ar"));

  $("oilSelect").innerHTML = order.map((i) =>
    `<option value="${i}" title="${window.OILS[i].en}">${window.OILS[i].ar}</option>`).join("");

  // Saturated : unsaturated, normalised to 100 (e.g. "40 : 60").
  function satUnsat(src) {
    const sat = SAT.reduce((s, k) => s + (src[k] || 0), 0);
    const unsat = UNSAT.reduce((s, k) => s + (src[k] || 0), 0);
    if (sat + unsat <= 0) return "لا توجد بيانات";
    const s = Math.round((sat / (sat + unsat)) * 100);
    return `${s} : ${100 - s}`;
  }

  function selectOil(i) {
    state.selected = i;
    const o = window.OILS[i];
    $("oilSelect").value = String(i);
    $("sapKoh").textContent = o.koh.toFixed(3);
    $("sapNaoh").textContent = o.naoh.toFixed(3);
    PROPS.forEach((p) => { cell(p.key, "one").textContent = o[p.key]; });
    $("satRatio").textContent = satUnsat(o);
    $("addOil").disabled = false;
    updatePlusButtons();
  }

  // "+" puts the selected oil into a slot: only for empty slots, and only if that oil isn't already used.
  function updatePlusButtons() {
    const used = state.recipe.some((r) => r && r.oil === state.selected);
    document.querySelectorAll("#recipeRows .sq.plus").forEach((b) => {
      b.disabled = state.selected < 0 || used || !!state.recipe[Number(b.closest("tr").dataset.slot)];
    });
  }

  $("oilSelect").addEventListener("change", () => selectOil(Number($("oilSelect").value)));
  $("oilSelect").addEventListener("dblclick", () => { if ($("oilSelect").value !== "") addToRecipe(); });
  $("oilSelect").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addToRecipe(); } });

  // "Jump to oil": select the first match by Arabic or English name.
  $("oilJump").addEventListener("input", () => {
    const q = norm($("oilJump").value.trim());
    if (!q) return;
    const hit = order.find((i) => norm(window.OILS[i].ar).includes(q)) ??
                order.find((i) => norm(window.OILS[i].en).includes(q));
    if (hit != null) selectOil(hit);
  });
  $("oilJump").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && state.selected >= 0) { e.preventDefault(); addToRecipe(); }
  });
  $("addOil").addEventListener("click", () => addToRecipe());

  // ---------- Recipe slots ----------
  let notice = "";   // one-off message (duplicate oil, full list) shown until the next change

  function addToRecipe(slot) {
    if (state.selected < 0) return;
    if (state.recipe.some((r) => r && r.oil === state.selected)) {
      notice = "هذا الزيت موجود في الوصفة بالفعل.";
      recalc();
      return;
    }
    const idx = typeof slot === "number" ? slot : state.recipe.findIndex((r) => !r);
    if (idx < 0) { notice = "امتلأت الخانات الأربع عشرة. احذف زيتًا لتضيف غيره."; recalc(); return; }
    state.recipe[idx] = { oil: state.selected, pct: null, wt: null };
    renderSlots();
  }

  function renderSlots() {
    $("recipeRows").innerHTML = state.recipe.map((r, i) => {
      const o = r ? window.OILS[r.oil] : null;
      return `
      <tr data-slot="${i}">
        <td>
          <button type="button" class="sq plus" data-act="add" aria-label="ضع الزيت المحدد في الخانة ${i + 1}">+</button><button
            type="button" class="sq minus" data-act="del" aria-label="احذف زيت الخانة ${i + 1}">-</button>
        </td>
        <td class="name">${i + 1}. ${o ? o.ar : ""}</td>
        <td><input type="text" inputmode="decimal" id="pct-${i}" aria-label="نسبة الخانة ${i + 1}" value="${r ? fmt(r.pct, 2) : ""}" ${o ? "" : "disabled"}></td>
        <td><input type="text" inputmode="decimal" id="wt-${i}" aria-label="وزن الخانة ${i + 1}" value="${r ? fmt(r.wt ?? 0, 3) : ""}" ${o ? "" : "disabled"}></td>
      </tr>`;
    }).join("");
    updatePlusButtons();
    recalc();
  }

  // Refresh the % and weight boxes, skipping the one the user is typing in.
  function syncSlotInputs(except) {
    state.recipe.forEach((r, i) => {
      if (!r) return;
      const p = $("pct-" + i), w = $("wt-" + i);
      if (p !== except) p.value = r.pct == null ? "" : fmt(r.pct, 2);
      if (w !== except) w.value = fmt(r.wt ?? 0, 3);
    });
  }

  $("recipeRows").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const slot = Number(btn.closest("tr").dataset.slot);
    if (btn.dataset.act === "add") addToRecipe(slot);
    else { state.recipe[slot] = null; renderSlots(); }
  });

  $("recipeRows").addEventListener("input", (e) => {
    const m = e.target.id.match(/^(pct|wt)-(\d+)$/);
    if (!m) return;
    const r = state.recipe[Number(m[2])];
    if (!r) return;
    const v = parseNum(e.target.value);
    if (m[1] === "pct") {
      r.pct = Number.isFinite(v) ? v : null;
      const total = parseNum($("oilWeight").value);
      r.wt = r.pct != null && Number.isFinite(total) ? (r.pct / 100) * total : 0;
    } else {
      r.wt = Number.isFinite(v) ? v : 0;
      const total = state.recipe.reduce((s, x) => s + (x ? x.wt || 0 : 0), 0);
      $("oilWeight").value = +total.toFixed(3);
      state.recipe.forEach((x) => { if (x) x.pct = total > 0 ? +(((x.wt || 0) / total) * 100).toFixed(2) : 0; });
    }
    syncSlotInputs(e.target);
    recalc();
  });
  // Tidy the number format once the user leaves a box.
  $("recipeRows").addEventListener("focusout", (e) => {
    if (/^(pct|wt)-\d+$/.test(e.target.id)) syncSlotInputs(null);
  });

  $("resetAll").addEventListener("click", () => {
    state.recipe = Array(SLOTS).fill(null);
    renderSlots();
  });

  // ---------- Engine ----------
  // Returns everything the page and the recipe summary need. Weights are in the selected unit.
  function compute() {
    const u = unit();
    const rows = state.recipe.map((r, slot) => (r ? { slot, oil: window.OILS[r.oil], pct: r.pct || 0, wt: r.wt || 0 } : null)).filter(Boolean);
    const totalPct = rows.reduce((s, r) => s + r.pct, 0);
    const oilWeight = parseNum($("oilWeight").value);
    const superfat = parseNum($("superfat").value);
    const fragRate = parseNum($("fragRate").value);
    const waterMode = $("waterMode").value;
    const lyeType = $("lyeKoh").checked ? "koh" : "naoh";
    const koh90 = lyeType === "koh" && $("koh90").checked;

    // Quality averages, weighted by each oil's %.
    const props = {};
    PROPS.forEach((p) => { props[p.key] = rows.reduce((s, r) => s + (r.pct * r.oil[p.key]) / 100, 0); });

    const errors = [];
    if (!rows.length) errors.push("أضف زيتًا واحدًا على الأقل إلى الوصفة.");
    else if (Math.abs(totalPct - 100) > 0.005) errors.push(`يجب أن يكون مجموع النسب 100%. المجموع الحالي <b>${totalPct.toFixed(2)}%</b>.`);
    if (!(oilWeight > 0)) errors.push("أدخل وزنًا صحيحًا للزيوت أكبر من صفر.");
    if (!(superfat >= 0 && superfat < 100)) errors.push("أدخل نسبة دهن زائد بين 0 و99.");
    if (!(fragRate >= 0)) errors.push("أدخل معدل عطر صحيحًا، أو 0 إذا لم تستخدم عطرًا.");

    // Lye
    const kohNeed = rows.reduce((s, r) => s + r.wt * r.oil.koh, 0);
    let lye = lyeType === "koh" ? kohNeed : kohNeed * NAOH_PER_KOH;
    lye *= 1 - (Number.isFinite(superfat) ? superfat : 0) / 100;
    if (koh90) lye /= 0.9;

    // Water
    let water = NaN;
    const wv = $("waterValue").value.trim();
    if (waterMode === "ratio") {
      const parts = wv.split(/[:：]/).map(parseNum);
      const ratio = parts.length === 2 ? parts[0] / parts[1] : parts[0];
      if (ratio > 0 && Number.isFinite(ratio)) water = lye * ratio;
      else errors.push("أدخل نسبة الماء إلى القلوي بالشكل 2:1 أو رقمًا مثل 2.");
    } else {
      const v = parseNum(wv);
      if (waterMode === "pct") {
        if (v > 0) water = (oilWeight * v) / 100;
        else errors.push("أدخل نسبة ماء صحيحة أكبر من صفر.");
      } else {
        if (v > 0 && v < 100) water = (lye * (100 - v)) / v;
        else errors.push("أدخل تركيز قلوي بين 1 و99.");
      }
    }

    // Fragrance: g/kg for grams, oz/lb for ounces and pounds.
    let fragrance = 0;                        // in grams
    if (fragRate > 0 && oilWeight > 0) {
      fragrance = u === "g" ? (oilWeight * fragRate) / 1000
        : u === "lb" ? oilWeight * fragRate * G_PER.oz
        : (oilWeight / 16) * fragRate * G_PER.oz;
    }

    const g = G_PER[u];
    return {
      unit: u, lyeType, koh90, waterMode, waterValue: wv, superfat, fragRate,
      rows, totalPct, props, satUnsat: satUnsat(props), errors, valid: errors.length === 0,
      grams: {
        oils: oilWeight * g,
        lye: lye * g,
        water: water * g,
        fragrance,
        total: (oilWeight + lye + water) * g + fragrance
      },
      waterPctOfOils: (water / oilWeight) * 100,
      lyeConcentration: (lye / (lye + water)) * 100,
      waterLyeRatio: water / lye
    };
  }

  function recalc() {
    const res = compute();
    const has = res.rows.length > 0;

    PROPS.forEach((p) => {
      const td = cell(p.key, "all");
      const v = Math.round(res.props[p.key]);
      td.textContent = v;
      td.classList.toggle("off", has && Math.abs(res.totalPct - 100) <= 0.005 && p.min != null && (v < p.min || v > p.max));
      td.title = p.min != null && td.classList.contains("off") ? `خارج المدى المقترح (${p.min} – ${p.max})` : "";
    });

    const sumWt = res.rows.reduce((s, r) => s + r.wt, 0);
    $("totalPct").textContent = res.totalPct.toFixed(2) + "%";
    $("totalWt").innerHTML = sumWt.toFixed(3) + `<span data-unit>${UNIT[res.unit].short}</span>`;

    const fragDisplay = res.unit === "g" ? res.grams.fragrance : res.grams.fragrance / G_PER.oz;
    $("fragAmount").value = +fragDisplay.toFixed(res.unit === "g" ? 1 : 2);

    const msg = notice || res.errors[0] || "";
    notice = "";
    $("recipeMsg").innerHTML = msg;
    $("recipeMsg").hidden = !msg;
    $("viewSummary").disabled = !res.valid;
    window.soapCalc.last = res;
    return res;
  }

  // ---------- Settings ----------
  let lastUnit = unit();
  function applyUnit() {
    const u = unit();
    // Keep the fragrance rate meaningful when switching metric ↔ imperial (1 oz/lb = 62.5 g/kg).
    const rate = parseNum($("fragRate").value);
    if (Number.isFinite(rate) && (lastUnit === "g") !== (u === "g")) {
      $("fragRate").value = u === "g" ? +(rate * 62.5).toFixed(1) : +(rate / 62.5).toFixed(2);
    }
    lastUnit = u;
    document.querySelectorAll("[data-unit]").forEach((el) => { el.textContent = UNIT[u].short; });
    document.querySelectorAll("[data-unit-en]").forEach((el) => { el.textContent = UNIT[u].short; });
    $("fragRateLabel").textContent = UNIT[u].frag;
    $("fragAmount").nextElementSibling.textContent = UNIT[u].fragUnit;
    recalc();
  }
  $("unit").addEventListener("change", applyUnit);

  // Changing the total oil weight rescales every oil's weight from its %.
  $("oilWeight").addEventListener("input", () => {
    const total = parseNum($("oilWeight").value);
    state.recipe.forEach((r) => { if (r) r.wt = r.pct != null && Number.isFinite(total) ? (r.pct / 100) * total : 0; });
    syncSlotInputs(null);
    recalc();
  });
  ["superfat", "fragRate", "waterValue", "koh90"].forEach((id) => $(id).addEventListener("input", recalc));
  $("koh90").addEventListener("change", recalc);

  document.querySelectorAll('input[name="lye"]').forEach((r) => r.addEventListener("change", () => {
    const koh = $("lyeKoh").checked;
    $("koh90").disabled = !koh;
    $("koh90Label").classList.toggle("muted", !koh);
    if (!koh) $("koh90").checked = false;
    recalc();
  }));

  const WATER = {
    pct:   { label: "أدخل النسبة % (مثلًا 38)",  value: "38" },
    conc:  { label: "أدخل التركيز % (مثلًا 33)", value: "33" },
    ratio: { label: "أدخل النسبة (مثلًا 2:1)",   value: "2:1" }
  };
  $("waterMode").addEventListener("change", () => {
    const m = WATER[$("waterMode").value];
    $("waterValueLabel").textContent = m.label;
    $("waterValue").value = m.value;
    recalc();
  });

  // ---------- Save / load (JSON) ----------
  // Same shape as the reference calculator's export, so files move between the two.
  // We also write each oil's English name, which the loader uses when an id is unknown.
  const UNIT_NAMES = { lb: "Pounds", oz: "Ounces", g: "Grams" };
  const WATER_NAMES = { pct: "water_percentage", conc: "lye_concentration", ratio: "water_lye_ratio" };
  const extra = { additives: "", notes: "" };   // filled in by the summary page

  function toJSON() {
    const total = parseNum($("oilWeight").value);
    return {
      lyeType: $("lyeKoh").checked ? "KOH" : "NaOH",
      is90KOH: $("koh90").checked,
      oilWeightUnit: UNIT_NAMES[unit()],
      oilWeightValue: Number.isFinite(total) ? total : 0,
      waterOption: WATER_NAMES[$("waterMode").value],
      waterValue: $("waterMode").value === "ratio" ? $("waterValue").value.trim() : parseNum($("waterValue").value),
      superFat: parseNum($("superfat").value),
      fragrance: parseNum($("fragRate").value),
      selectedOils: state.recipe.filter(Boolean).map((r) => ({
        id: window.OILS[r.oil].refId,
        name: window.OILS[r.oil].en,
        amount: r.pct ?? 0,
        weight: fmt(r.wt ?? 0, 3)
      })),
      recipeName: $("recipeName").value,
      additives: extra.additives,
      notes: extra.notes
    };
  }

  // Returns the list of oils that couldn't be matched (empty when everything loaded).
  function applyJSON(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.selectedOils)) throw new Error("bad file");
    const unitKey = Object.keys(UNIT_NAMES).find((k) => UNIT_NAMES[k] === d.oilWeightUnit) || "g";
    $("unit").value = unitKey;
    lastUnit = unitKey;                                    // don't convert the fragrance rate on load
    $(String(d.lyeType).toUpperCase() === "KOH" ? "lyeKoh" : "lyeNaoh").checked = true;
    $("koh90").disabled = String(d.lyeType).toUpperCase() !== "KOH";
    $("koh90Label").classList.toggle("muted", $("koh90").disabled);
    $("koh90").checked = !$("koh90").disabled && !!d.is90KOH;
    $("oilWeight").value = d.oilWeightValue ?? "";
    const mode = Object.keys(WATER_NAMES).find((k) => WATER_NAMES[k] === d.waterOption) || "pct";
    $("waterMode").value = mode;
    $("waterValueLabel").textContent = WATER[mode].label;
    $("waterValue").value = d.waterValue ?? WATER[mode].value;
    $("superfat").value = d.superFat ?? 5;
    $("fragRate").value = d.fragrance ?? 0;
    $("recipeName").value = d.recipeName || "";
    extra.additives = d.additives || "";
    extra.notes = d.notes || "";

    const total = parseNum(String(d.oilWeightValue));
    const missing = [];
    state.recipe = Array(SLOTS).fill(null);
    d.selectedOils.slice(0, SLOTS).forEach((s, slot) => {
      let i = window.OILS.findIndex((o) => s.id != null && o.refId === Number(s.id));
      if (i < 0 && s.name) i = window.OILS.findIndex((o) => o.en === s.name);
      if (i < 0) { missing.push(s.name || `#${s.id}`); return; }
      const pct = parseNum(String(s.amount));
      state.recipe[slot] = {
        oil: i,
        pct: Number.isFinite(pct) ? pct : null,
        wt: Number.isFinite(pct) && Number.isFinite(total) ? (pct / 100) * total : parseNum(String(s.weight)) || 0
      };
    });
    applyUnit();
    renderSlots();
    return missing;
  }

  $("loadJson").addEventListener("change", () => {
    const file = $("loadJson").files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const missing = applyJSON(JSON.parse(reader.result));
        if (missing.length) { notice = `تم تحميل الوصفة، لكن لم نجد هذه الزيوت: ${missing.join("، ")}.`; recalc(); }
      } catch (err) {
        notice = "تعذّر قراءة الملف. اختر ملف وصفة بصيغة JSON صدّرته هذه الحاسبة.";
        recalc();
      }
      $("loadJson").value = "";
    };
    reader.readAsText(file);
  });

  // Remember the last recipe in this browser (best effort; storage may be unavailable).
  const STORE_KEY = "soap-calc-ar:last";
  let saveTimer = 0;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(toJSON())); } catch (e) { /* ignore */ }
    }, 300);
  }
  document.addEventListener("input", autosave);
  document.addEventListener("change", autosave);
  document.addEventListener("click", (e) => { if (e.target.closest("button")) autosave(); });

  // ---------- Boot ----------
  window.soapCalc = {
    compute, recalc, PROPS, G_PER, UNIT, state, extra, toJSON, applyJSON, autosave, last: null
  };
  selectOil(order[0]);
  applyUnit();
  renderSlots();
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) applyJSON(JSON.parse(saved));
  } catch (e) { /* ignore */ }
})();
