// Логика анкеты: пошаговый мастер, сохранение в localStorage, экспорт ответов

const LS_KEY = 'ne_design_anketa_v1';

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* приватный режим или битые данные — начинаем заново */ }
  return { step: 0, answers: {} };
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }, 150);
}

function ans(key, def) {
  if (!(key in state.answers)) state.answers[key] = def;
  return state.answers[key];
}

const app = document.getElementById('app');

// В однофайловой сборке window.IMG_MAP содержит data-URI картинок;
// в ответах всегда храним исходный путь, а не data-URI
const imgSrc = (p) => (window.IMG_MAP && window.IMG_MAP[p]) || p;

let mainEl = null;

function render() {
  const step = STEPS[state.step];
  app.innerHTML = '';
  fieldRows = {};
  formErrorEl = null;

  if (step.type !== 'intro') app.appendChild(renderTopbar());

  const main = document.createElement('main');
  mainEl = main;
  if (step.type === 'intro') main.appendChild(renderIntro(step));
  else if (step.type === 'final') main.appendChild(renderFinal(step));
  else main.appendChild(renderStep(step));
  app.appendChild(main);

  app.appendChild(renderNav(step));
  window.scrollTo(0, 0);
}

// секции анкеты в порядке появления, с индексом первого шага
const SECTIONS = STEPS.reduce((acc, s, i) => {
  if (s.section && !acc.some((x) => x.name === s.section)) acc.push({ name: s.section, first: i });
  return acc;
}, []);

function renderTopbar() {
  const el = div('topbar');
  const inner = div('topbar-inner');

  const head = div('topbar-head');
  head.appendChild(div('brand', 'NE DESIGN'));
  const total = STEPS.length - 2;
  const step = STEPS[state.step];
  head.appendChild(div('counter', step.type === 'final' ? 'Готово' : `${state.step} / ${total}`));
  inner.appendChild(head);

  const tabs = div('tabs');
  let activeTab = null;
  for (const sec of SECTIONS) {
    const tab = div('tab' + (sec.name === step.section ? ' active' : ''), sec.name);
    tab.addEventListener('click', () => goTo(sec.first));
    if (sec.name === step.section) activeTab = tab;
    tabs.appendChild(tab);
  }
  inner.appendChild(tabs);
  if (activeTab && activeTab.scrollIntoView) {
    setTimeout(() => activeTab.scrollIntoView({ inline: 'center', block: 'nearest' }), 0);
  }

  const track = div('progress-track');
  const fill = div('progress-fill');
  fill.style.width = Math.round(state.step / (STEPS.length - 1) * 100) + '%';
  track.appendChild(fill);
  inner.appendChild(track);

  el.appendChild(inner);
  return el;
}

function renderIntro(step) {
  const el = div('hero');
  const logo = div('logo');
  logo.innerHTML = 'NE<br>DES<br>IGN';
  const small = document.createElement('small');
  small.textContent = CONTACTS.tagline1;
  logo.appendChild(small);
  const small2 = document.createElement('small');
  small2.textContent = CONTACTS.tagline2;
  small2.style.marginTop = '4px';
  logo.appendChild(small2);
  el.appendChild(logo);
  el.appendChild(h1(step.title));
  el.appendChild(div('lead', step.lead));
  el.appendChild(div('sub', step.sub));
  el.appendChild(div('note', step.note));
  return el;
}

function renderFinal(step) {
  const el = div('hero');
  el.appendChild(h1(step.title));
  el.appendChild(div('lead', step.lead));

  const actions = div('final-actions');
  const dl = button('Скачать ответы (PDF)', async () => {
    dl.disabled = true;
    dl.textContent = 'Готовим PDF…';
    try {
      await makePdf();
      dl.textContent = 'PDF скачан!';
    } catch (e) {
      console.error(e);
      dl.textContent = 'Не получилось — скопируйте текстом';
    }
    setTimeout(() => { dl.textContent = 'Скачать ответы (PDF)'; dl.disabled = false; }, 2500);
  });
  actions.appendChild(dl);

  const copy = button('Скопировать ответы текстом', async () => {
    try {
      await navigator.clipboard.writeText(summaryText());
      copy.textContent = 'Скопировано!';
      setTimeout(() => (copy.textContent = 'Скопировать ответы текстом'), 2000);
    } catch (e) {
      alert('Не удалось скопировать — скачайте PDF.');
    }
  });
  copy.classList.add('ghost');
  actions.appendChild(copy);
  el.appendChild(actions);

  const hint = div('final-hint');
  hint.innerHTML = `Отправьте скачанный файл нам в Telegram <b>${CONTACTS.telegram}</b> или Instagram <b>${CONTACTS.instagram}</b>`;
  el.appendChild(hint);
  return el;
}

