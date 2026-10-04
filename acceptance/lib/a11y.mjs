// The suite's own small accessibility checker (SPEC AC-99) and pseudo-locale scan (SPEC AC-123).
//
// checkA11y(page) -> [{ rule, selector, detail }] for rendered elements only (not display:none,
// visibility:hidden, or inside aria-hidden="true"; contrast also skips zero-size boxes):
//   image-alt     <img> without an alt attribute (alt="" is allowed: decorative), role="img" without a name
//   button-name   <button>, role="button", input type=button|submit|reset without an accessible name
//   link-name     <a href> without an accessible name
//   label         input (not hidden/button/submit/reset/image), select, textarea without a label: a
//                 <label for>, wrapping <label>, aria-label, aria-labelledby, title or placeholder (as axe)
//   color-contrast  text (an element's own non-blank text nodes) whose contrast against the composited
//                 background colour is below 4.5:1 (3:1 for large text: >= 24px, or >= 18.66px and bold).
//                 Skipped (as axe "incomplete"): background images/gradients behind the text, disabled
//                 controls, text inside <canvas>/<svg>.
// Accessible name (simplified accname): aria-labelledby text, aria-label, text content (with img alt and
// svg <title>), title attribute, value (input buttons).
//
// untranslatedText(page, corpus) -> strings shown on screen that are not wrapped in ⟦…⟧ by the pseudo-locale.
// Checked: each visible element's own text, plus placeholder / aria-label / title / alt attributes. Ignored:
// strings without two consecutive letters, strings the fixture corpus knows (corpus.has(text): seeded user data
// and course content are not UI strings), and anything inside <code>, <pre>, <canvas>, <svg>, [contenteditable] or
// [translate="no"].

function pageCheck() {
  const out = [];
  const hiddenByAria = (el) => !!el.closest('[aria-hidden="true"]');
  // Rendered and exposed: not display:none / visibility:hidden / inside aria-hidden. Empty (zero-size) controls
  // still count for the name rules, because screen readers announce them; contrast also needs a non-zero box.
  const visible = (el, needSize = false) => {
    if (hiddenByAria(el)) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false;
    if (!needSize) return true;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const sel = (el) => {
    if (el.id) return `#${el.id}`;
    const t = el.getAttribute('data-testid'); if (t) return `[data-testid="${t}"]`;
    const parts = []; let e = el;
    while (e && e.nodeType === 1 && parts.length < 4) { let s = e.tagName.toLowerCase(); if (e.classList.length) s += `.${[...e.classList].slice(0, 2).join('.')}`; parts.unshift(s); e = e.parentElement; }
    return parts.join(' > ');
  };
  const textName = (el) => {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeType === 1) {
        if (n.getAttribute('aria-hidden') === 'true') continue;
        if (n.tagName === 'IMG') s += n.getAttribute('alt') || '';
        else if (n.tagName.toLowerCase() === 'svg') s += n.querySelector('title')?.textContent || n.getAttribute('aria-label') || '';
        else s += n.getAttribute('aria-label') || textName(n);
      }
    }
    return s;
  };
  const name = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim(); if (t) return t; }
    const al = el.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    const tn = textName(el).trim(); if (tn) return tn;
    if (el.tagName === 'INPUT' && el.value) return el.value;
    if (el.labels && el.labels.length) { const t = [...el.labels].map((l) => l.textContent).join(' ').trim(); if (t) return t; }
    return (el.getAttribute('title') || '').trim();
  };

  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    const role = img.getAttribute('role');
    if (role === 'presentation' || role === 'none') continue;
    if (!img.hasAttribute('alt') && !img.getAttribute('aria-label') && !img.getAttribute('aria-labelledby')) out.push({ rule: 'image-alt', selector: sel(img), detail: img.getAttribute('src')?.slice(0, 80) || '' });
  }
  for (const el of document.querySelectorAll('[role="img"]')) if (visible(el) && !name(el)) out.push({ rule: 'image-alt', selector: sel(el), detail: 'role=img without a name' });
  for (const el of document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]')) {
    if (!visible(el)) continue;
    if (el.tagName === 'INPUT' && el.type === 'submit' && !el.value && !el.getAttribute('aria-label')) continue; // browser default "Submit"
    if (!name(el)) out.push({ rule: 'button-name', selector: sel(el), detail: el.outerHTML.slice(0, 120) });
  }
  for (const el of document.querySelectorAll('a[href]')) if (visible(el) && !name(el)) out.push({ rule: 'link-name', selector: sel(el), detail: el.getAttribute('href') });
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (el.tagName === 'INPUT' && /^(hidden|button|submit|reset|image)$/i.test(el.type)) continue;
    if (!visible(el)) continue;
    const ok = (el.labels && [...el.labels].some((l) => l.textContent.trim() || l.querySelector('img[alt]'))) || (el.getAttribute('aria-label') || '').trim()
      || (el.getAttribute('aria-labelledby') && name(el)) || (el.getAttribute('title') || '').trim() || (el.getAttribute('placeholder') || '').trim();
    if (!ok) out.push({ rule: 'label', selector: sel(el), detail: el.outerHTML.slice(0, 120) });
  }

  // ---- contrast ----
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const background = (el) => {
    const layers = []; let e = el;
    while (e && e.nodeType === 1) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      e = e.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const opacity = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  const seen = new Set();
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (el === document.body && !el.childNodes.length) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!own || !/[\p{L}\p{N}]/u.test(own)) continue;
    if (el.closest('canvas, svg, [aria-hidden="true"]') || el.matches(':disabled') || el.closest('[disabled]')) continue;
    if (!visible(el, true)) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); const bg = background(el);
    if (!fg || !bg) continue;
    const op = opacity(el);
    const eff = over({ ...fg, a: fg.a * op }, bg);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const r = ratio(eff, bg);
    if (r + 1e-6 < need) { const s = sel(el); if (!seen.has(s)) { seen.add(s); out.push({ rule: 'color-contrast', selector: s, detail: `${r.toFixed(2)}:1 < ${need}:1 for "${own.slice(0, 40)}" (${cs.color} on rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}), ${size}px)` }); } }
  }
  return out;
}

export async function checkA11y(page) { return page.evaluate(pageCheck); }

export function formatViolations(v, max = 15) {
  return v.slice(0, max).map((x) => `  ${x.rule}: ${x.selector} ${x.detail}`).join('\n') + (v.length > max ? `\n  … and ${v.length - max} more` : '');
}

function collectTexts() {
  const skip = 'code, pre, canvas, svg, [contenteditable=""], [contenteditable="true"], [translate="no"], script, style, noscript, [aria-hidden="true"]';
  const vis = (el) => (!el.checkVisibility || el.checkVisibility({ checkVisibilityCSS: true })) && el.getBoundingClientRect().width > 0;
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest(skip) || !vis(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
    if (own) out.push(own);
    for (const a of ['placeholder', 'aria-label', 'title', 'alt']) { const v = el.getAttribute(a); if (v && v.trim()) out.push(v.trim()); }
  }
  return out;
}

/** Visible strings that are not wrapped by the pseudo-locale (⟦…⟧) and are not fixture data. */
export async function untranslatedText(page, corpus) {
  const texts = await page.evaluate(collectTexts);
  const bad = new Set();
  for (const t of texts) {
    if (!/\p{L}{2,}/u.test(t)) continue;
    if (t.includes('⟦') || t.includes('⟧')) continue;
    if (corpus && (typeof corpus.has === 'function' ? corpus.has(t) : corpus.includes(t.toLowerCase().replace(/\s+/g, ' ')))) continue;
    bad.add(t.slice(0, 80));
  }
  return [...bad];
}
