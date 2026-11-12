import { createStage } from './stage.js';

document.documentElement.classList.add('js');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

// La scena segue lo scroll: ogni sezione dichiara la sua fotografia (0 Chieti, 1 Chieti Scalo, 2 la cattedrale di notte, 3 la casa)
const stage = createStage(document.getElementById('stage'), { reducedMotion });
const chapters = [...document.querySelectorAll('[data-body]')];
const caption = document.getElementById('caption');
const NAMES = ['La casa del B&B Sibi', 'Chieti e il Gran Sasso', 'La cattedrale di San Giustino, di sera', 'La casa del B&B Sibi'];
const dove = document.getElementById('dove');

function bodyAt(tops, vh) {
  let b = +chapters[0].dataset.body;
  for (let k = 1; k < chapters.length; k++) {
    const t = clamp01((vh * 0.7 - tops[k]) / (vh * 0.45));
    b += t * (chapters[k].dataset.body - chapters[k - 1].dataset.body);
  }
  return b;
}
function onScroll() {
  const b = bodyAt(chapters.map((c) => c.getBoundingClientRect().top), innerHeight);
  stage.setTarget(b);
  stage.setScrub(clamp01(scrollY / dove.offsetTop)); // il video d'apertura avanza finché non arriva «Dove siamo»
  const name = NAMES[Math.round(b)];
  if (caption.textContent !== name) caption.textContent = name;
}
// Dove sta la facciata intera all'apertura: al centro della scena; sul telefono nella finestra sotto la barra
const heroWindow = document.querySelector('.hero .window'), bar = document.querySelector('header.bar'), canvas = document.getElementById('stage');
function placeFront() {
  const top = bar.getBoundingClientRect().bottom + scrollY, h = heroWindow.offsetHeight;
  stage.setCenter(h ? 1 - (top + h) / 2 / canvas.clientHeight : 0.5);
}
addEventListener('resize', placeFront);
placeFront();
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();

// Schede (motivo del viaggio, camere). Senza JS i pannelli restano tutti visibili.
for (const list of document.querySelectorAll('[role="tablist"]')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
  select(tabs[0]);
  list.addEventListener('click', (e) => e.target.closest('[role="tab"]') && select(e.target.closest('[role="tab"]')));
  list.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const next = tabs[(tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length];
    next.focus();
    select(next);
  });
}
// I titoli si spezzano in parole, così ognuna può salire da sotto la sua riga
for (const h of document.querySelectorAll(':is(h1, h2)[data-reveal]')) {
  let w = 0;
  const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.textContent.split(/(\s+)/)) {
      if (!part.trim()) { frag.append(part); continue; }
      const outer = Object.assign(document.createElement('span'), { className: 'w' });
      const inner = document.createElement('span');
      inner.textContent = part; inner.style.setProperty('--w', w++);
      outer.append(inner); frag.append(outer);
    }
    node.replaceWith(frag);
  }
}
// Entrate sfalsate, una volta sola
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
for (const sheet of document.querySelectorAll('.sheet')) {
  [...sheet.querySelectorAll('[data-reveal]')].forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 4)); sheet.closest('.hero') ? setTimeout(() => el.classList.add('in'), 60) : io.observe(el); }); // l'apertura non aspetta l'observer
}

// Prenotazione diretta: una richiesta a Sibilla su WhatsApp, senza pagamento.
// ponytail: nessuna disponibilità in tempo reale e nessun incasso. Con Stripe il link di invio diventa una POST
// a una function che controlla il calendario e crea la Checkout Session.
const RATES = { singola: [60, 1, 'Camera singola'], matrimoniale: [80, 2, 'Camera matrimoniale'], tripla: [80, 3, 'Camera tripla'] }; // € a notte (tariffa base su iReservation), ospiti massimi
const DAY = 864e5;
const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const long = (d) => new Date(d).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function quote(d) {
  const [rate, max, label] = RATES[d.camera];
  const n = d.arrivo && d.partenza ? nights(d.arrivo, d.partenza) : 0;
  return { n, max, label, total: n > 0 ? n * rate : 0 };
}
const form = document.getElementById('booking');
const done = document.getElementById('booking-done');
const f = form.elements;
const read = () => Object.fromEntries(new FormData(form));
f.arrivo.min = iso(Date.now() - new Date().getTimezoneOffset() * 6e4); // oggi, nell'ora locale
function refresh() {
  if (f.arrivo.value) {
    f.partenza.min = iso(Date.parse(f.arrivo.value) + DAY);
    if (f.partenza.value && f.partenza.value < f.partenza.min) f.partenza.value = f.partenza.min;
  }
  const q = quote(read());
  if (f.ospiti.length !== q.max) f.ospiti.replaceChildren(...Array.from({ length: q.max }, (_, i) => new Option(i + 1, i + 1, false, i + 1 === q.max)));
  document.getElementById('summary').textContent = q.n > 0
    ? `${plural(q.n, 'notte', 'notti')} in ${q.label.toLowerCase()}, ${plural(+f.ospiti.value, 'ospite', 'ospiti')}: ${q.total} € a tariffa base.`
    : 'Scegli le date per vedere il totale.';
}
form.addEventListener('input', refresh);
refresh();
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const d = read(), q = quote(d);
  const lines = [`${q.label}, ${plural(+d.ospiti, 'ospite', 'ospiti')}`, `Arrivo: ${long(d.arrivo)}`, `Partenza: ${long(d.partenza)} (${plural(q.n, 'notte', 'notti')})`,
    `Tariffa base: ${q.total} €`, `Nome: ${d.nome}`, d.note && `Note: ${d.note}`].filter(Boolean);
  document.getElementById('booking-recap').textContent = lines.join('\n');
  document.getElementById('booking-send').href = 'https://wa.me/393913550634?text=' + encodeURIComponent(['Buongiorno Sibilla, vorrei prenotare dal sito.', ...lines].join('\n'));
  form.hidden = true; done.hidden = false; done.focus();
});
document.getElementById('booking-edit').addEventListener('click', () => { done.hidden = true; form.hidden = false; });
for (const a of document.querySelectorAll('[data-room]')) a.addEventListener('click', () => { f.camera.value = a.dataset.room; refresh(); });

// Controllo minimo della mappa scroll → fotografia e del preventivo: apri /?check e guarda la console
if (location.search === '?check') {
  console.assert(nights('2026-12-30', '2027-01-02') === 3, 'tre notti a cavallo di Capodanno');
  console.assert(quote({ camera: 'matrimoniale', arrivo: '2026-12-30', partenza: '2027-01-02' }).total === 240, 'tre notti in matrimoniale fanno 240 €');
  console.assert(quote({ camera: 'singola', arrivo: '2026-12-05', partenza: '2026-12-05' }).total === 0, 'zero notti, nessun totale');
  const n = chapters.length;
  console.assert(bodyAt(Array(n).fill(9999), 800) === 0, 'in cima deve esserci il panorama di Chieti');
  console.assert(bodyAt(Array(n).fill(-9999), 800) === 3, 'in fondo si arriva alla casa');
  console.log('check ok');
}
