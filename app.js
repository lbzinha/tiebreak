/* Tiebreak · app de treinos. Tudo fica no aparelho (localStorage); backup manual em JSON. */
'use strict';

const APP_VERSAO = '1.0.0';
const KEY = 'tiebreak:v1';
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const DIAS_LONGO = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const COR_ZONA = { Z1: 'var(--z1)', Z2: 'var(--z2)', Z3: 'var(--z3)', Z4: 'var(--z4)', Z5: 'var(--z5)' };
/* Ritmos das zonas a partir do ritmo médio do teste de 5 km (multiplicadores do ritmo por km). */
const FATORES_5K = { Z5: [0.94, 1.0], Z4: [1.0, 1.07], Z3: [1.07, 1.19], Z2: [1.19, 1.38], Z1: [1.38, null] };

/* ---------- datas ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diaSemana = (d) => (d.getDay() + 6) % 7;
const fmtCurto = (d) => `${d.getDate()} ${MESES[d.getMonth()]}`;
const fmtBarra = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const docId = (d) => 'treino-' + iso(d);
const diffDias = (a, b) => Math.round((a - b) / 864e5);
function hojeData() { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }
let HOJE = hojeData();

/* ---------- utilidades de DOM ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
const $ = (s) => document.querySelector(s);

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- estado ---------- */
function estadoVazio() {
  return {
    app: 'tiebreak', versao: 1,
    registros: {},
    zonas: Object.fromEntries(ZONAS.map((z) => [z, { fcMin: null, fcMax: null, pRapido: null, pLento: null }])),
    ritmoRetorno: '',
    testes5k: [],
    ultimoBackup: null,
    plano: null,
    porPlano: {},
  };
}
let S = estadoVazio();
function carregarEstado() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) S = Object.assign(estadoVazio(), JSON.parse(raw));
  } catch (e) { /* sem armazenamento */ }
}
function salvar() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Não foi possível salvar neste aparelho.'); }
}

let PADRAO = null; // plano.json do repositório
let P = null;      // plano em uso
function pp() { // estado ligado ao plano em uso
  const id = P.id || 'plano';
  if (!S.porPlano[id]) S.porPlano[id] = {};
  const o = S.porPlano[id];
  o.noites ||= {}; o.repeticoes ||= []; o.trocas ||= {}; o.ignoradas ||= {}; o.semanasIgnoradas ||= {};
  return o;
}

/* ---------- calendário do plano ---------- */
function inicioPlano() { return fromIso(P.inicio); }
function semanaCal(d) { return Math.floor(diffDias(d, inicioPlano()) / 7) + 1; } // 1 = primeira semana do plano
function inicioSemanaCal(k) { return addDays(inicioPlano(), (k - 1) * 7); }
function numPlano(k) { // semana do plano (1..N) para a semana de calendário k, ou null
  if (k < 1) return null;
  const n = k - pp().repeticoes.filter((r) => r <= k).length;
  return n >= 1 && n <= P.semanas.length ? n : null;
}
function ultimaSemanaCal() { return P.semanas.length + pp().repeticoes.length; }
function repetida(k) { return pp().repeticoes.includes(k); }

function infoDia(d) {
  const k = semanaCal(d);
  const n = numPlano(k);
  const w = n ? P.semanas[n - 1] : null;
  const i = diaSemana(d);
  let base = { sessao: 'livre' };
  if (w) {
    const lista = pp().noites[k] && P.semanaVariante ? P.semanaVariante.dias : P.semanaPadrao;
    base = Object.assign({}, lista[i]);
    if (base.sessao === 'int' && w.teste) base.sessao = 'teste5k';
    if (base.sessao === 'int' && !w.tiros) base.sessao = 'z2';
  }
  return { d, k, n, w, i, base };
}
const sess = (id) => P.sessoes[id] || P.sessoes.livre;
const reg = (d) => S.registros[docId(d)];
function feito(log) {
  if (!log) return false;
  if (sess(log.sessao).tipo === 'forca') return Object.values(log.itens || {}).some((x) => x.feito);
  return !!log.feito;
}
function sugerido(d) { const inf = infoDia(d); return pp().trocas[iso(d)] || inf.base.sessao; }
function efetiva(d) { const l = reg(d); return (l && l.sessao) || sugerido(d); }
function forte(id, log) { const s = sess(id); return !!(s.forte || (s.forteSeLongo && log && log.longo)); }
function grupos(id) { return sess(id).grupos || []; }
function principal(id) { return P.principais.includes(id === 'teste5k' ? 'int' : id); }
function nomeSessao(id, completo) {
  const s = sess(id);
  if (id === 'livre') return 'Dia livre';
  return completo && s.titulo ? `${s.nome}: ${s.titulo}` : s.nome;
}
function nomeCurto(id) { return id === 'int' ? 'Tiros' : id === 'teste5k' ? 'Teste 5 km' : id === 'z2' || id === 'z2curto' ? 'Z2' : id === 'tenis' ? 'Tênis' : id === 'livre' ? 'Outro' : sess(id).nome; }
function garantir(d, sessao) {
  const id = docId(d);
  if (!S.registros[id]) S.registros[id] = { data: iso(d), sessao, itens: {}, feito: false, detalhe: '', nota: '' };
  const l = S.registros[id];
  l.itens ||= {};
  if (!l.sessao) l.sessao = sessao;
  return l;
}
function tocar(log) { log.atualizado = new Date().toISOString(); salvar(); }

/* ---------- zonas e textos com variáveis ---------- */
const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
function parseTempo(t) {
  const m = String(t || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
}
function fcTxt(z) {
  const v = S.zonas[z] || {};
  if (v.fcMin && v.fcMax) return `${v.fcMin}–${v.fcMax} bpm`;
  if (v.fcMax) return `até ${v.fcMax} bpm`;
  if (v.fcMin) return `${v.fcMin}+ bpm`;
  return '';
}
function ritmoTxt(z) {
  const v = S.zonas[z] || {};
  if (v.pRapido && v.pLento) return `${mmss(v.pRapido)}–${mmss(v.pLento)}/km`;
  if (v.pRapido) return `acima de ${mmss(v.pRapido)}/km`;
  if (v.pLento) return `até ${mmss(v.pLento)}/km`;
  return '';
}
function fcEdit(z) { const v = S.zonas[z]; return v.fcMin && v.fcMax ? `${v.fcMin}–${v.fcMax}` : v.fcMax ? `até ${v.fcMax}` : v.fcMin ? `${v.fcMin}+` : ''; }
function ritmoEdit(z) { const v = S.zonas[z]; return v.pRapido && v.pLento ? `${mmss(v.pRapido)}–${mmss(v.pLento)}` : v.pRapido ? `acima de ${mmss(v.pRapido)}` : v.pLento ? `até ${mmss(v.pLento)}` : ''; }
function parseFc(t) {
  const n = (String(t).match(/\d+/g) || []).map(Number);
  if (!n.length) return { fcMin: null, fcMax: null };
  if (n.length >= 2) return { fcMin: Math.min(n[0], n[1]), fcMax: Math.max(n[0], n[1]) };
  if (/at[eé]/i.test(t)) return { fcMin: null, fcMax: n[0] };
  return { fcMin: n[0], fcMax: null };
}
function parseRitmo(t) {
  const n = (String(t).match(/\d{1,2}:\d{2}/g) || []).map((x) => parseTempo(x));
  if (!n.length) return { pRapido: null, pLento: null };
  if (n.length >= 2) return { pRapido: Math.min(n[0], n[1]), pLento: Math.max(n[0], n[1]) };
  if (/at[eé]/i.test(t)) return { pRapido: null, pLento: n[0] };
  return { pRapido: n[0], pLento: null };
}
function ritmoTiro(w) {
  if (w && w.ritmoTiro === 'retorno' && S.ritmoRetorno) return `${S.ritmoRetorno.replace(/\s*\/?km$/, '')}/km`;
  return ritmoTxt('Z5') || 'ritmo da Z5';
}
/* Substitui {variáveis}. Em textos curtos, trechos separados por " · " cujas variáveis ficaram vazias somem.
   Em textos corridos (prosa), as variáveis vazias viram uma referência à zona. */
function tpl(str, w, prosa) {
  if (!str) return '';
  const val = (k) => {
    const [a, b] = k.split(':');
    if (a === 'fc') return fcTxt(b);
    if (a === 'fcmax') { const v = S.zonas[b]; return v && v.fcMax ? `${v.fcMax} bpm` : prosa ? `o limite da ${b}` : ''; }
    if (a === 'ritmo') return ritmoTxt(b) || (prosa ? `ritmo da ${b}` : '');
    if (a === 'ritmoTiro') return ritmoTiro(w);
    if (!w) return '';
    if (a === 'n') return w.tiros ? String(w.tiros.n) : '';
    if (a === 'tiro') return w.tiros ? w.tiros.tiro : '';
    if (a === 'trote') return w.tiros ? w.tiros.trote : '';
    if (a === 'longao') return w.longao || '';
    if (a === 'cond') return w.cond || '';
    return '';
  };
  if (prosa) return str.replace(/\{([^}]+)\}/g, (_, k) => val(k)).replace(/\s*\(\s*\)/g, '');
  return str.split(' · ').map((seg) => {
    let vazio = false;
    const out = seg.replace(/\{([^}]+)\}/g, (_, k) => { const v = val(k); if (!v) vazio = true; return v; });
    return vazio ? null : out;
  }).filter(Boolean).join(' · ')
    .replace(/\s*\((\s*)\)/g, '');
}