function renderStep(step) {
  const el = div('');
  el.appendChild(h1(step.title, 'step-title'));
  if (step.note) el.appendChild(div('step-note', step.note));

  for (const block of step.blocks) el.appendChild(renderBlock(step, block));

  if (step.type !== 'intro') {
    const c = div('step-comment');
    const lab = document.createElement('label');
    lab.textContent = 'Комментарий к этому разделу (по желанию)';
    const ta = document.createElement('textarea');
    ta.value = ans('comment_' + step.id, '');
    ta.addEventListener('input', () => { state.answers['comment_' + step.id] = ta.value; save(); });
    c.appendChild(lab);
    c.appendChild(ta);
    el.appendChild(c);
  }
  return el;
}

function renderBlock(step, block) {
  if (block.type === 'fields') return renderFields(block);
  if (block.type === 'qa') return renderQA(block);
  if (block.type === 'checks') return renderChecks(block);
  if (block.type === 'gallery') return renderGallery(block);
  if (block.type === 'colors') return renderColors(block);
  return div('');
}

// заполняется при рендере полей; используется валидацией обязательных
let fieldRows = {};

function renderFields(block) {
  const wrap = div('');
  const store = ans('fields', {});
  const el = div('fields');
  for (const item of block.items) {
    const row = div('field-row');
    const lab = document.createElement('label');
    lab.textContent = item.label + (item.req ? ' *' : '');
    const input = document.createElement('input');
    input.type = item.input || 'text';
    input.placeholder = item.ph || '';
    input.value = store[item.k] || '';
    input.addEventListener('input', () => {
      store[item.k] = input.value;
      if (input.value.trim()) row.classList.remove('invalid');
      save();
    });
    row.appendChild(lab);
    row.appendChild(input);
    el.appendChild(row);
    fieldRows[item.k] = row;
  }
  wrap.appendChild(el);
  return wrap;
}

// подсвечивает пустые обязательные поля шага; возвращает первое из них
function validateStep(step) {
  let firstBad = null;
  const store = state.answers.fields || {};
  for (const block of step.blocks || []) {
    if (block.type !== 'fields') continue;
    for (const item of block.items) {
      if (!item.req || (store[item.k] || '').trim()) continue;
      const row = fieldRows[item.k];
      if (row) {
        row.classList.add('invalid');
        if (!firstBad) firstBad = row;
      }
    }
  }
  return firstBad;
}

let formErrorEl = null;
function showFormError(msg) {
  if (!formErrorEl) {
    formErrorEl = div('form-error');
    mainEl.appendChild(formErrorEl);
  }
  formErrorEl.textContent = msg;
}

function renderQA(block) {
  const el = div('');
  const store = ans('qa', {});
  for (let i = block.start; i < block.start + block.count; i++) {
    const item = div('qa-item');
    const q = div('qa-q');
    q.appendChild(div('num', String(i + 1)));
    q.appendChild(div('', QA[i]));
    item.appendChild(q);
    const ta = document.createElement('textarea');
    ta.rows = 1;
    ta.value = store[i] || '';
    ta.addEventListener('input', () => { store[i] = ta.value; save(); });
    item.appendChild(ta);
    el.appendChild(item);
  }
  return el;
}

function renderChecks(block) {
  const wrap = div('');
  if (block.label) wrap.appendChild(div('group-label', block.label + ':'));
  const selected = ans(block.k, []);
  const hasImgs = block.options.some((o) => typeof o === 'object' && o.img);
  const el = div(hasImgs ? 'checks with-imgs' : 'checks');

  for (const o of block.options) {
    const label = typeof o === 'string' ? o : o.t;
    const img = typeof o === 'object' ? o.img : null;
    const on = selected.includes(label);

    let item;
    if (img) {
      item = div('imgcheck' + (on ? ' on' : ''));
      const cap = div('cap');
      cap.appendChild(div('dot'));
      cap.appendChild(div('', label));
      item.appendChild(cap);
      const ph = div('ph' + (/opt-p1[23]/.test(img) ? ' tall' : ''));
      const im = document.createElement('img');
      im.src = imgSrc(img); im.alt = label; im.loading = 'lazy';
      ph.appendChild(im);
      item.appendChild(ph);
    } else {
      item = div('check' + (on ? ' on' : ''));
      item.appendChild(div('dot'));
      item.appendChild(div('', label));
    }
    item.addEventListener('click', () => {
      toggle(selected, label);
      item.classList.toggle('on');
      save();
    });
    el.appendChild(item);
  }
  wrap.appendChild(el);
  return wrap;
}

function renderGallery(block) {
  const selected = ans(block.k, []);
  const el = div('gallery');
  for (const src of block.imgs) {
    const item = div('gitem' + (selected.includes(src) ? ' on' : ''));
    const im = document.createElement('img');
    im.src = imgSrc(src); im.alt = ''; im.loading = 'lazy';
    item.appendChild(im);
    item.addEventListener('click', () => {
      toggle(selected, src);
      item.classList.toggle('on');
      save();
    });
    el.appendChild(item);
  }
  return el;
}

function renderColors(block) {
  const selected = ans(block.k, []);
  const el = div('swatches');
  for (const c of block.colors) {
    const s = div('swatch' + (selected.includes(c) ? ' on' : ''));
    s.style.background = c;
    s.addEventListener('click', () => {
      toggle(selected, c);
      s.classList.toggle('on');
      save();
    });
    el.appendChild(s);
  }
  return el;
}

function renderNav(step) {
  const el = div('nav');
  if (step.type === 'intro') {
    const spacer = div('');
    if (hasProgress()) {
      const reset = button('Начать заново', () => {
        if (confirm('Удалить все сохранённые ответы и начать заново?')) {
          state = { step: 0, answers: {} };
          save();
          render();
        }
      });
      reset.className = 'btn linklike';
      spacer.appendChild(reset);
    }
    el.appendChild(spacer);
    el.appendChild(button(hasProgress() ? 'Продолжить' : 'Начать', next));
  } else if (step.type === 'final') {
    el.appendChild(ghostButton('Назад', prev));
    const reset = button('Заполнить заново', () => {
      if (confirm('Удалить все ответы и начать заново?')) {
        state = { step: 0, answers: {} };
        save();
        render();
      }
    });
    reset.className = 'btn linklike';
    el.appendChild(reset);
  } else {
    el.appendChild(ghostButton('Назад', prev));
    el.appendChild(button(state.step === STEPS.length - 2 ? 'Завершить' : 'Далее', next));
  }
  return el;
}

function hasProgress() { return Object.keys(state.answers).length > 0 || state.step > 0; }

// переход на произвольный шаг; вперёд — только если текущий шаг валиден
function goTo(idx) {
  if (idx === state.step || idx < 0 || idx > STEPS.length - 1) return;
  if (idx > state.step) {
    const bad = validateStep(STEPS[state.step]);
    if (bad) {
      showFormError('Пожалуйста, заполните обязательные поля');
      if (bad.scrollIntoView) bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
  state.step = idx;
  save();
  render();
}

function next() { goTo(state.step + 1); }
function prev() { goTo(state.step - 1); }

/* ---------- экспорт ответов ---------- */

function collectSummary() {
  const out = [];
  const fields = state.answers.fields || {};
  const generalStep = STEPS.find((s) => s.id === 'general');
  const fieldItems = generalStep.blocks[0].items;
  const filled = fieldItems.filter((i) => (fields[i.k] || '').trim());
  if (filled.length) {
    out.push({
      title: 'Общие данные',
      rows: filled.map((i) => ({ q: i.label, a: fields[i.k].trim() })),
    });
  }

  const qaStore = state.answers.qa || {};
  const qaRows = QA.map((q, i) => ({ q: `${i + 1}. ${q}`, a: (qaStore[i] || '').trim() }))
    .filter((r) => r.a);
  if (qaRows.length) out.push({ title: 'О вас и объекте', rows: qaRows });

  for (const step of STEPS) {
    if (!step.blocks || ['general', 'qa1', 'qa2', 'qa3'].includes(step.id)) continue;
    const sec = { title: step.title, rows: [], imgs: [], colors: [] };
    for (const block of step.blocks) {
      if (block.type === 'checks') {
        const sel = state.answers[block.k] || [];
        if (sel.length) sec.rows.push({ q: block.label || 'Выбрано', a: sel.join('; ') });
      } else if (block.type === 'gallery') {
        sec.imgs = state.answers[block.k] || [];
      } else if (block.type === 'colors') {
        sec.colors = state.answers[block.k] || [];
      }
    }
    const comment = (state.answers['comment_' + step.id] || '').trim();
    if (comment) sec.rows.push({ q: 'Комментарий', a: comment });
    if (sec.rows.length || sec.imgs.length || sec.colors.length) out.push(sec);
  }
  return out;
}

// Возвращает JPEG data-URI картинки (в однофайловой сборке берётся из IMG_MAP)
function imgDataUri(path) {
  const resolved = imgSrc(path);
  if (resolved.startsWith('data:')) return Promise.resolve(resolved);
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    im.onerror = reject;
    im.src = resolved;
  });
}