/* Séries ajustadas pela semana (retorno: no máximo 3; descarga: metade; intensificação: 5 × 3 nos principais). */
function seriesSemana(exId, series, w) {
  const s = tpl(series, w);
  if (!w || !w.series) return s;
  if (w.series.principais && w.series.principais.includes(exId)) return w.series.prescricao;
  const m = s.match(/^(\d+)\s*×\s*(.+)$/);
  if (!m) return s;
  let n = Number(m[1]);
  if (w.series.max) n = Math.min(n, w.series.max);
  if (w.series.metade) n = Math.ceil(n / 2);
  return `${n} × ${m[2]}`;
}
const numSeries = (s) => { const m = String(s).match(/^(\d+)\s*×/); return m ? Number(m[1]) : null; };

/* ---------- cargas ---------- */
function cargasDe(exId, antesDe) {
  const out = [];
  for (const l of Object.values(S.registros)) {
    if (!l || !l.data || (antesDe && l.data >= antesDe)) continue;
    const it = l.itens && l.itens[exId];
    if (it && (it.carga || it.feito)) out.push({ data: l.data, carga: it.carga || '', reps: it.reps || '' });
  }
  return out.sort((a, b) => (a.data < b.data ? 1 : -1));
}
function dicaSubir(lista) {
  const com = lista.filter((x) => x.carga);
  if (com.length < 3) return 0;
  const c = com[0].carga;
  let n = 0;
  for (const x of com) { if (x.carga === c && !x.reps) n++; else break; }
  return n >= 3 ? n : 0;
}

/* ---------- recálculo (sempre sugestão) ---------- */
function diasDaSemana(d) { const ini = addDays(d, -diaSemana(d)); return Array.from({ length: 7 }, (_, i) => addDays(ini, i)); }
function feitoEm(d) { const l = reg(d); return feito(l) ? l.sessao : null; }
function previsto(d) { // o que conta para as regras: o feito, ou o pretendido em dias de hoje em diante
  const f = feitoEm(d);
  if (f) return f;
  if (d < HOJE) return null;
  const e = efetiva(d);
  return e === 'descanso' || e === 'livre' ? null : e;
}
function sugerir(d) {
  const inf = infoDia(d);
  if (!inf.w || feito(reg(d))) return null;
  const p = efetiva(d);
  if (p === 'descanso' || p === 'livre') return null;
  const ant = addDays(d, -1);
  const pAnt = previsto(ant);
  const fAnt = pAnt && forte(pAnt, reg(ant));
  const semana = diasDaSemana(d);
  const feitosSemana = new Set(semana.filter((x) => x.getTime() !== d.getTime()).map(feitoEm).filter(Boolean).map((x) => (x === 'teste5k' ? 'int' : x)));
  const depois = semana.filter((x) => x > d).map((x) => (feito(reg(x)) ? null : efetiva(x)));
  const prox = previsto(addDays(d, 1));
  const fProx = prox && forte(prox, reg(addDays(d, 1)));
  const gAnt = pAnt ? grupos(pAnt) : [];
  const ok = (c) => !(forte(c) && (fAnt || fProx)) && !grupos(c).some((g) => gAnt.includes(g));
  const candidatos = () => {
    const base = ['B', 'C', 'A', inf.w.teste ? 'teste5k' : 'int'].filter((c) => P.sessoes[c] && c !== p && !feitosSemana.has(c === 'teste5k' ? 'int' : c) && ok(c));
    base.sort((a, b) => Number(depois.includes(a)) - Number(depois.includes(b)));
    return base[0];
  };
  const alternativa = () => {
    if ((p === 'int' || p === 'teste5k') && fAnt) return 'z2';
    return candidatos() || (forte(p) ? 'z2' : 'descanso');
  };
  const dAnt = DIAS_LONGO[diaSemana(ant)].toLowerCase();

  // 1. já feito nesta semana
  const pBase = p === 'teste5k' ? 'int' : p;
  if (principal(p) && feitosSemana.has(pBase)) {
    const quando = semana.find((x) => x.getTime() !== d.getTime() && (feitoEm(x) === p || (pBase === 'int' && feitoEm(x) === 'int')));
    const novo = candidatos() || (p === 'int' ? 'z2' : 'descanso');
    return { d, de: p, para: novo, motivo: `${nomeCurto(p)} já feito ${quando ? 'na ' + DIAS_LONGO[diaSemana(quando)].toLowerCase() : 'nesta semana'}` };
  }
  // 2. dois fortes seguidos
  if (forte(p) && fAnt) return { d, de: p, para: alternativa(), motivo: `dois fortes seguidos (${nomeCurto(pAnt)} na ${dAnt})` };
  // 3. mesmo grupo muscular em menos de 48 h
  if (grupos(p).some((g) => gAnt.includes(g))) return { d, de: p, para: alternativa(), motivo: 'mesmo grupo muscular em menos de 48 h' };
  // 4. pelo menos 1 descanso por semana
  let seguidos = 0;
  for (let i = 1; i <= 6; i++) { if (previsto(addDays(d, -i))) seguidos++; else break; }
  if (seguidos >= 6) return { d, de: p, para: 'descanso', motivo: '6 dias seguidos de treino' };
  // 5. opcional sai primeiro quando falta um principal
  if (sess(p).opcional) {
    const faltando = ['B', 'C', 'A', inf.w.teste ? 'teste5k' : 'int'].filter((c) => P.sessoes[c] && !feitosSemana.has(c === 'teste5k' ? 'int' : c) && !depois.includes(c) && ok(c));
    if (faltando.length) return { d, de: p, para: faltando[0], motivo: `${nomeCurto(faltando[0])} ficou para trás nesta semana` };
  }
  return null;
}
function sugestaoAtual() {
  for (const d of [HOJE, addDays(HOJE, 1)]) {
    const s = sugerir(d);
    if (s && s.para !== s.de && pp().ignoradas[iso(d)] !== s.de + '>' + s.para) return s;
  }
  return null;
}
function aceitar(s) {
  pp().trocas[iso(s.d)] = s.para;
  const l = reg(s.d);
  if (l && !feito(l)) l.sessao = s.para;
  salvar();
  toast(`${s.d.getTime() === HOJE.getTime() ? 'Hoje' : 'Amanhã'}: ${nomeSessao(s.para)}`);
  renderTudo();
}
function ignorar(s) { pp().ignoradas[iso(s.d)] = s.de + '>' + s.para; salvar(); renderTudo(); }