async function makePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  window.registerPdfFonts(doc);

  const M = 15, CW = 210 - 2 * M, BOTTOM = 282;
  let y = M;
  const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  const text = (str, size, style, color, indent) => {
    doc.setFont('Montserrat', style || 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color || 20);
    const lines = doc.splitTextToSize(str, CW - (indent || 0));
    const h = lines.length * size * 0.45;
    ensure(h + 2);
    doc.text(lines, M + (indent || 0), y + size * 0.35);
    y += h + 2;
  };

  text('NE DESIGN — АНКЕТА КЛИЕНТА', 15, 'bold');
  const fields = state.answers.fields || {};
  const contact = [fields.name, fields.phone, fields.tg, fields.addr].filter(Boolean).join('  ·  ');
  if (contact) text(contact, 10, 'normal', 110);
  doc.setDrawColor(20);
  doc.setLineWidth(0.5);
  doc.line(M, y + 1, M + CW, y + 1);
  y += 6;

  for (const sec of collectSummary()) {
    ensure(14);
    y += 4;
    text(sec.title.toUpperCase(), 11, 'bold');
    doc.setDrawColor(160);
    doc.setLineWidth(0.2);
    doc.line(M, y, M + CW, y);
    y += 3;

    for (const r of sec.rows || []) {
      text(r.q, 8.5, 'normal', 120);
      text(r.a, 10.5, 'normal', 20, 3);
      y += 1;
    }

    if (sec.imgs && sec.imgs.length) {
      const iw = (CW - 2 * 4) / 3, ih = iw * 1.2;
      let x = M;
      for (let i = 0; i < sec.imgs.length; i++) {
        if (i % 3 === 0) {
          if (i > 0) y += ih + 4;
          ensure(ih + 4);
          x = M;
        }
        try {
          doc.addImage(await imgDataUri(sec.imgs[i]), 'JPEG', x, y, iw, ih);
        } catch (e) { /* пропускаем битую картинку */ }
        x += iw + 4;
      }
      y += ih + 6;
    }

    if (sec.colors && sec.colors.length) {
      const r = 5.5, per = Math.floor(CW / (2 * r + 4));
      for (let i = 0; i < sec.colors.length; i++) {
        if (i % per === 0) { if (i > 0) y += 2 * r + 4; ensure(2 * r + 4); }
        const hex = sec.colors[i];
        doc.setFillColor(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
        doc.setDrawColor(200);
        doc.circle(M + (i % per) * (2 * r + 4) + r, y + r, r, 'FD');
      }
      y += 2 * r + 4;
      text(sec.colors.join('  '), 8, 'normal', 140);
    }
  }

  doc.save('NE-DESIGN-anketa.pdf');
}

function summaryText() {
  const lines = ['NE DESIGN — анкета клиента', ''];
  for (const sec of collectSummary()) {
    lines.push('== ' + sec.title.toUpperCase() + ' ==');
    for (const r of sec.rows || []) lines.push(r.q + ': ' + r.a);
    if (sec.imgs && sec.imgs.length) lines.push('Выбранные референсы: ' + sec.imgs.map((s) => s.split('/').pop()).join(', '));
    if (sec.colors && sec.colors.length) lines.push('Цвета: ' + sec.colors.join(', '));
    lines.push('');
  }
  return lines.join('\n');
}

/* ---------- helpers ---------- */

function div(cls, text) {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function h1(text, cls) {
  const el = document.createElement('h1');
  el.textContent = text;
  el.className = cls || '';
  return el;
}
function button(text, onClick) {
  const el = document.createElement('button');
  el.className = 'btn';
  el.textContent = text;
  el.addEventListener('click', onClick);
  return el;
}
function ghostButton(text, onClick) {
  const el = button(text, onClick);
  el.classList.add('ghost');
  return el;
}
function toggle(arr, v) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v);
}

render();