function principaisFeitos(k) {
  const ini = inicioSemanaCal(k);
  let n = 0;
  for (let i = 0; i < 7; i++) { const f = feitoEm(addDays(ini, i)); if (f && principal(f)) n++; }
  return n;
}
function sugestaoRepetir() {
  const k = semanaCal(HOJE);
  if (k < 2 || !numPlano(k - 1) || !numPlano(k) || repetida(k) || pp().semanasIgnoradas[k]) return null;
  const feitos = principaisFeitos(k - 1);
  if (feitos >= (P.minimoSemana || 3)) return null;
  return { k, n: numPlano(k - 1), feitos };
}

/* ---------- navegação ---------- */
let aba = 'hoje';
let diaAberto = HOJE;
let semanaVista = null;
function irAba(a) {
  aba = a;
  for (const v of ['hoje', 'semana', 'historico', 'ajustes']) $('#v-' + v).hidden = v !== a;
  document.querySelectorAll('.tabs button').forEach((b) => { if (b.dataset.tab === a) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  renderAba();
  window.scrollTo(0, 0);
}
function abrirDia(d) { diaAberto = d; irAba('hoje'); }
function renderAba() {
  if (aba === 'hoje') renderHoje();
  else if (aba === 'semana') renderSemana();
  else if (aba === 'historico') renderHistorico();
  else renderAjustes();
}
const renderTudo = renderAba;

/* ---------- ficha (folha que sobe) ---------- */
const pilha = [];
function abrirFicha(fn, empilhar) {
  if (!empilhar) pilha.length = 0;
  pilha.push(fn);
  desenharFicha();
}
function desenharFicha() {
  const fn = pilha[pilha.length - 1];
  if (!fn) { fecharFicha(); return; }
  const body = $('#sheet-body');
  body.replaceChildren(...[].concat(fn()));
  body.scrollTop = 0;
  $('#sheet-back').hidden = pilha.length < 2;
  const wrap = $('#sheet');
  if (wrap.hidden) { wrap.hidden = false; document.body.style.overflow = 'hidden'; }
  const t = body.querySelector('h2'); if (t) t.id = 'sheet-title';
}
function fecharFicha() {
  pilha.length = 0;
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
}
function voltarFicha() { pilha.pop(); desenharFicha(); }

/* ---------- HOJE ---------- */
function renderHoje() {
  const v = $('#v-hoje');
  const d = diaAberto;
  const inf = infoDia(d);
  const log = reg(d);
  const tipo = efetiva(d);
  const s = sess(tipo);
  const planejado = inf.base.sessao;
  const ehHoje = d.getTime() === HOJE.getTime();
  const parts = [];

  // cabeçalho
  const faseTxt = inf.n ? `S${inf.n} ${inf.w.fase}` : inf.k < 1 ? 'antes do plano' : 'depois do plano';
  const nav = h('div', { class: 'day-nav' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Dia anterior', onclick: () => { diaAberto = addDays(d, -1); renderHoje(); } }, '‹'),
    h('span', { class: 'eyebrow' }, `${ehHoje ? 'Hoje · ' : ''}${DIAS[inf.i]}, ${fmtCurto(d)} · ${faseTxt}`),
    !ehHoje && h('button', { class: 'btn small ghost', type: 'button', onclick: () => { diaAberto = HOJE; renderHoje(); } }, 'hoje'),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Próximo dia', onclick: () => { diaAberto = addDays(d, 1); renderHoje(); } }, '›'),
  );
  const titulo = tipo === 'livre' ? (log ? 'Outro treino' : inf.n ? 'Sem treino planejado' : 'Dia livre') : nomeSessao(tipo);
  const meta = h('div', { class: 'meta' });
  if (s.titulo) meta.append(h('span', null, s.titulo));
  if (tipo === planejado && inf.base.h) meta.append(h('span', { class: 'num' }, inf.base.h));
  const dur = tpl(s.dur, inf.w);
  if (dur) meta.append(h('span', null, dur));
  if (s.opcional) meta.append(h('span', { class: 'pill dim' }, 'opcional'));
  if (tipo !== planejado && planejado !== 'livre') meta.append(h('span', { class: 'pill ball' }, 'fora do planejado'));
  parts.push(h('header', { class: 'day-head' }, nav, h('h1', null, titulo), meta));

  // avisos (só na tela de hoje)
  if (ehHoje) {
    const rep = sugestaoRepetir();
    if (rep) parts.push(h('div', { class: 'notice' },
      h('p', null, `Semana passada: ${rep.feitos} de ${P.principais.length} principais. Repetir a semana ${rep.n}?`),
      h('div', { class: 'acts' },
        h('button', { class: 'btn small solid', type: 'button', onclick: () => { pp().repeticoes.push(rep.k); salvar(); toast(`Semana ${rep.n} repetida`); renderTudo(); } }, 'Repetir'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { pp().semanasIgnoradas[rep.k] = true; salvar(); renderTudo(); } }, 'Seguir'))));
    const sug = sugestaoAtual();
    if (sug) {
      const quando = sug.d.getTime() === HOJE.getTime() ? 'Hoje' : 'Amanhã';
      parts.push(h('div', { class: 'notice' },
        h('p', null, h('b', null, `${quando}: ${nomeSessao(sug.para)} em vez de ${nomeCurto(sug.de)}`), h('span', { class: 'muted' }, ` · ${sug.motivo}`)),
        h('div', { class: 'acts' },
          h('button', { class: 'btn small solid', type: 'button', onclick: () => aceitar(sug) }, 'Aceitar'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => ignorar(sug) }, 'Ignorar'))));
    }
    const lembrete = lembreteBackup();
    if (lembrete) parts.push(h('div', { class: 'notice calm' }, h('p', null, lembrete), h('button', { class: 'link', type: 'button', onclick: fazerBackup }, 'fazer agora')));
  }

  // escolha do treino
  const sel = h('select', { class: 'text', id: 'sel-sessao' });
  const opcoes = ['A', 'B', 'C', inf.w && inf.w.teste ? 'teste5k' : 'int', 'tenis', 'z2', 'longao', 'descanso', 'livre'];
  if (!opcoes.includes(planejado)) opcoes.unshift(planejado);
  if (!opcoes.includes(tipo)) opcoes.unshift(tipo);
  for (const o of opcoes) {
    if (!P.sessoes[o]) continue;
    const rot = o === 'livre' ? 'Outro treino' : nomeSessao(o, true);
    sel.append(h('option', { value: o, selected: o === tipo }, o === planejado && o !== 'livre' ? `${rot} (planejado)` : rot));
  }
  sel.addEventListener('change', () => {
    const l = garantir(d, sel.value);
    l.sessao = sel.value;
    tocar(l);
    renderHoje();
  });
  parts.push(h('div', { class: 'picker' }, h('label', { for: 'sel-sessao' }, 'O que você fez'), sel));
  if (tipo !== planejado && planejado !== 'livre') parts.push(h('p', { class: 'planned' }, `Planejado: ${nomeSessao(planejado)}`));

  // conteúdo
  if (s.tipo === 'forca') parts.push(...conteudoForca(d, tipo, inf));
  else parts.push(...conteudoOutro(d, tipo, inf));

  // anotação
  const ta = h('textarea', { class: 'text', rows: 2, placeholder: 'Anotação: como se sentiu, dor, sono', 'aria-label': 'Anotação do dia' });
  ta.value = (log && log.nota) || '';
  ta.addEventListener('input', () => { const l = garantir(d, tipo); l.nota = ta.value; tocar(l); });
  if (tipo !== 'descanso' || (log && log.nota)) parts.push(ta);

  v.replaceChildren(...parts);
}

function slotsForca(tipo, w) { // lista achatada de exercícios planejados, com contexto do bloco
  const out = [];
  for (const b of sess(tipo).blocos) {
    if (b.biset) {
      const exs = b.ex.map((x) => ({ ...x, series: seriesSemana(x.ex, x.series, w) }));
      const voltas = numSeries(exs[0].series);
      exs.forEach((x, i) => out.push({ ...x, bloco: b, voltas, par: exs[1 - i] }));
    } else {
      if (b.semana && !(w && w[b.semana])) continue;
      out.push({ ...b, series: seriesSemana(b.ex, b.series, w), bloco: b });
    }
  }
  return out;
}
function itemDoSlot(log, slot) {
  if (!log || !log.itens) return { key: slot, it: null };
  for (const [k, v] of Object.entries(log.itens)) if (v.lugar === slot) return { key: k, it: v };
  return { key: slot, it: log.itens[slot] || null };
}

function conteudoForca(d, tipo, inf) {
  const w = inf.w;
  const log = reg(d);
  const parts = [];
  if (w) parts.push(h('p', { class: 'week-note' }, h('b', null, `Semana ${inf.n}: `), w.forca));
  parts.push(h('button', { class: 'tap-row', type: 'button', onclick: () => abrirFicha(() => fichaAquecimento()) },
    h('span', { class: 'grow' }, h('b', null, 'Aquecimento'), h('span', { class: 'muted' }, ` · ${P.aquecimento.dur}`)), h('span', { class: 'chev' }, '›')));

  const slots = slotsForca(tipo, w);
  const nFeitos = slots.filter((x) => { const r = itemDoSlot(log, x.ex); return r.it && r.it.feito; }).length;
  parts.push(h('div', { class: 'progress' }, `${nFeitos} de ${slots.length} feitos · reps em branco = como planejado`));

  const lista = h('div', { class: 'exlist' });
  let i = 0;
  while (i < slots.length) {
    const sl = slots[i];
    if (sl.bloco.biset) {
      const a = slots[i]; const b = slots[i + 1];
      lista.append(h('section', { class: 'block' },
        h('div', { class: 'block-head' },
          h('span', { class: 't' }, `Bi-set · ${a.voltas || ''} voltas`.replace(' ·  voltas', '')),
          h('span', { class: 's' }, `1 série de cada, sem pausa · descanso ${a.bloco.descanso}`)),
        h('ul', null, linhaEx(d, tipo, a, inf), linhaEx(d, tipo, b, inf))));
      i += 2;
    } else {
      lista.append(h('section', { class: 'block' }, h('ul', null, linhaEx(d, tipo, sl, inf))));
      i += 1;
    }
  }
  parts.push(lista);
  return parts;
}

function linhaEx(d, tipo, slot, inf) {
  const log = reg(d);
  const { key, it } = itemDoSlot(log, slot.ex);
  const ex = P.exercicios[key] || P.exercicios[slot.ex];
  const on = !!(it && it.feito);
  const chk = h('button', { class: 'chk' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': (on ? 'Desmarcar ' : 'Marcar como feito: ') + ex.nome }, on ? (it.ordem ? `${it.ordem}º` : '✓') : '');
  chk.addEventListener('click', () => {
    const l = garantir(d, tipo);
    const atual = l.itens[key] || { nome: ex.nome };
    if (atual.feito) { atual.feito = false; delete atual.ordem; }
    else { atual.feito = true; atual.ordem = Math.max(0, ...Object.values(l.itens).map((x) => (x.feito && x.ordem) || 0)) + 1; }
    atual.nome = ex.nome;
    if (key !== slot.ex) atual.lugar = slot.ex;
    l.itens[key] = atual;
    tocar(l);
    renderHoje();
  });
  const nm = h('button', { class: 'ex-name', type: 'button', onclick: () => abrirFicha(() => fichaExercicio(key, { slot, d, tipo, w: inf.w })) }, ex.nome, key !== slot.ex ? h('span', { class: 'swapped' }, 'troca') : null);
  const sub = h('div', { class: 'ex-sub' }, h('b', null, slot.series), slot.nota ? ` · ${tpl(slot.nota, inf.w)}` : '', !slot.bloco.biset && slot.descanso ? ` · ${slot.descanso}` : '');
  const main = h('div', { class: 'ex-main' }, nm, sub);
  if (!slot.fixo) {
    const ins = h('div', { class: 'ex-in' });
    const atualiza = (campo) => (e) => {
      const l = garantir(d, tipo);
      const atual = l.itens[key] || { nome: ex.nome, feito: false };
      atual.nome = ex.nome;
      atual[campo] = e.target.value.trim();
      if (key !== slot.ex) atual.lugar = slot.ex;
      l.itens[key] = atual;
      tocar(l);
    };
    if (!ex.semCarga) {
      const kg = h('input', { inputmode: 'decimal', placeholder: 'carga', 'aria-label': `Carga em kg: ${ex.nome}`, autocomplete: 'off' });
      kg.value = (it && it.carga) || '';
      kg.addEventListener('input', atualiza('carga'));
      ins.append(h('label', { class: 'fld' }, kg, h('span', null, 'kg')));
    }
    const reps = h('input', { placeholder: 'reps', 'aria-label': `Repetições, só se mudar: ${ex.nome}`, autocomplete: 'off' });
    reps.value = (it && it.reps) || '';
    reps.addEventListener('input', atualiza('reps'));
    ins.append(h('label', { class: 'fld', style: 'flex:1;max-width:9.5rem' }, reps));
    const hist = cargasDe(key, iso(d));
    const ult = hist.find((x) => x.carga);
    if (ult) ins.append(h('button', { class: 'last', type: 'button', onclick: () => abrirFicha(() => fichaExercicio(key, { slot, d, tipo, w: inf.w, foco: 'cargas' })) }, `última ${ult.carga} kg`));
    main.append(ins);
    const n = dicaSubir(hist);
    if (n) main.append(h('p', { class: 'hint' }, `Mesma carga há ${n} treinos. Acho que dá para subir.`));
  }
  return h('li', { class: 'ex' + (on ? ' feito' : '') }, chk, main);
}

function conteudoOutro(d, tipo, inf) {
  const s = sess(tipo);
  const w = inf.w;
  const log = reg(d);
  const parts = [];
  if (s.blocos && s.blocos.length) {
    parts.push(h('ul', { class: 'runlist' }, s.blocos.map((b) => {
      const rep = tpl(b.rep || '', w);
      const conta = /×$/.test(rep);
      const dur = tpl(b.dur || '', w) || '—';
      return h('li', null, h('button', { class: 'run' + (b.forte ? ' forte' : ''), type: 'button', onclick: () => abrirFicha(() => fichaBloco(tipo, b, w)) },
        h('span', { class: 'dur' }, conta ? `${rep} ${dur}` : dur),
        h('span', null, h('span', { class: 'nm' }, b.nome), rep && !conta ? h('span', { class: 'muted small' }, ` ${rep}`) : null, h('br'), h('span', { class: 'alvo' }, tpl(b.alvo || '', w))),
        h('span', { class: 'chev' }, '›')));
    })));
  }
  if (tipo === 'livre' && !log && !inf.w) parts.push(h('p', { class: 'muted small' }, 'Treinou? Escolha acima o que fez.'));
  if (s.registro) {
    const on = !!(log && log.feito);
    const box = h('div', { class: 'log' });
    box.append(h('button', { class: 'donebtn' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: () => { const l = garantir(d, tipo); l.feito = !l.feito; tocar(l); renderHoje(); } }, on ? '✓ Feito' : 'Marcar como feito'));
    const inp = h('input', { class: 'text', placeholder: s.registro.placeholder, 'aria-label': s.registro.rotulo, autocomplete: 'off' });
    inp.value = (log && log.detalhe) || '';
    const lab = h('label', { class: 'log' }, h('span', { class: 'lab' }, s.registro.rotulo), inp);
    box.append(lab);
    if (s.registro.longo) {
      const lg = !!(log && log.longo);
      box.append(h('button', { class: 'chip' + (lg ? ' on' : ''), type: 'button', 'aria-pressed': lg ? 'true' : 'false', style: 'align-self:flex-start', onclick: () => { const l = garantir(d, tipo); l.longo = !l.longo; tocar(l); renderHoje(); } }, 'Jogo longo (mais de 90 min)'));
    }
    let testeBtn = null;
    if (s.registro.teste) {
      testeBtn = h('button', { class: 'btn small', type: 'button', style: 'align-self:flex-start', onclick: () => propor5k(inp.value, iso(d)) }, 'Atualizar ritmos das zonas com este tempo');
      testeBtn.hidden = !parseTempo(inp.value);
      box.append(testeBtn);
    }
    inp.addEventListener('input', () => {
      const l = garantir(d, tipo); l.detalhe = inp.value; tocar(l);
      if (testeBtn) testeBtn.hidden = !parseTempo(inp.value);
    });
    parts.push(box);
  }
  if (s.notas) parts.push(h('div', { class: 'notes' }, s.notas.map((n) => h('p', null, tpl(n, w, true)))));
  return parts;
}

/* ---------- fichas ---------- */
function fichaAquecimento() {
  return [h('span', { class: 'eyebrow' }, 'Antes de cada treino de força'), h('h2', null, `Aquecimento · ${P.aquecimento.dur}`), h('ol', null, P.aquecimento.passos.map((p) => h('li', null, p)))];
}
function fichaExercicio(exId, ctx) {
  ctx = ctx || {};
  const ex = P.exercicios[exId];
  const slot = ctx.slot;
  const out = [];
  out.push(h('span', { class: 'eyebrow' }, [ctx.tipo ? sess(ctx.tipo).nome : null, slot && slot.bloco && slot.bloco.biset ? 'bi-set' : null].filter(Boolean).join(' · ') || 'Exercício'));
  out.push(h('h2', null, ex.nome));
  if (slot) {
    const pres = [slot.series, slot.nota ? tpl(slot.nota, ctx.w) : null, !slot.bloco.biset && slot.descanso ? `descanso ${slot.descanso}` : null].filter(Boolean).join(' · ');
    out.push(h('p', { class: 'num' }, pres));
    if (slot.bloco.biset && slot.par) {
      const par = P.exercicios[slot.par.ex];
      const deste = ex.lados ? '1 série deste exercício, com os dois lados' : '1 série deste exercício';
      const dele = par.lados ? `1 série de ${par.nome}, também com os dois lados` : `1 série de ${par.nome}`;
      out.push(h('div', { class: 'box' }, h('b', null, 'Como fazer o bi-set: '),
        `${deste}; sem pausa, ${dele}; descanso de ${slot.bloco.descanso} e repete. ${slot.voltas ? `São ${slot.voltas} voltas.` : ''}`));
    }
  }
  if (ex.lados) out.push(h('div', { class: 'box' }, h('b', null, 'Um lado de cada vez: '), 'faça todas as repetições de um lado e depois as do outro. Os dois lados juntos contam como 1 série.'));
  out.push(h('h3', null, 'Como fazer'), h('ol', null, ex.execucao.map((t) => h('li', null, tpl(t, ctx.w, true)))));
  if (ex.erros && ex.erros.length) out.push(h('h3', null, 'Evite'), h('ul', { class: 'bul' }, ex.erros.map((t) => h('li', null, t))));

  if (exId !== 'condicionamento') {
    const hist = cargasDe(exId);
    const sec = [h('h3', null, 'Cargas anteriores')];
    if (hist.length) sec.push(h('ul', { class: 'loads' }, hist.slice(0, 30).map((x) => h('li', null, h('span', null, fmtBarra(fromIso(x.data))), h('span', null, [x.carga ? `${x.carga} kg` : (ex.semCarga ? 'feito' : 'sem carga'), x.reps ? ` · ${x.reps}` : ''].join(''))))));
    else sec.push(h('p', { class: 'muted small' }, 'Nenhum registro ainda.'));
    if (ctx.foco === 'cargas') out.splice(2, 0, ...sec); else out.push(...sec);
  }

  if (ctx.d && slot) {
    const original = slot.ex;
    const opcoes = [original, ...(P.exercicios[original].alternativas || [])].filter((x, i, a) => a.indexOf(x) === i && x !== exId && P.exercicios[x]);
    if (opcoes.length) {
      out.push(h('h3', null, 'Aparelho ocupado? Trocar por'),
        h('div', { class: 'alts' }, opcoes.map((alt) => h('button', { class: 'chip', type: 'button', onclick: () => trocarExercicio(ctx.d, ctx.tipo, original, exId, alt) }, alt === original ? `Voltar para ${P.exercicios[alt].nome}` : P.exercicios[alt].nome))));
    }
  }
  return out;
}
function trocarExercicio(d, tipo, slotId, atualId, novoId) {
  const l = garantir(d, tipo);
  const atual = l.itens[atualId] ? Object.assign({}, l.itens[atualId]) : {};
  delete l.itens[atualId];
  const novo = Object.assign(atual, { nome: P.exercicios[novoId].nome });
  if (novo.feito === undefined) novo.feito = false;
  if (novoId === slotId) delete novo.lugar; else novo.lugar = slotId;
  if (novoId !== atualId) delete novo.carga;
  l.itens[novoId] = novo;
  tocar(l);
  fecharFicha();
  renderHoje();
  toast(`Trocado por ${P.exercicios[novoId].nome}`);
}
function fichaBloco(tipo, b, w) {
  const out = [h('span', { class: 'eyebrow' }, sess(tipo).nome), h('h2', null, [tpl(b.rep || '', w), b.nome].filter(Boolean).join(' '))];
  const linha = [tpl(b.dur || '', w), tpl(b.alvo || '', w)].filter(Boolean).join(' · ');
  if (linha) out.push(h('p', { class: 'num' }, linha));
  if (b.explica) out.push(h('p', null, tpl(b.explica, w, true)));
  return out;
}
function fichaSessao(tipo, w) {
  const s = sess(tipo);
  const out = [h('span', { class: 'eyebrow' }, 'Guia'), h('h2', null, nomeSessao(tipo, true))];
  if (s.tipo === 'forca') {
    if (w) out.push(h('p', { class: 'muted small' }, `Semana atual: ${w.forca}`));
    out.push(h('button', { class: 'tap-row', type: 'button', onclick: () => abrirFicha(() => fichaAquecimento(), true) }, h('span', { class: 'grow' }, h('b', null, 'Aquecimento'), ` · ${P.aquecimento.dur}`), h('span', { class: 'chev' }, '›')));
    const slots = slotsForca(tipo, w);
    out.push(h('ul', { class: 'guide' }, slots.map((sl) => h('li', null, h('button', { type: 'button', onclick: () => abrirFicha(() => fichaExercicio(sl.ex, { slot: sl, tipo, w }), true) },
      h('span', { class: 'grow' }, P.exercicios[sl.ex].nome, h('small', null, [sl.series, sl.bloco.biset ? `bi-set com ${P.exercicios[sl.par.ex].nome}` : null].filter(Boolean).join(' · '))), h('span', { class: 'chev' }, '›'))))));
  } else {
    for (const b of s.blocos || []) {
      out.push(h('div', { class: 'box' }, h('b', null, [tpl(b.rep || '', w), b.nome].filter(Boolean).join(' ')), ' ', h('span', { class: 'num' }, [tpl(b.dur || '', w), tpl(b.alvo || '', w)].filter(Boolean).join(' · ')), b.explica ? h('p', { style: 'margin-top:4px' }, tpl(b.explica, w, true)) : null));
    }
    for (const n of s.notas || []) out.push(h('p', { class: 'muted small' }, n));
  }
  return out;
}
function fichaZonas() {
  return [h('span', { class: 'eyebrow' }, 'Guia'), h('h2', null, 'Suas zonas'),
    h('table', { class: 'zones' }, h('thead', null, h('tr', null, h('th', null, 'Zona'), h('th', null, 'FC'), h('th', null, 'Ritmo'))),
      h('tbody', null, ZONAS.map((z) => h('tr', null,
        h('td', null, h('span', { class: 'zname' }, h('i', { style: `background:${COR_ZONA[z]}` }), `${z} ${(P.zonasInfo[z] || {}).nome || ''}`), h('br'), h('span', { class: 'muted small' }, (P.zonasInfo[z] || {}).sensacao || '')),
        h('td', { class: 'num small' }, fcTxt(z) || '—'), h('td', { class: 'num small' }, ritmoTxt(z) || '—'))))),
    S.ritmoRetorno ? h('p', { class: 'small muted' }, `Tiros nas semanas de retorno: ${S.ritmoRetorno}/km.`) : null,
    h('p', { class: 'small muted' }, 'Na Z2, siga a frequência cardíaca, não o ritmo. Para mudar os valores, vá em Ajustes.')];
}
function fichaPlano() {
  const kAtual = semanaCal(HOJE);
  const nAtual = numPlano(kAtual);
  return [h('span', { class: 'eyebrow' }, 'Guia'), h('h2', null, P.nome), P.objetivo ? h('p', { class: 'muted' }, P.objetivo) : null,
    h('ul', { class: 'plan12' }, P.semanas.map((w, i) => h('li', { class: i + 1 === nAtual ? 'cur' : null }, h('span', { class: 'wk' }, `S${i + 1}`),
      h('div', null, h('div', { class: 'row wrap' }, h('b', null, w.fase), w.descarga ? h('span', { class: 'pill ok' }, 'descarga') : null, w.teste ? h('span', { class: 'pill ball' }, 'teste 5 km') : null),
        h('div', { class: 'l2' }, w.tiros ? `Tiros ${w.tiros.n} × ${w.tiros.tiro} · Longão ${w.longao}` : `Teste de 5 km · Longão ${w.longao}`))))),
    h('h3', null, 'Regras'), h('ul', { class: 'bul' }, (P.regras || []).map((r) => h('li', null, r))),
    h('p', { class: 'small muted' }, 'A fase avança por semana cumprida. Se fizer menos de 3 dos 5 treinos principais, o app sugere repetir a semana.')];
}

/* ---------- SEMANA ---------- */
function renderSemana() {
  const v = $('#v-semana');
  if (semanaVista == null) semanaVista = Math.max(0, Math.min(semanaCal(HOJE), ultimaSemanaCal() + 1));
  const k = semanaVista;
  const ini = inicioSemanaCal(k);
  const n = numPlano(k);
  const w = n ? P.semanas[n - 1] : null;
  const titulo = n ? `Semana ${n} de ${P.semanas.length}` : k < 1 ? 'Antes do plano' : 'Depois do plano';
  const sub = h('div', { class: 'sub' }, h('span', { class: 'num' }, `${fmtCurto(ini)} – ${fmtCurto(addDays(ini, 6))}`));
  if (w) sub.append(h('span', { class: 'pill' }, w.fase));
  if (w && w.teste) sub.append(h('span', { class: 'pill ball' }, 'teste 5 km'));
  if (repetida(k)) sub.append(h('span', { class: 'pill dim' }, 'repetida'));
  const parts = [h('header', { class: 'week-head' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Semana anterior', disabled: k <= 0, onclick: () => { semanaVista--; renderSemana(); } }, '‹'),
    h('div', { class: 'mid' }, h('h2', null, titulo), sub),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Próxima semana', disabled: k > ultimaSemanaCal(), onclick: () => { semanaVista++; renderSemana(); } }, '›'))];

  if (n) parts.push(h('p', { class: 'muted small', style: 'text-align:center' }, `${principaisFeitos(k)} de ${P.principais.length} treinos principais feitos`));

  parts.push(h('ul', { class: 'days' }, Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ini, i);
    const inf = infoDia(d);
    const log = reg(d);
    const f = feito(log);
    const pl = sugerido(d);
    const real = f ? log.sessao : (log && log.sessao) || pl;
    const plTxt = pl === 'livre' ? (n ? 'Sem treino' : 'Livre') : nomeSessao(pl);
    const what = h('span', { class: 'what' });
    if (f && real !== pl) what.append(h('span', { class: 'p' }, nomeSessao(real)), h('br'), h('span', { class: 'p strike' }, plTxt));
    else if (!f && real !== pl) what.append(h('span', { class: 'p' }, nomeSessao(real)), h('br'), h('span', { class: 'h' }, `no lugar de ${plTxt}`));
    else what.append(h('span', { class: 'p' }, plTxt), (inf.base.h || sess(pl).opcional) ? h('br') : null, h('span', { class: 'h' }, [inf.base.h, sess(pl).opcional ? 'opcional' : null].filter(Boolean).join(' · ')));
    const hj = d.getTime() === HOJE.getTime();
    return h('li', null, h('button', { class: 'dayrow' + (hj ? ' today' : ''), type: 'button', onclick: () => abrirDia(d) },
      h('span', { class: 'dd' }, h('b', null, d.getDate()), h('small', null, DIAS[i])), what,
      h('span', { class: 'st' + (f ? '' : ' plan') }, f ? '✓' : hj ? 'hoje' : '')));
  })));

  if (n && P.semanaVariante) {
    const inp = h('input', { type: 'checkbox', id: 'noite' });
    inp.checked = !!pp().noites[k];
    inp.addEventListener('change', () => { pp().noites[k] = inp.checked; salvar(); renderSemana(); });
    parts.push(h('label', { class: 'toggle card', for: 'noite' }, h('span', null, P.semanaVariante.rotulo, h('br'), h('span', { class: 'muted small' }, 'Terça vira descanso e a semana empurra um dia.')), h('span', { class: 'switch' }, inp, h('span', { class: 'track' }))));
  }

  const wG = w || P.semanas[(numPlano(semanaCal(HOJE)) || 1) - 1];
  const item = (rot, sub2, fn) => h('li', null, h('button', { type: 'button', onclick: () => abrirFicha(fn) }, h('span', { class: 'grow' }, rot, sub2 ? h('small', null, sub2) : null), h('span', { class: 'chev muted' }, '›')));
  parts.push(h('h3', { style: 'margin-top:6px' }, 'Guia'));
  parts.push(h('ul', { class: 'guide' },
    item('As 12 semanas e as regras', 'fases, descargas e testes', () => fichaPlano()),
    item('Aquecimento', P.aquecimento.dur, () => fichaAquecimento()),
    ...['A', 'B', 'C'].filter((x) => P.sessoes[x]).map((x) => item(nomeSessao(x), sess(x).titulo, () => fichaSessao(x, wG))),
    ...['int', 'teste5k', 'z2', 'longao', 'tenis'].filter((x) => P.sessoes[x]).map((x) => item(nomeSessao(x), null, () => fichaSessao(x, x === 'teste5k' ? null : wG))),
    item('Suas zonas', 'frequência cardíaca e ritmo', () => fichaZonas())));
  v.replaceChildren(...parts);
}

/* ---------- HISTÓRICO ---------- */
function resumo(l) {
  const s = sess(l.sessao);
  if (s.tipo === 'forca') {
    const its = Object.values(l.itens || {}).filter((x) => x.feito);
    const c = its.filter((x) => x.carga).length;
    return `${its.length} ${its.length === 1 ? 'exercício' : 'exercícios'}${c ? ` · ${c} com carga` : ''}`;
  }
  return [l.detalhe, l.longo ? 'jogo longo' : null].filter(Boolean).join(' · ') || 'Feito';
}
function renderHistorico() {
  const v = $('#v-historico');
  const lista = Object.values(S.registros).filter((l) => l && l.data && feito(l)).sort((a, b) => (a.data < b.data ? 1 : -1));
  const parts = [h('h1', null, 'Histórico')];
  if (!lista.length) { parts.push(h('p', { class: 'empty' }, 'Nenhum treino registrado ainda. Marque o que fez na aba Hoje.')); v.replaceChildren(...parts); return; }
  const ul = h('ul', { class: 'hist' });
  let mes = '';
  for (const l of lista) {
    const d = fromIso(l.data);
    const m = `${MESES_LONGO[d.getMonth()]} ${d.getFullYear()}`;
    if (m !== mes) { mes = m; ul.append(h('li', { class: 'month' }, m)); }
    ul.append(h('li', null, h('button', { class: 'dayrow', type: 'button', onclick: () => abrirDia(d) },
      h('span', { class: 'dd' }, h('b', null, d.getDate()), h('small', null, DIAS[diaSemana(d)])),
      h('span', { class: 'what' }, h('span', { class: 'p' }, nomeSessao(l.sessao)), h('br'), h('span', { class: 'h' }, resumo(l))),
      h('span', { class: 'st' }, l.nota ? '✎' : ''))));
  }
  parts.push(h('p', { class: 'muted small' }, `${lista.length} ${lista.length === 1 ? 'treino' : 'treinos'}`), ul);
  v.replaceChildren(...parts);
}

/* ---------- AJUSTES ---------- */
function renderAjustes() {
  const v = $('#v-ajustes');
  const parts = [h('h1', null, 'Ajustes')];

  // backup
  const ub = S.ultimoBackup ? new Date(S.ultimoBackup) : null;
  parts.push(h('section', { class: 'card' }, h('h3', null, 'Backup'),
    h('p', { class: 'small muted' }, ub ? `Último backup em ${fmtBarra(ub)} às ${pad(ub.getHours())}:${pad(ub.getMinutes())}.` : 'Nenhum backup feito ainda.'),
    h('p', { class: 'small muted' }, 'Os dados ficam só neste aparelho. O backup gera um arquivo para salvar em Arquivos → iCloud Drive → Treinos.'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn solid', type: 'button', onclick: fazerBackup }, 'Fazer backup'), h('button', { class: 'btn', type: 'button', onclick: () => $('#f-restaurar').click() }, 'Restaurar'))));

  // zonas
  const tb = h('tbody');
  for (const z of ZONAS) {
    const fc = h('input', { value: fcEdit(z), placeholder: z === 'Z1' ? 'até 125' : z === 'Z5' ? '187+' : '126–156', 'aria-label': `FC da ${z}`, inputmode: 'text' });
    const rt = h('input', { value: ritmoEdit(z), placeholder: z === 'Z1' ? 'acima de 6:20' : '5:27–6:20', 'aria-label': `Ritmo da ${z}` });
    fc.addEventListener('change', () => { Object.assign(S.zonas[z], parseFc(fc.value)); salvar(); fc.value = fcEdit(z); });
    rt.addEventListener('change', () => { Object.assign(S.zonas[z], parseRitmo(rt.value)); salvar(); rt.value = ritmoEdit(z); });
    tb.append(h('tr', null, h('td', null, h('span', { class: 'zname' }, h('i', { style: `background:${COR_ZONA[z]}` }), z)), h('td', null, fc), h('td', null, rt)));
  }
  const rr = h('input', { class: 'text', value: S.ritmoRetorno, placeholder: '4:55–5:10', 'aria-label': 'Ritmo dos tiros nas semanas de retorno' });
  rr.addEventListener('change', () => { const r = parseRitmo(rr.value); S.ritmoRetorno = r.pRapido && r.pLento ? `${mmss(r.pRapido)}–${mmss(r.pLento)}` : rr.value.trim(); rr.value = S.ritmoRetorno; salvar(); });
  parts.push(h('section', { class: 'card' }, h('h3', null, 'Zonas'),
    h('table', { class: 'zones' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'FC (bpm)'), h('th', null, 'Ritmo (min/km)'))), tb),
    h('label', { class: 'log' }, h('span', { class: 'lab' }, 'Tiros nas semanas de retorno (min/km)'), rr)));

  // teste de 5 km
  const t5 = h('input', { class: 'text', placeholder: 'ex.: 24:30', inputmode: 'numeric', 'aria-label': 'Tempo do teste de 5 km' });
  const testes = (S.testes5k || []).slice().sort((a, b) => (a.data < b.data ? 1 : -1));
  parts.push(h('section', { class: 'card' }, h('h3', null, 'Teste de 5 km'),
    h('p', { class: 'small muted' }, 'Digite o tempo e o app calcula os novos ritmos das zonas. Você confere antes de aplicar.'),
    h('div', { class: 'row' }, t5, h('button', { class: 'btn', type: 'button', onclick: () => propor5k(t5.value, iso(HOJE)) }, 'Calcular')),
    testes.length ? h('ul', { class: 'loads' }, testes.map((t) => h('li', null, h('span', null, fmtBarra(fromIso(t.data))), h('span', null, t.tempo)))) : null));

  // plano
  const custom = !!S.plano;
  parts.push(h('section', { class: 'card' }, h('h3', null, 'Plano'),
    h('dl', { class: 'kv' }, h('dt', null, 'Nome'), h('dd', null, P.nome), h('dt', null, 'Início'), h('dd', null, fmtBarra(inicioPlano()) + '/' + inicioPlano().getFullYear()), h('dt', null, 'Semanas'), h('dd', null, String(P.semanas.length)), h('dt', null, 'Origem'), h('dd', null, custom ? 'carregado de arquivo' : 'padrão do app')),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn', type: 'button', onclick: () => $('#f-plano').click() }, 'Carregar plano'),
      custom && PADRAO ? h('button', { class: 'btn ghost', type: 'button', onclick: usarPadrao }, 'Usar o plano padrão') : null)));

  parts.push(h('p', { class: 'small muted', style: 'text-align:center' }, `Tiebreak ${APP_VERSAO} · ${Object.keys(S.registros).length} registros neste aparelho`));
  v.replaceChildren(...parts);
}

function propor5k(texto, dataIso) {
  const t = parseTempo(texto);
  if (!t) { toast('Use o formato mm:ss, por exemplo 24:30.'); return; }
  const p5 = t / 5;
  const novas = {};
  for (const z of ZONAS) {
    const [a, b] = FATORES_5K[z];
    novas[z] = { pRapido: Math.round(p5 * a), pLento: b ? Math.round(p5 * b) : null };
  }
  const fmtR = (r) => (r.pRapido && r.pLento ? `${mmss(r.pRapido)}–${mmss(r.pLento)}` : `acima de ${mmss(r.pRapido)}`);
  abrirFicha(() => [h('span', { class: 'eyebrow' }, 'Teste de 5 km'), h('h2', null, `${mmss(t)} · ${mmss(p5)}/km`),
    h('p', { class: 'muted small' }, 'Novos ritmos das zonas. A frequência cardíaca não muda.'),
    h('table', { class: 'zones' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Atual'), h('th', null, 'Novo'))),
      h('tbody', null, ZONAS.map((z) => h('tr', null, h('td', null, h('span', { class: 'zname' }, h('i', { style: `background:${COR_ZONA[z]}` }), z)), h('td', { class: 'num small muted' }, ritmoEdit(z) || '—'), h('td', { class: 'num small' }, fmtR(novas[z])))))),
    h('p', { class: 'muted small' }, 'Depois das semanas de retorno, os tiros usam o ritmo da Z5.'),
    h('div', { class: 'row' }, h('button', { class: 'btn solid', type: 'button', onclick: () => {
      for (const z of ZONAS) Object.assign(S.zonas[z], novas[z]);
      S.testes5k = (S.testes5k || []).filter((x) => x.data !== dataIso).concat([{ data: dataIso, tempo: mmss(t) }]);
      salvar(); fecharFicha(); toast('Ritmos atualizados'); renderTudo();
    } }, 'Aplicar'), h('button', { class: 'btn ghost', type: 'button', onclick: fecharFicha }, 'Agora não'))]);
}

/* ---------- backup ---------- */
function lembreteBackup() {
  if (!Object.values(S.registros).some(feito)) return null;
  if (!S.ultimoBackup) return 'Ainda sem backup dos seus treinos.';
  const dias = diffDias(HOJE, new Date(new Date(S.ultimoBackup).setHours(0, 0, 0, 0)));
  return dias > 7 ? `Último backup há ${dias} dias.` : null;
}
async function fazerBackup() {
  const dados = Object.assign({}, S, { exportado: new Date().toISOString(), appVersao: APP_VERSAO });
  const nome = `treinos-${iso(HOJE)}.json`;
  const blob = new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' });
  const marcar = () => { S.ultimoBackup = new Date().toISOString(); salvar(); renderTudo(); };
  try {
    const file = new File([blob], nome, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Tiebreak' });
      marcar(); toast('Backup feito'); return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  marcar(); toast('Arquivo de backup baixado');
}
function lerArquivo(input) {
  return new Promise((res, rej) => {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) { rej(new Error('nenhum arquivo')); return; }
    const r = new FileReader();
    r.onload = () => { try { res(JSON.parse(r.result)); } catch (e) { rej(new Error('O arquivo não é um JSON válido.')); } };
    r.onerror = () => rej(new Error('Não foi possível ler o arquivo.'));
    r.readAsText(f);
  });
}
async function restaurar() {
  let d;
  try { d = await lerArquivo($('#f-restaurar')); } catch (e) { if (e.message !== 'nenhum arquivo') toast(e.message); return; }
  if (!d || d.app !== 'tiebreak' || typeof d.registros !== 'object') { toast('Este arquivo não é um backup do Tiebreak.'); return; }
  const regs = Object.values(d.registros).filter((l) => l && l.data);
  const feitos = regs.filter(feito).length;
  const ultimo = regs.map((l) => l.data).sort().pop();
  abrirFicha(() => [h('span', { class: 'eyebrow' }, 'Restaurar backup'), h('h2', null, 'Substituir os dados?'),
    h('dl', { class: 'kv' }, h('dt', null, 'Treinos feitos'), h('dd', null, String(feitos)), h('dt', null, 'Último registro'), h('dd', null, ultimo ? fmtBarra(fromIso(ultimo)) : '—'), h('dt', null, 'Backup de'), h('dd', null, d.exportado ? fmtBarra(new Date(d.exportado)) : '—')),
    h('p', { class: 'small muted' }, 'Tudo o que está neste aparelho agora será trocado pelo conteúdo do arquivo.'),
    h('div', { class: 'row' }, h('button', { class: 'btn solid', type: 'button', onclick: () => {
      const novo = Object.assign(estadoVazio(), d);
      delete novo.exportado; delete novo.appVersao;
      for (const z of ZONAS) novo.zonas[z] = Object.assign({ fcMin: null, fcMax: null, pRapido: null, pLento: null }, (d.zonas || {})[z]);
      S = novo;
      if (!S.ultimoBackup) S.ultimoBackup = d.exportado || null;
      salvar(); usarPlano(); fecharFicha(); semanaVista = null; toast('Backup restaurado'); renderTudo();
    } }, 'Restaurar'), h('button', { class: 'btn ghost', type: 'button', onclick: fecharFicha }, 'Cancelar'))]);
}
function validarPlano(p) {
  if (!p || typeof p !== 'object') return 'Arquivo vazio.';
  if (!String(p.formato || '').startsWith('tiebreak-plano')) return 'Este arquivo não é um plano do Tiebreak.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio || '')) return 'O plano não tem data de início.';
  if (!Array.isArray(p.semanas) || !p.semanas.length) return 'O plano não tem semanas.';
  if (!Array.isArray(p.semanaPadrao) || p.semanaPadrao.length !== 7) return 'A semana padrão precisa ter 7 dias.';
  if (!p.sessoes || !p.exercicios) return 'Faltam sessões ou exercícios.';
  for (const s of Object.values(p.sessoes)) for (const b of s.blocos || []) for (const x of (b.biset ? b.ex : b.ex ? [b] : [])) if (!p.exercicios[x.ex]) return `Exercício sem ficha: ${x.ex}`;
  if (!p.sessoes.livre) p.sessoes.livre = { nome: 'Outro treino', tipo: 'livre', blocos: [], registro: { rotulo: 'O que você fez', placeholder: '' } };
  if (!p.sessoes.descanso) p.sessoes.descanso = { nome: 'Descanso', tipo: 'descanso', blocos: [] };
  p.principais ||= ['A', 'B', 'C', 'int'];
  p.aquecimento ||= { dur: '', passos: [] };
  return null;
}
async function carregarPlanoArquivo() {
  let p;
  try { p = await lerArquivo($('#f-plano')); } catch (e) { if (e.message !== 'nenhum arquivo') toast(e.message); return; }
  const erro = validarPlano(p);
  if (erro) { toast(erro); return; }
  abrirFicha(() => [h('span', { class: 'eyebrow' }, 'Carregar plano'), h('h2', null, p.nome || 'Plano sem nome'),
    h('dl', { class: 'kv' }, h('dt', null, 'Início'), h('dd', null, fmtBarra(fromIso(p.inicio)) + '/' + p.inicio.slice(0, 4)), h('dt', null, 'Semanas'), h('dd', null, String(p.semanas.length)), h('dt', null, 'Exercícios'), h('dd', null, String(Object.keys(p.exercicios).length))),
    h('p', { class: 'small muted' }, 'Seus registros continuam todos no histórico. As cargas seguem pelo código de cada exercício.'),
    h('div', { class: 'row' }, h('button', { class: 'btn solid', type: 'button', onclick: () => { S.plano = p; salvar(); usarPlano(); fecharFicha(); semanaVista = null; toast('Plano carregado'); renderTudo(); } }, 'Usar este plano'), h('button', { class: 'btn ghost', type: 'button', onclick: fecharFicha }, 'Cancelar'))]);
}
function usarPadrao() { S.plano = null; salvar(); usarPlano(); semanaVista = null; toast('Plano padrão em uso'); renderTudo(); }
function usarPlano() {
  if (S.plano && !validarPlano(S.plano)) P = S.plano;
  else P = PADRAO;
}

/* ---------- início ---------- */
async function iniciar() {
  carregarEstado();
  try {
    const r = await fetch('plano.json', { cache: 'no-cache' });
    PADRAO = await r.json();
    validarPlano(PADRAO);
  } catch (e) {
    if (!S.plano) { $('#loading').textContent = 'Não foi possível carregar o plano. Abra com internet uma vez.'; return; }
  }
  usarPlano();
  $('#loading').remove();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.tab === 'hoje' && aba === 'hoje') diaAberto = HOJE;
    if (b.dataset.tab === 'semana') semanaVista = null;
    irAba(b.dataset.tab);
  }));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', fecharFicha));
  $('#sheet-back').addEventListener('click', voltarFicha);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) fecharFicha(); });
  $('#f-restaurar').addEventListener('change', restaurar);
  $('#f-plano').addEventListener('change', carregarPlanoArquivo);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const novo = hojeData();
    if (novo.getTime() !== HOJE.getTime()) {
      if (diaAberto.getTime() === HOJE.getTime()) diaAberto = novo;
      HOJE = novo; renderTudo();
    }
  });
  diaAberto = HOJE;
  irAba('hoje');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
