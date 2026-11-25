/* Cap Finance — application (JavaScript sans framework, données dans Supabase). */
(() => {
"use strict";
const C = window.ES_CONTENT, CFG = window.ES_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safe = u => typeof u === "string" && /^https:\/\//i.test(u.trim()) ? u.trim() : "";
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => iso(new Date());
const addDays = (s, n) => { const d = pd(s) || new Date(); d.setDate(d.getDate() + n); return iso(d); };
const pd = v => { if (!v) return null; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
const fd = v => { const d = pd(v); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : ""; };
const days = (a, b) => { const x = pd(a), y = pd(b); return x && y ? Math.round((y - x) / 864e5) : NaN; };
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const toast = t => { const e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 2800); };

const APPLIED = new Set(["Candidature envoyée","En attente","Relance à effectuer","Entretien obtenu","Entretiens en cours","Test ou étude de cas","Refus","Acceptée"]);
const RESPONDED = new Set(["Entretien obtenu","Entretiens en cours","Test ou étude de cas","Refus","Acceptée"]);
const WAITING = new Set(["Candidature envoyée","En attente","Relance à effectuer"]);
const INTERVIEW = new Set(["Entretien obtenu","Entretiens en cours","Test ou étude de cas"]);
const CLOSED = new Set(["Refus","Acceptée","Abandonnée"]);
const LINK = {ok:"Ouverte – vérifiée", mid:"Listée sur le site officiel", unk:"Non vérifiable", bad:"Pourvue / expirée"};
const TABLES = ["companies","offers","contacts","events","documents","document_links","tasks","templates","sync_runs","notifications"];

let sb = null, user = null, since = null, loadedAt = 0;
const D = {config: null}; TABLES.forEach(t => D[t] = []);
const S = {kind: "publiee", mode: "liste", group: "", q: "", chip: "", zone: "", place: "", sector: "", status: "", sort: "recent",
  compare: new Set(), drawer: null, tab: "details", calM: null, netCat: "", netRel: "", netQ: "", compQ: "", compSector: "", compTarget: false,
  prepId: "", qCat: "Général", qIdx: 0, docQ: "", appFilter: "", timer: null};

/* ===================== accès aux données ===================== */
async function q(p) { const {data, error} = await p; if (error) throw error; return data; }
async function loadAll() {
  const res = await Promise.all(TABLES.map(t => q(sb.from(t).select("*"))));
  TABLES.forEach((t, i) => D[t] = res[i] || []);
  const cfg = await q(sb.from("app_config").select("*"));
  D.config = cfg[0] || null; loadedAt = Date.now();
}
function fail(e) { console.error(e); toast("Erreur : " + (e && (e.message || e.error_description) || "action impossible")); }
async function ins(t, row) { try { const r = await q(sb.from(t).insert(row).select().single()); D[t].push(r); render(); return r; } catch (e) { fail(e); return null; } }
async function upd(t, id, patch) { try { const r = await q(sb.from(t).update(patch).eq("id", id).select().single()); D[t] = D[t].map(x => x.id === id ? r : x); render(); return r; } catch (e) { fail(e); return null; } }
async function del(t, id) { try { await q(sb.from(t).delete().eq("id", id)); D[t] = D[t].filter(x => x.id !== id); render(); return true; } catch (e) { fail(e); return false; } }
async function updConfig(patch) { try { const r = await q(sb.from("app_config").update(patch).eq("owner_id", user.id).select().single()); D.config = r; render(); return r; } catch (e) { fail(e); } }
const byId = (t, id) => D[t].find(x => x.id === id);

/* ===================== connexion ===================== */
async function boot() {
  if (!window.supabase || !CFG.url || /VOTRE/.test(CFG.url)) { $("#cfg").hidden = false; return; }
  sb = window.supabase.createClient(CFG.url, CFG.anonKey);
  const {data} = await sb.auth.getSession();
  if (data && data.session) start(data.session.user); else showAuth();
  sb.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_OUT") showAuth(); if (ev === "PASSWORD_RECOVERY") newPassword(); });
}
function showAuth() { $("#app").hidden = true; $("#auth").hidden = false; }
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); const m = $("#lMsg"); m.textContent = "Connexion…";
  const {data, error} = await sb.auth.signInWithPassword({email: $("#lEmail").value.trim(), password: $("#lPass").value});
  if (error) { m.textContent = "Connexion impossible : " + error.message; return; }
  m.textContent = ""; start(data.user);
});
$("#sBtn").addEventListener("click", async () => {
  const m = $("#lMsg"), email = $("#lEmail").value.trim(), password = $("#lPass").value;
  if (!email || password.length < 8) { m.textContent = "Saisis ton e-mail et un mot de passe d'au moins 8 caractères."; return; }
  const {data, error} = await sb.auth.signUp({email, password, options: {emailRedirectTo: location.origin + location.pathname}});
  if (error) { m.textContent = "Création impossible : " + error.message; return; }
  if (data.session) { start(data.user); return; }
  const li = await sb.auth.signInWithPassword({email, password});
  if (!li.error) start(li.data.user); else m.textContent = "Compte créé. Si un e-mail de confirmation t'est envoyé, clique sur le lien, puis connecte-toi.";
});
$("#rBtn").addEventListener("click", async () => {
  const email = $("#lEmail").value.trim(); if (!email) { $("#lMsg").textContent = "Saisis d'abord ton e-mail."; return; }
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
  $("#lMsg").textContent = error ? error.message : "Un lien de réinitialisation t'a été envoyé.";
});
function newPassword() {
  formDialog("Nouveau mot de passe", [["password","Nouveau mot de passe (8 caractères minimum)","password"]], {}, async v => {
    if ((v.password || "").length < 8) { toast("8 caractères minimum"); return false; }
    const {error} = await sb.auth.updateUser({password: v.password}); if (error) { fail(error); return false; } toast("Mot de passe modifié");
  });
}
async function start(u) {
  user = u; $("#auth").hidden = true; $("#app").hidden = false; $("#main").innerHTML = `<div class="empty">Chargement de ton espace…</div>`;
  try {
    await loadAll();
    if (!D.config) {
      try { D.config = await q(sb.from("app_config").insert({is_primary: true}).select().single()); }
      catch (e) { D.config = await q(sb.from("app_config").insert({is_primary: false}).select().single()); }
    }
    if (!D.templates.length) { const rows = await q(sb.from("templates").insert(C.TEMPLATES).select()); D.templates = rows; }
    if (D.config.is_primary && !D.offers.length && !D.companies.length) await importSeed();
    since = D.config.last_visit || "1970-01-01";
    updConfig({prev_visit: D.config.last_visit, last_visit: new Date().toISOString()});
  } catch (e) { fail(e); $("#main").innerHTML = `<div class="banner">Impossible de charger tes données : ${esc(e.message || e)}. Vérifie ta connexion internet puis recharge la page.</div>`; return; }
  render();
}
/* Première connexion : reprise de la cartographie des employeurs et des offres déjà repérées */
async function importSeed() {
  try {
    const r = await fetch("data/seed.json", {cache: "no-store"}); if (!r.ok) return;
    const s = await r.json();
    $("#main").innerHTML = `<div class="empty">Première connexion : import de tes ${s.companies.length} entreprises et ${s.offers.length} offres…</div>`;
    const comps = await q(sb.from("companies").insert(s.companies).select());
    const idOf = n => (comps.find(c => norm(c.name) === norm(n)) || {}).id || null;
    const missing = [...new Set(s.offers.map(o => o.company_name))].filter(n => !idOf(n));
    if (missing.length) comps.push(...await q(sb.from("companies").insert(missing.map(name => ({name, source: "import"}))).select()));
    const offers = s.offers.map((o, i) => ({...o, ext_id: "OFF-" + String(i + 1).padStart(4, "0"), source: "import", kind: "publiee", company_id: idOf(o.company_name)}));
    await q(sb.from("offers").insert(offers));
    await loadAll();
  } catch (e) { fail(e); }
}
$("#outBtn").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; });
window.addEventListener("focus", async () => { if (user && Date.now() - loadedAt > 60000) { try { await loadAll(); render(); } catch (e) { /* hors ligne */ } } });

/* ===================== règles métier ===================== */
const isApplied = o => !!o.applied_at || APPLIED.has(o.status);
const isNew = o => o.status === "Nouvelle offre" && since && o.created_at > since;
const isPrio = o => !CLOSED.has(o.status) && ((o.score || 0) >= 75 || o.priority === "Élevée");
const zoneOf = o => { const c = norm(o.country || "France"); return c === "france" ? "fr" : C.EUROPE.includes(c) ? "eu" : "world"; };
const contactName = k => [k.first_name, k.last_name].filter(Boolean).join(" ") || (k.is_suggestion ? "Piste : " + (k.role || "interlocuteur à identifier") : "Contact sans nom");
const companyOf = o => o.company_id ? byId("companies", o.company_id) : D.companies.find(c => norm(c.name) === norm(o.company_name));
const offersOfCompany = c => D.offers.filter(o => o.company_id === c.id || norm(o.company_name) === norm(c.name));
const contactsOfCompany = c => D.contacts.filter(k => k.company_id === c.id || (k.company_name && norm(k.company_name) === norm(c.name)));
const docsOfOffer = o => { const ids = new Set(D.document_links.filter(l => l.offer_id === o.id).map(l => l.document_id)); [o.cv_doc_id, o.letter_doc_id].forEach(x => x && ids.add(x)); return [...ids].map(i => byId("documents", i)).filter(Boolean); };
const offersOfDoc = d => D.offers.filter(o => o.cv_doc_id === d.id || o.letter_doc_id === d.id || D.document_links.some(l => l.document_id === d.id && l.offer_id === o.id));

async function setStatus(o, ns) {
  if (!o || o.status === ns) return;
  const t = today(), ch = {status: ns, status_at: new Date().toISOString()};
  if (o.status === "Nouvelle offre" && !o.saved_at) ch.saved_at = t;
  if (ns === "Candidature à préparer" && !o.prep_at) ch.prep_at = t;
  if (ns === "Candidature envoyée" && !o.applied_at) { ch.applied_at = t; if (!o.follow_up_at) ch.follow_up_at = addDays(t, 10); }
  if (RESPONDED.has(ns) && !o.response_at) ch.response_at = t;
  if (ns === "Refus") ch.result = o.result || "Non retenue";
  if (ns === "Acceptée") ch.result = "Stage obtenu";
  const r = await upd("offers", o.id, ch);
  if (r) { ins("events", {offer_id: o.id, date: t, type: "Statut", text: (o.status || "—") + " → " + ns}); toast("Statut : " + ns); }
}

/* Actions du jour : calculées à partir des données, chacune avec sa raison */
function actions() {
  const t = today(), out = [];
  for (const o of D.offers) {
    if (WAITING.has(o.status) && o.follow_up_at && o.follow_up_at <= t) out.push({urg: true, d: o.follow_up_at, txt: `Relancer ${o.company_name}`, why: `Candidature envoyée le ${fd(o.applied_at)} pour « ${o.title} », relance prévue le ${fd(o.follow_up_at)}.`, a: "open-offer", id: o.id});
    if (o.interview_at && o.interview_at >= t && days(t, o.interview_at) <= 7 && !CLOSED.has(o.status)) out.push({urg: days(t, o.interview_at) <= 2, d: o.interview_at, txt: `Préparer l'entretien chez ${o.company_name}`, why: `Entretien le ${fd(o.interview_at)} pour « ${o.title} ».`, a: "prep", id: o.id});
    if (o.test_at && o.test_at >= t && days(t, o.test_at) <= 7) out.push({urg: true, d: o.test_at, txt: `Test ou étude de cas – ${o.company_name}`, why: `Prévu le ${fd(o.test_at)}.`, a: "open-offer", id: o.id});
    if (["Offre sélectionnée","Candidature à préparer"].includes(o.status)) { const dl = o.deadline ? days(t, o.deadline) : null;
      out.push({urg: dl !== null && dl <= 3, d: o.deadline || t, txt: `Envoyer ta candidature à ${o.company_name}`, why: `« ${o.title} » est au statut « ${o.status} »${o.deadline ? `, date limite le ${fd(o.deadline)}` : ""}.`, a: "open-offer", id: o.id}); }
    if (["Offre sélectionnée","Candidature à préparer","À étudier"].includes(o.status) && o.link_state === "bad") out.push({urg: true, d: t, txt: `Annonce devenue indisponible : ${o.company_name}`, why: `La veille a constaté le ${fd(o.link_checked_at)} que « ${o.title} » n'est plus en ligne. Décide si tu l'écartes.`, a: "open-offer", id: o.id});
    if (isNew(o) && (o.score || 0) >= 75) out.push({urg: false, d: t, txt: `Étudier une nouvelle offre très pertinente : ${o.company_name}`, why: `« ${o.title} », note ${o.score}/100.`, a: "open-offer", id: o.id});
  }
  for (const k of D.contacts) if (k.next_action_at && k.next_action_at <= t) out.push({urg: k.next_action_at < t, d: k.next_action_at, txt: `${k.next_action || "Reprendre contact"} – ${contactName(k)}`, why: `${k.company_name || ""}${k.role ? " · " + k.role : ""}`, a: "open-contact", id: k.id});
  for (const x of D.tasks) if (!x.done && x.date <= t) out.push({urg: x.date < t, d: x.date, txt: x.text, why: `${x.kind} prévu le ${fd(x.date)}${x.date < t ? " (en retard)" : ""}.`, a: "task-done", id: x.id, btn: "Fait"});
  const targets = D.companies.filter(c => c.is_target && !contactsOfCompany(c).length);
  if (targets.length) out.push({urg: false, d: t, txt: `Identifier un interlocuteur dans ${targets.length} entreprise(s) cible(s)`, why: targets.slice(0, 4).map(c => c.name).join(", ") + (targets.length > 4 ? "…" : ""), a: "go", id: "prospection"});
  return out.sort((a, b) => (b.urg - a.urg) || String(a.d).localeCompare(String(b.d)));
}

/* ===================== rendu ===================== */
const ROUTES = {accueil: vHome, offres: vOffers, "marche-cache": vOffers, analyse: vAnalyse, candidatures: vApps, kanban: vKanban, entretiens: vPrep, documents: vDocs, reseau: vNetwork, prospection: vProspect, entreprises: vCompanies, calendrier: vCal, parametres: vSettings};
const route = () => { const r = (location.hash || "#accueil").slice(1); return ROUTES[r] ? r : "accueil"; };
window.addEventListener("hashchange", () => { $("#side").classList.remove("open"); if (route() === "marche-cache" && S.kind === "publiee") S.kind = "cachee"; if (route() === "offres" && S.kind !== "publiee" && !S._keepKind) S.kind = "publiee"; S._keepKind = false; render(); window.scrollTo(0, 0); });
function render() {
  if (!user || !D.config) return;
  const r = route();
  document.querySelectorAll(".side a").forEach(a => a.classList.toggle("on", a.dataset.r === r));
  const nn = D.offers.filter(isNew).length; $("#nNew").hidden = !nn; $("#nNew").textContent = nn;
  const nt = actions().filter(a => a.urg).length; $("#nTask").hidden = !nt; $("#nTask").textContent = nt;
  const un = D.notifications.filter(n => !n.read).length; $("#nNotif").hidden = !un; $("#nNotif").textContent = un;
  const last = [...D.sync_runs].sort((a, b) => String(b.started_at).localeCompare(a.started_at))[0], si = $("#syncInfo");
  si.className = "sync" + (last && last.status !== "ok" ? " err" : "");
  si.textContent = last ? `Veille : ${new Date(last.finished_at || last.started_at).toLocaleString("fr-FR", {dateStyle: "short", timeStyle: "short"})}${last.status !== "ok" ? " · " + (last.status === "erreur" ? "erreur" : "partielle") : ""}` : "Veille : aucune synchronisation pour l'instant";
  const fa = document.activeElement, fid = fa && fa.id && $("#main").contains(fa) ? fa.id : null, sel = fid ? fa.selectionStart : null, y = window.scrollY;
  $("#main").innerHTML = ROUTES[r]();
  if (fid) { const e = document.getElementById(fid); if (e) { e.focus(); try { if (sel != null) e.setSelectionRange(sel, sel); } catch (_) {} } }
  window.scrollTo(0, y);
  if (S.drawer) drawDrawer();
}

/* ---------- petits composants ---------- */
const stB = s => `<span class="st s${Math.max(0, C.STATUSES.indexOf(s))}">${esc(s || "—")}</span>`;
const lkB = o => o.link_state ? `<span class="tag ${esc(o.link_state)}" title="Contrôlé le ${esc(fd(o.link_checked_at))}">${esc(LINK[o.link_state])}</span>` : "";
const kB = o => o.kind && o.kind !== "publiee" ? `<span class="tag k-${esc(o.kind)}">${esc(C.KINDS[o.kind])}</span>${o.certainty ? ` <span class="tag">${esc(C.CERTAINTY[o.certainty])}</span>` : ""}` : "";
const scB = o => o.score != null ? `<span class="score ${o.score >= 75 ? "hi" : ""}">${esc(o.score)}/100</span>` : "";
const L = (u, t) => { const s = safe(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(t || s)}</a>` : (u ? `<span class="muted">${esc(u)}</span>` : "—"); };
const bars = (rows, max) => rows.length ? `<div class="bars">${rows.map(([k, v, txt]) => `<div class="r"><span class="l" title="${esc(k)}">${esc(k)}</span><span class="t"><i style="width:${(v / (max || Math.max(...rows.map(x => x[1]), 1)) * 100).toFixed(1)}%"></i></span><span class="v">${esc(txt ?? v)}</span></div>`).join("")}</div>` : `<p class="muted small">Pas encore de données.</p>`;
const countBy = (arr, f) => { const m = new Map(); arr.forEach(o => { const k = f(o) || "Non renseigné"; m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]); };
const opt = (list, v, labels) => list.map(x => `<option value="${esc(x)}" ${x === v ? "selected" : ""}>${esc(labels ? labels[x] : x)}</option>`).join("");

/* ===================== 1. Tableau de bord ===================== */
function vHome() {
  const o = D.offers, ap = o.filter(isApplied), t = today(), acts = actions();
  const resp = ap.filter(x => x.response_at || RESPONDED.has(x.status));
  const k = [
    ["Offres découvertes", o.length, "offres", ""], ["Nouvelles depuis ta dernière visite", o.filter(isNew).length, "offres", "new"], ["Offres prioritaires", o.filter(isPrio).length, "offres", "prio"],
    ["Candidatures envoyées", ap.length, "candidatures", ""], ["En attente de réponse", o.filter(x => WAITING.has(x.status)).length, "candidatures", "att"],
    ["Relances à faire", o.filter(x => WAITING.has(x.status) && x.follow_up_at && x.follow_up_at <= t).length, "candidatures", "rel", true],
    ["Entretiens à venir", o.filter(x => x.interview_at && x.interview_at >= t).length, "entretiens", ""], ["Réponses reçues", resp.length, "candidatures", "resp"],
    ["Refus", o.filter(x => x.status === "Refus").length, "candidatures", "ref"], ["Stages obtenus", o.filter(x => x.status === "Acceptée").length, "candidatures", "acc"]];
  const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const wk = [];
  for (let i = 11; i >= 0; i--) { const s = new Date(mon); s.setDate(s.getDate() - 7 * i); const e = new Date(s); e.setDate(e.getDate() + 7);
    wk.push([pad(s.getDate()) + "/" + pad(s.getMonth() + 1), ap.filter(x => { const d = pd(x.applied_at); return d && d >= s && d < e; }).length]); }
  const wm = Math.max(1, ...wk.map(w => w[1]));
  const fun = [["Offres découvertes", o.length], ["Retenues (étudiées ou plus)", o.filter(x => x.status !== "Nouvelle offre").length], ["Candidatures envoyées", ap.length], ["Entretiens", o.filter(x => x.interview_at || INTERVIEW.has(x.status) || x.status === "Acceptée").length], ["Stages obtenus", o.filter(x => x.status === "Acceptée").length]];
  const fm = Math.max(1, fun[0][1]);
  const nw = o.filter(isNew).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6);
  const name = D.config.display_name ? ", " + D.config.display_name : "";
  return `<div class="head"><div><h1>Bonjour${esc(name)}</h1><p>${new Date().toLocaleDateString("fr-FR", {weekday: "long", day: "numeric", month: "long", year: "numeric"})} · ${acts.length} action(s) à mener aujourd'hui · ${nw.length} nouvelle(s) offre(s) intéressante(s)</p></div>
  <div class="tools" style="margin:0"><button class="btn" data-a="new-task">Nouveau rappel</button><button class="btn pri" data-a="new-offer" data-kind="publiee">Ajouter une offre</button></div></div>
  <div class="grid g2">
   <div class="card"><h2>Mes actions du jour</h2>${acts.length ? acts.slice(0, 12).map(a => `<div class="action ${a.urg ? "urg" : ""}"><span class="ic"></span><div><b>${esc(a.txt)}</b><small>${esc(a.why)}</small></div><button class="btn sm" data-a="${esc(a.a)}" data-id="${esc(a.id)}">${esc(a.btn || "Ouvrir")}</button></div>`).join("") + (acts.length > 12 ? `<p class="small muted">${acts.length - 12} autre(s) dans le calendrier.</p>` : "") : `<p class="muted">Rien d'urgent. C'est le bon moment pour étudier les nouvelles offres ou contacter une entreprise cible.</p>`}</div>
   <div class="card"><h2>Nouvelles opportunités</h2>${nw.length ? nw.map(x => `<div class="action"><span class="ic"></span><div><b>${esc(x.company_name)}</b> · ${esc(x.title)}<small>${esc([x.city, x.country].filter(Boolean).join(", "))} · ${esc(x.start_label || "")}</small></div>${scB(x)} <button class="btn sm" data-a="open-offer" data-id="${esc(x.id)}">Voir</button></div>`).join("") : `<p class="muted">Pas de nouvelle offre depuis ta dernière visite. ${D.sync_runs.length ? "" : "La veille quotidienne alimentera cette liste dès sa première synchronisation."}</p>`}</div>
  </div>
  <div class="kpis" style="margin-top:14px">${k.map(([l, v, r, chip, alert]) => `<button class="kpi ${alert && v ? "alert" : ""}" data-a="kpi" data-r="${r}" data-chip="${chip}"><span>${esc(l)}</span><b>${v}</b></button>`).join("")}</div>
  <div class="grid g2">
   <div class="card"><h2>Candidatures envoyées par semaine</h2><div class="weeks">${wk.map(([l, v]) => `<div><b>${v || ""}</b><i style="height:${(v / wm * 100).toFixed(0)}%"></i>${l}</div>`).join("")}</div></div>
   <div class="card"><h2>Entonnoir de recrutement</h2><div class="funnel">${fun.map(([l, v]) => `<div class="r"><i style="width:${Math.max(1, v / fm * 70)}%"></i><span><b>${v}</b> ${esc(l)}</span></div>`).join("")}</div>
    <p class="small muted">Taux de réponse : ${ap.length ? Math.round(resp.length / ap.length * 100) + " %" : "—"} (${resp.length} réponse(s) pour ${ap.length} candidature(s)).</p></div>
   <div class="card"><h2>Où se trouvent les opportunités</h2>${bars(countBy(o.filter(x => x.status !== "Abandonnée"), x => x.sector).slice(0, 8))}</div>
   <div class="card"><h2>Mon réseau</h2>${bars(C.RELATIONS.map(r => [r, D.contacts.filter(c => c.relation === r && !c.is_suggestion).length]).filter(x => x[1]))}<p class="small muted">${D.contacts.filter(c => !c.is_suggestion).length} contact(s) · ${D.contacts.filter(c => c.is_suggestion).length} piste(s) à identifier</p></div>
  </div>`;
}

/* ===================== 2. Offres et marché caché ===================== */
const CHIPS = [["", "Toutes"], ["new", "Nouvelles"], ["prio", "Prioritaires"], ["recent", "Publiées récemment"], ["fav", "Favoris"], ["side", "Mises de côté"], ["sel", "À candidater"], ["out", "Écartées"]];
function filterOffers(list) {
  const qq = norm(S.q), t = today();
  let l = list.filter(o => {
    if (qq && !norm([o.company_name, o.title, o.sector, o.city, o.country, o.status, o.skills, o.missions].join(" ")).includes(qq)) return false;
    switch (S.chip) {
      case "new": if (!isNew(o) && o.status !== "Nouvelle offre") return false; break;
      case "prio": if (!isPrio(o)) return false; break;
      case "recent": { const d = o.published_at || String(o.created_at).slice(0, 10); if (!(d && days(d, t) <= 14)) return false; break; }
      case "fav": if (!o.favorite) return false; break;
      case "side": if (o.status !== "À étudier") return false; break;
      case "sel": if (!["Offre sélectionnée", "Candidature à préparer"].includes(o.status)) return false; break;
      case "out": if (o.status !== "Abandonnée") return false; break;
      default: if (o.status === "Abandonnée") return false;
    }
    if (S.zone && zoneOf(o) !== S.zone) return false;
    if (S.place && !norm(o.city).includes(norm(S.place))) return false;
    if (S.sector && o.sector !== S.sector) return false;
    if (S.status && o.status !== S.status) return false;
    return true;
  });
  const s = S.sort;
  l.sort((a, b) => s === "score" ? (b.score || 0) - (a.score || 0) : s === "pub" ? String(b.published_at || "").localeCompare(a.published_at || "") : s === "comp" ? a.company_name.localeCompare(b.company_name) : String(b.created_at).localeCompare(a.created_at));
  return l;
}
function vOffers() {
  const hidden = route() === "marche-cache";
  if (hidden && S.kind === "publiee") S.kind = "cachee";
  const counts = k => D.offers.filter(o => o.kind === k).length;
  const list = filterOffers(D.offers.filter(o => o.kind === S.kind));
  const groupKey = {secteur: o => o.sector || "Secteur non renseigné", entreprise: o => o.company_name, lieu: o => [o.country || "France", o.city].filter(Boolean).join(" · ")}[S.group];
  let body;
  const card = o => `<div class="ocard" data-a="open-offer" data-id="${esc(o.id)}"><div style="display:flex;gap:8px;justify-content:space-between"><b>${esc(o.company_name)}</b>${scB(o)}</div><div class="t">${esc(o.title)}${isNew(o) ? ` <span class="tag new">Nouvelle</span>` : ""}</div>
   <div class="small muted">${esc([o.city, o.country].filter(Boolean).join(", "))}${o.start_label ? " · " + esc(o.start_label) : ""}${o.duration ? " · " + esc(o.duration) : ""}</div><div>${stB(o.status)} ${lkB(o)} ${kB(o)}</div>
   ${o.kind !== "publiee" && o.approach ? `<div class="small"><b>Démarche :</b> ${esc(o.approach)}</div>` : ""}
   <div class="acts"><button class="fav ${o.favorite ? "on" : ""}" data-a="fav" data-id="${esc(o.id)}" aria-label="Favori">★</button><button class="btn sm" data-a="qs" data-id="${esc(o.id)}" data-s="À étudier">Mettre de côté</button><button class="btn sm" data-a="qs" data-id="${esc(o.id)}" data-s="Offre sélectionnée">Candidater</button><button class="btn sm" data-a="qs" data-id="${esc(o.id)}" data-s="Abandonnée">Écarter</button></div></div>`;
  const table = l => `<table class="stack"><thead><tr><th></th><th>Entreprise · poste</th><th>Lieu</th><th>Début</th><th>Note</th><th>Statut</th><th>Annonce</th><th>Comparer</th></tr></thead><tbody>${l.map(o => `<tr class="row" data-a="open-offer" data-id="${esc(o.id)}">
   <td><button class="fav ${o.favorite ? "on" : ""}" data-a="fav" data-id="${esc(o.id)}" aria-label="Favori">★</button></td>
   <td data-l="Offre"><b>${esc(o.company_name)}</b>${isNew(o) ? ` <span class="tag new">Nouvelle</span>` : ""}<br>${esc(o.title)}<br><span class="small muted">${esc(o.sector || "")}</span> ${kB(o)}</td>
   <td data-l="Lieu">${esc([o.city, o.country].filter(Boolean).join(", "))}</td><td data-l="Début">${esc(o.start_label || "")}</td><td data-l="Note">${scB(o)}</td><td data-l="Statut">${stB(o.status)}</td><td data-l="Annonce">${lkB(o)}</td>
   <td data-l="Comparer"><input type="checkbox" data-c="cmp" data-id="${esc(o.id)}" ${S.compare.has(o.id) ? "checked" : ""} aria-label="Comparer"></td></tr>`).join("")}</tbody></table>`;
  const render1 = l => S.mode === "cartes" ? `<div class="cards">${l.map(card).join("")}</div>` : table(l);
  if (!list.length) body = `<div class="card empty">${S.kind === "publiee" ? "Aucune offre ne correspond à ces filtres." : "Aucune piste enregistrée dans cette catégorie. La veille en ajoutera, ou ajoute-en une toi-même."}</div>`;
  else if (groupKey) { const g = new Map(); list.forEach(o => { const k = groupKey(o); if (!g.has(k)) g.set(k, []); g.get(k).push(o); });
    body = [...g].sort((a, b) => b[1].length - a[1].length).map(([k, l]) => `<div class="grp">${esc(k)} <span class="small muted">${l.length}</span></div>${render1(l)}`).join(""); }
  else body = render1(list);
  return `<div class="head"><div><h1>${hidden ? "Marché caché" : "Toutes les offres"}</h1><p>${hidden ? "Les opportunités sans annonce publique : besoins de recrutement repérés et entreprises à approcher en candidature spontanée. Une piste n'est jamais une offre réelle." : "Toutes les annonces de stage découvertes par la veille ou ajoutées par toi."}</p></div>
  <button class="btn pri" data-a="new-offer" data-kind="${esc(S.kind)}">Ajouter ${S.kind === "publiee" ? "une offre" : S.kind === "cachee" ? "une opportunité" : "une entreprise à prospecter"}</button></div>
  <div class="chips">${Object.keys(C.KINDS).map(k => `<button class="chip ${S.kind === k ? "on" : ""}" data-a="kind" data-k="${k}">${esc(C.KINDS[k])} (${counts(k)})</button>`).join("")}</div>
  <div class="tools"><input type="search" id="oq" data-c="f" data-k="q" placeholder="Rechercher : entreprise, poste, ville, compétence…" value="${esc(S.q)}">
   <select data-c="f" data-k="sector" aria-label="Secteur"><option value="">Tous secteurs</option>${opt(C.SECTORS, S.sector)}</select>
   <select data-c="f" data-k="zone" aria-label="Zone"><option value="">Toutes zones</option>${opt(["fr", "eu", "world"], S.zone, {fr: "France", eu: "Europe hors France", world: "Hors Europe"})}</select>
   <select data-c="f" data-k="place" aria-label="Ville"><option value="">Toutes villes</option>${opt(C.PLACES, S.place)}</select>
   <select data-c="f" data-k="status" aria-label="Statut"><option value="">Tous statuts</option>${opt(C.STATUSES, S.status)}</select>
   <select data-c="f" data-k="sort" aria-label="Tri">${opt(["recent", "score", "pub", "comp"], S.sort, {recent: "Plus récentes", score: "Meilleure note", pub: "Date de publication", comp: "Entreprise A→Z"})}</select></div>
  <div class="tools"><div class="chips" style="margin:0">${CHIPS.map(([k, l]) => `<button class="chip ${S.chip === k ? "on" : ""}" data-a="chip" data-k="${k}">${l}</button>`).join("")}</div>
   <span style="flex:1"></span><div class="seg">${["liste", "cartes"].map(m => `<button class="${S.mode === m ? "on" : ""}" data-a="mode" data-k="${m}">${m === "liste" ? "Liste" : "Cartes"}</button>`).join("")}</div>
   <select data-c="f" data-k="group" aria-label="Regrouper"><option value="">Sans regroupement</option>${opt(["secteur", "entreprise", "lieu"], S.group, {secteur: "Par secteur", entreprise: "Par entreprise", lieu: "Par pays et ville"})}</select></div>
  ${S.compare.size ? `<div class="banner">${S.compare.size} offre(s) sélectionnée(s) pour comparaison. <button class="btn sm" data-a="go" data-id="analyse">Comparer</button> <button class="btn sm ghost" data-a="cmp-clear">Vider</button></div>` : ""}
  <p class="small muted">${list.length} résultat(s)</p>${body}`;
}

/* ===================== 3. Candidatures et Kanban ===================== */
function vApps() {
  const t = today(), f = S.appFilter;
  let l = D.offers.filter(isApplied);
  const need = o => (WAITING.has(o.status) && o.follow_up_at && o.follow_up_at <= t) || (o.interview_at && o.interview_at >= t && days(t, o.interview_at) <= 7) || (o.status === "Candidature envoyée" && o.applied_at && days(o.applied_at, t) > 14);
  if (f === "att") l = l.filter(o => WAITING.has(o.status)); if (f === "rel") l = l.filter(o => WAITING.has(o.status) && o.follow_up_at && o.follow_up_at <= t);
  if (f === "resp") l = l.filter(o => o.response_at || RESPONDED.has(o.status)); if (f === "ref") l = l.filter(o => o.status === "Refus"); if (f === "acc") l = l.filter(o => o.status === "Acceptée"); if (f === "act") l = l.filter(need);
  l.sort((a, b) => (need(b) - need(a)) || String(b.applied_at || "").localeCompare(a.applied_at || ""));
  const ch = [["", "Toutes"], ["act", "À traiter"], ["att", "En attente"], ["rel", "Relances à faire"], ["resp", "Réponses reçues"], ["ref", "Refus"], ["acc", "Stages obtenus"]];
  return `<div class="head"><div><h1>Mes candidatures</h1><p>Toutes les candidatures envoyées, y compris les refus et les candidatures spontanées. Rien n'en disparaît sans ta décision.</p></div><a class="btn" href="#kanban">Vue Kanban</a></div>
  <div class="chips">${ch.map(([k, x]) => `<button class="chip ${f === k ? "on" : ""}" data-a="appf" data-k="${k}">${x}</button>`).join("")}</div>
  ${l.length ? `<table class="stack"><thead><tr><th>Entreprise · poste</th><th>Envoyée le</th><th>Statut</th><th>Relance</th><th>Entretien</th><th>Réponse</th><th>Documents</th></tr></thead><tbody>${l.map(o => `<tr class="row" data-a="open-offer" data-id="${esc(o.id)}">
   <td data-l="Offre"><b>${esc(o.company_name)}</b> ${need(o) ? `<span class="tag bad">Action requise</span>` : ""}<br>${esc(o.title)} ${kB(o)}</td><td data-l="Envoyée le">${esc(fd(o.applied_at))}</td><td data-l="Statut">${stB(o.status)}</td>
   <td data-l="Relance">${esc(fd(o.follow_up_at))}</td><td data-l="Entretien">${esc(fd(o.interview_at))}</td><td data-l="Réponse">${esc(fd(o.response_at))}${o.result ? `<br><span class="small muted">${esc(o.result)}</span>` : ""}</td><td data-l="Documents">${docsOfOffer(o).map(d => esc(d.name)).join(", ")}</td></tr>`).join("")}</tbody></table>`
  : `<div class="card empty">Aucune candidature dans cette vue. Quand tu postules, passe l'offre au statut « Candidature envoyée » : la date et une relance à 10 jours sont enregistrées automatiquement.</div>`}`;
}
function vKanban() {
  return `<div class="head"><div><h1>Kanban</h1><p>Fais glisser une carte pour changer d'étape. Sur téléphone, utilise le menu de la carte. Les offres écartées et les nouvelles offres de la veille restent dans « Toutes les offres ».</p></div></div>
  <div class="kan">${C.STATUSES.filter(s => !["Nouvelle offre", "Abandonnée"].includes(s)).map(s => { const l = D.offers.filter(o => o.status === s).sort((a, b) => (b.score || 0) - (a.score || 0));
   return `<div class="col" data-col="${esc(s)}"><h3>${stB(s)}<span>${l.length}</span></h3>${l.map(o => `<div class="kc" draggable="true" data-card="${esc(o.id)}" data-a="open-offer" data-id="${esc(o.id)}"><b>${esc(o.company_name)}</b>${esc(o.title)}<br><span class="small muted">${esc(o.city || "")}${o.follow_up_at && WAITING.has(o.status) ? " · relance " + esc(fd(o.follow_up_at)) : ""}</span>
   <select data-c="status" data-id="${esc(o.id)}" aria-label="Changer d'étape">${opt(C.STATUSES, s)}</select></div>`).join("")}</div>`; }).join("")}</div>`;
}

/* ===================== 4. Réseau ===================== */
function vNetwork() {
  const qq = norm(S.netQ);
  let l = D.contacts.filter(k => !k.is_suggestion);
  if (S.netCat) l = l.filter(k => k.category === S.netCat); if (S.netRel) l = l.filter(k => k.relation === S.netRel);
  if (qq) l = l.filter(k => norm([contactName(k), k.company_name, k.role, k.city, k.notes].join(" ")).includes(qq));
  l.sort((a, b) => String(a.next_action_at || "9").localeCompare(b.next_action_at || "9"));
  const all = D.contacts.filter(k => !k.is_suggestion), t = today();
  const kp = [["Contactés", all.filter(k => k.relation !== "À contacter").length], ["M'ont répondu", all.filter(k => ["A répondu", "Échange réalisé", "Aide proposée", "A recommandé une entreprise", "Peut me mettre en relation", "Relation à entretenir"].includes(k.relation)).length],
   ["Échanges réalisés", all.filter(k => ["Échange réalisé", "Aide proposée", "A recommandé une entreprise", "Peut me mettre en relation", "Relation à entretenir"].includes(k.relation)).length], ["M'ont proposé de l'aide", all.filter(k => k.helped).length],
   ["Peuvent me mettre en relation", all.filter(k => k.can_introduce).length], ["À recontacter", all.filter(k => k.next_action_at && k.next_action_at <= t).length]];
  return `<div class="head"><div><h1>Mon réseau</h1><p>Tes contacts dans la finance et l'état de chaque relation : qui tu as contacté, qui a répondu, qui peut t'aider, et quand reprendre contact.</p></div><button class="btn pri" data-a="new-contact">Ajouter un contact</button></div>
  <div class="kpis">${kp.map(([a, b]) => `<div class="kpi"><span>${esc(a)}</span><b>${b}</b></div>`).join("")}</div>
  <div class="tools"><input type="search" id="nq" data-c="net" data-k="netQ" placeholder="Rechercher un contact, une entreprise, une fonction…" value="${esc(S.netQ)}">
   <select data-c="net" data-k="netCat" aria-label="Catégorie"><option value="">Toutes catégories</option>${opt(C.CONTACT_CATEGORIES, S.netCat)}</select>
   <select data-c="net" data-k="netRel" aria-label="Relation"><option value="">Tous les suivis</option>${opt(C.RELATIONS, S.netRel)}</select></div>
  ${l.length ? `<table class="stack"><thead><tr><th>Contact</th><th>Entreprise · fonction</th><th>Catégorie</th><th>Suivi</th><th>Prochaine action</th></tr></thead><tbody>${l.map(k => `<tr class="row" data-a="open-contact" data-id="${esc(k.id)}">
   <td data-l="Contact"><b>${esc(contactName(k))}</b>${k.linkedin_url ? ` · ${L(k.linkedin_url, "LinkedIn")}` : ""}</td><td data-l="Entreprise">${esc(k.company_name || "")}<br><span class="small muted">${esc(k.role || "")}</span></td><td data-l="Catégorie">${esc(k.category || "")}</td>
   <td data-l="Suivi"><span class="tag">${esc(k.relation)}</span>${k.helped ? ` <span class="tag ok">Aide</span>` : ""}${k.can_introduce ? ` <span class="tag mid">Mise en relation</span>` : ""}</td>
   <td data-l="Action">${esc(k.next_action || "")}${k.next_action_at ? `<br><span class="small ${k.next_action_at <= t ? "" : "muted"}" style="${k.next_action_at <= t ? "color:var(--coral)" : ""}">${esc(fd(k.next_action_at))}</span>` : ""}</td></tr>`).join("")}</tbody></table>`
  : `<div class="card empty">Aucun contact pour l'instant. Commence par tes anciens collègues (BNP Paribas, ClubFunding, DABR Audit & Conseil) et les anciens élèves de l'IGR-IAE, ou passe par « Prospection » pour repérer qui contacter.</div>`}`;
}

/* ===================== 5. Prospection et messages ===================== */
function vProspect() {
  const pri = D.companies.filter(c => c.is_target || offersOfCompany(c).some(o => !CLOSED.has(o.status) && (o.kind !== "publiee" || ["À étudier", "Offre sélectionnée", "Candidature à préparer"].includes(o.status) || (o.score || 0) >= 75)));
  const sugg = D.contacts.filter(k => k.is_suggestion);
  return `<div class="head"><div><h1>Prospection et messages</h1><p>Pour chaque entreprise cible, les profils à identifier et pourquoi. Les liens ouvrent une recherche LinkedIn : c'est toi qui choisis la personne. Aucun message n'est envoyé automatiquement.</p></div><button class="btn pri" data-a="compose">Préparer un message</button></div>
  <div class="grid g2"><div class="card"><h2>Entreprises à approcher (${pri.length})</h2><p class="small muted">Tes entreprises cibles, et celles où une offre ou une piste te correspond. Marque une entreprise comme cible depuis sa fiche.</p>
   ${pri.length ? pri.slice(0, 30).map(c => { const nk = contactsOfCompany(c).length; return `<div class="action"><span class="ic"></span><div><b>${esc(c.name)}</b> <span class="small muted">${esc(c.sector || "")}</span><small>${nk} contact(s) enregistré(s)${c.signal ? " · " + esc(c.signal) : ""}</small>
    <div class="small" style="margin-top:6px">${C.PROSPECT_ROLES.map((p, i) => `<span style="display:inline-flex;gap:4px;margin:2px 8px 2px 0"><a href="https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(c.name + " " + p.q)}" target="_blank" rel="noopener" title="${esc(p.why)}">${esc(p.role)}</a><button class="btn sm ghost" data-a="add-sugg" data-id="${esc(c.id)}" data-i="${i}" title="Ajouter comme piste à identifier">+</button></span>`).join("")}</div></div>
    <button class="btn sm" data-a="open-company" data-id="${esc(c.id)}">Fiche</button></div>`; }).join("") : `<p class="muted">Aucune entreprise cible. Ouvre « Entreprises » et marque celles qui t'intéressent le plus.</p>`}</div>
  <div class="card"><h2>Pistes à identifier (${sugg.length})</h2><p class="small muted">Profils que tu veux trouver. Quand tu as identifié la personne, complète la fiche : elle rejoint ton réseau.</p>
   ${sugg.length ? sugg.map(k => `<div class="action"><span class="ic"></span><div><b>${esc(k.role || "Interlocuteur")}</b> · ${esc(k.company_name || "")}<small>${esc(k.notes || "")}</small></div><button class="btn sm" data-a="open-contact" data-id="${esc(k.id)}">Compléter</button></div>`).join("") : `<p class="muted">Aucune piste. Utilise le bouton « + » à côté d'un profil.</p>`}
   <h2 style="margin-top:20px">Mes modèles de messages</h2>${D.templates.map(t => `<div class="doc"><span class="nm">${esc(t.name)} <span class="tag">${esc(t.channel || "")}</span></span><button class="btn sm" data-a="compose" data-tpl="${esc(t.id)}">Utiliser</button><button class="btn sm ghost" data-a="edit-template" data-id="${esc(t.id)}">Modifier</button></div>`).join("")}
   <div class="acts" style="justify-content:flex-start"><button class="btn sm" data-a="new-template">Nouveau modèle</button></div></div></div>`;
}
function fillTemplate(body, k, o) {
  const c = k && k.company_name || o && o.company_name || "", me = D.config.display_name || "";
  const map = {prenom: k && k.first_name, nom: k && k.last_name, entreprise: c, fonction: (k && k.role) || (o && o.title), poste: o && o.title, secteur: (o && o.sector) || (k && k.sector), ecole: D.config.school || "IGR-IAE Rennes", mon_prenom: me};
  return String(body || "").replace(/\{(\w+)\}/g, (m, key) => map[key] ? map[key] : `[${key}]`);
}
function compose(d) {
  const tid = d.tpl || (D.templates[0] && D.templates[0].id);
  formDialog("Préparer un message", [["template_id", "Modèle", "select", D.templates.map(t => t.id), D.templates.reduce((a, t) => (a[t.id] = t.name, a), {})],
    ["contact_id", "Destinataire", "select", ["", ...D.contacts.map(k => k.id)], D.contacts.reduce((a, k) => (a[k.id] = contactName(k) + (k.company_name ? " – " + k.company_name : ""), a), {"": "—"})],
    ["offer_id", "Offre ou candidature liée", "select", ["", ...D.offers.map(o => o.id)], D.offers.reduce((a, o) => (a[o.id] = o.company_name + " – " + o.title, a), {"": "—"})],
    ["subject", "Objet (email)", "text"], ["body", "Message (modifie-le librement)", "area"]],
    {template_id: tid, contact_id: d.contact || "", offer_id: d.offer || ""},
    null, [["Copier le message", "", () => { const v = readForm(); copy((v.subject ? "Objet : " + v.subject + "\n\n" : "") + v.body); return false; }],
      ["Marquer comme envoyé", "pri", async () => { const v = readForm(); if (!v.contact_id) { toast("Choisis un destinataire pour garder la trace de l'envoi"); return false; }
        const k = byId("contacts", v.contact_id); await ins("events", {contact_id: k.id, offer_id: v.offer_id || null, date: today(), type: "Message envoyé", text: (v.subject ? v.subject + " — " : "") + v.body.slice(0, 400)});
        await upd("contacts", k.id, {relation: k.relation === "À contacter" ? "Contacté" : k.relation, contacted_at: k.contacted_at || today(), next_action: "Relancer si pas de réponse", next_action_at: addDays(today(), 7)}); toast("Envoi enregistré, relance prévue dans 7 jours"); }]],
    () => { const f = $("#dlgf"), sel = k => f.querySelector(`[name=${k}]`);
      const refresh = () => { const t = byId("templates", sel("template_id").value), k = byId("contacts", sel("contact_id").value), o = byId("offers", sel("offer_id").value);
        if (t) { sel("subject").value = fillTemplate(t.subject, k, o); sel("body").value = fillTemplate(t.body, k, o); }
        const info = f.querySelector(".hint.c"); if (info) info.innerHTML = k ? `${k.linkedin_url ? L(k.linkedin_url, "Ouvrir son profil LinkedIn") : ""} ${k.email ? " · E-mail : " + esc(k.email) : ""}` : ""; };
      ["template_id", "contact_id", "offer_id"].forEach(n => sel(n).addEventListener("change", refresh));
      sel("body").insertAdjacentHTML("afterend", `<span class="hint">Les éléments entre crochets [ ] sont à compléter. Relis toujours le message avant de l'envoyer toi-même.</span><span class="hint c"></span>`); refresh(); });
}
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Copié dans le presse-papiers"); } catch (e) { toast("Copie refusée par le navigateur : sélectionne le texte et copie-le."); } }

/* ===================== 6. Entreprises ===================== */
function vCompanies() {
  const qq = norm(S.compQ);
  let l = D.companies.filter(c => (!qq || norm([c.name, c.sector, c.locations, c.jobs].join(" ")).includes(qq)) && (!S.compSector || c.sector === S.compSector) && (!S.compTarget || c.is_target));
  const stat = c => { const o = offersOfCompany(c); return {o: o.length, a: o.filter(isApplied).length, k: contactsOfCompany(c).filter(k => !k.is_suggestion).length, r90: o.filter(x => days(String(x.created_at).slice(0, 10), today()) <= 90).length}; };
  l = l.map(c => ({c, s: stat(c)})).sort((a, b) => (b.c.is_target - a.c.is_target) || (b.s.o - a.s.o) || String(a.c.tier || "9").localeCompare(String(b.c.tier || "9")) || a.c.name.localeCompare(b.c.name));
  return `<div class="head"><div><h1>Entreprises</h1><p>Ta base des employeurs : métiers, offres découvertes, candidatures, contacts et historique de tes démarches.</p></div><button class="btn pri" data-a="new-company">Ajouter une entreprise</button></div>
  <div class="tools"><input type="search" id="cq" data-c="comp" data-k="compQ" placeholder="Rechercher une entreprise, un métier, une ville…" value="${esc(S.compQ)}">
   <select data-c="comp" data-k="compSector" aria-label="Secteur"><option value="">Tous secteurs</option>${opt(C.SECTORS, S.compSector)}</select>
   <label class="small"><input type="checkbox" data-c="compT" ${S.compTarget ? "checked" : ""}> Mes cibles uniquement</label></div>
  <table class="stack"><thead><tr><th>Entreprise</th><th>Secteur</th><th>Offres</th><th>Candidatures</th><th>Contacts</th><th>Cible</th></tr></thead><tbody>${l.map(({c, s}) => `<tr class="row" data-a="open-company" data-id="${esc(c.id)}">
   <td data-l="Entreprise"><b>${esc(c.name)}</b><br><span class="small muted">${esc(c.tier || "")}${c.locations ? " · " + esc(c.locations) : ""}</span></td><td data-l="Secteur">${esc(c.sector || "")}</td>
   <td data-l="Offres">${s.o || ""}${s.r90 ? ` <span class="small muted">(${s.r90} en 90 j)</span>` : ""}</td><td data-l="Candidatures">${s.a || ""}</td><td data-l="Contacts">${s.k || ""}</td>
   <td data-l="Cible"><button class="fav ${c.is_target ? "on" : ""}" data-a="target" data-id="${esc(c.id)}" aria-label="Entreprise cible">★</button></td></tr>`).join("")}</tbody></table>`;
}

/* ===================== 7. Préparation aux entretiens ===================== */
const PREP_FIELDS = [["presentation", "Présentation de l'entreprise"], ["business_model", "Activité et modèle économique"], ["financials", "Informations financières importantes"], ["news", "Actualités récentes"], ["metier", "Présentation du métier"], ["missions", "Missions du stage"], ["skills", "Compétences techniques à maîtriser"], ["questions", "Questions susceptibles d'être posées"], ["ask", "Mes questions au recruteur"], ["notes", "Notes personnelles"]];
function vPrep() {
  const cands = D.offers.filter(o => o.interview_at || INTERVIEW.has(o.status) || ["Candidature envoyée", "En attente", "Offre sélectionnée", "Candidature à préparer"].includes(o.status)).sort((a, b) => String(a.interview_at || "9").localeCompare(b.interview_at || "9"));
  const o = byId("offers", S.prepId) || cands[0]; const p = (o && o.prep) || {};
  const qs = C.QUESTIONS[S.qCat] || [], qi = qs.length ? S.qIdx % qs.length : 0;
  const bankFor = o2 => { const s = norm(o2 && o2.sector); return s.includes("audit") ? "Audit" : s.includes("ts") ? "Transaction Services" : s.includes("private") ? "Private Equity" : s.includes("m&a") ? "M&A et Corporate Finance" : s.includes("asset") ? "Asset Management" : s.includes("marche") ? "Finance de marché" : s.includes("risque") ? "Crédit et risques" : "Analyse financière"; };
  const def = {missions: o && o.missions, skills: o && o.skills, questions: o ? [...C.QUESTIONS["Général"].slice(0, 3), ...C.QUESTIONS[bankFor(o)]].map(x => "• " + x).join("\n") : "", ask: C.ASK_RECRUITER.map(x => "• " + x).join("\n")};
  return `<div class="head"><div><h1>Préparation aux entretiens</h1><p>Une fiche de préparation par candidature, une banque de questions par métier et un espace pour t'entraîner à présenter ton parcours.</p></div></div>
  <div class="grid g2"><div class="card"><h2>Fiche de préparation</h2>
   ${cands.length ? `<label class="small muted">Candidature <select data-c="prep" style="width:100%">${cands.map(x => `<option value="${esc(x.id)}" ${o && x.id === o.id ? "selected" : ""}>${esc(x.company_name + " – " + x.title + (x.interview_at ? " (entretien le " + fd(x.interview_at) + ")" : ""))}</option>`).join("")}</select></label>
   <p class="small muted">Les champs vides sont pré-remplis avec l'annonce et la banque de questions. Les informations sur l'entreprise sont à vérifier et compléter toi-même (rapport annuel, site, presse) : rien n'y est inventé.</p>
   <div class="fg" id="prepForm">${PREP_FIELDS.map(([k, l]) => `<label class="full">${esc(l)}<textarea name="${k}" rows="${["questions", "ask"].includes(k) ? 7 : 3}">${esc(p[k] ?? def[k] ?? "")}</textarea></label>`).join("")}</div>
   <div class="acts"><button class="btn" data-a="open-offer" data-id="${esc(o.id)}">Ouvrir la candidature</button><button class="btn pri" data-a="save-prep" data-id="${esc(o.id)}">Enregistrer la fiche</button></div>`
   : `<p class="muted">Aucune candidature en cours. Une fiche se crée dès qu'une offre est sélectionnée ou envoyée.</p>`}</div>
  <div><div class="card"><h2>Entraînement aux questions</h2><div class="chips">${Object.keys(C.QUESTIONS).map(c => `<button class="chip ${S.qCat === c ? "on" : ""}" data-a="qcat" data-k="${esc(c)}">${esc(c)}</button>`).join("")}</div>
   <div class="qbox">${esc(qs[qi] || "")}</div><div class="acts" style="justify-content:space-between"><span class="small muted">Question ${qi + 1} sur ${qs.length}</span><span><button class="btn" data-a="qrand">Question au hasard</button> <button class="btn pri" data-a="qnext">Question suivante</button></span></div></div>
   <div class="card" style="margin-top:14px"><h2>Présenter mon parcours</h2><p class="small muted">Écris ta présentation (2 minutes à l'oral, environ 250 mots), puis entraîne-toi avec le chronomètre.</p>
   <label class="small muted">Ma présentation<textarea id="pitch" rows="7">${esc(D.config.pitch || "")}</textarea></label><p class="small muted" id="pitchCount"></p>
   <label class="small muted">Mes motivations pour la finance<textarea id="motiv" rows="4">${esc(D.config.motivations || "")}</textarea></label>
   <div class="acts" style="justify-content:space-between;align-items:center"><span class="timer" id="timer">${S.timer ? "" : "2:00"}</span><span><button class="btn" data-a="timer">${S.timer ? "Arrêter" : "Lancer 2 minutes"}</button> <button class="btn pri" data-a="save-pitch">Enregistrer</button></span></div></div></div></div>`;
}

/* ===================== 8. Documents ===================== */
function vDocs() {
  const qq = norm(S.docQ), l = D.documents.filter(d => !qq || norm([d.name, d.kind, d.version_label, d.notes].join(" ")).includes(qq));
  return `<div class="head"><div><h1>Documents</h1><p>CV, lettres, modèles, documents universitaires et justificatifs. Indique une version pour chaque CV ou lettre : tu sauras toujours ce que tu as envoyé à qui.</p></div>
  <div class="tools" style="margin:0"><button class="btn" data-a="new-textdoc">Nouveau document texte</button><button class="btn pri" data-a="upload">Importer des fichiers</button><input type="file" id="upIn" multiple hidden></div></div>
  <div class="tools"><input type="search" id="dq" data-c="docq" placeholder="Rechercher un document…" value="${esc(S.docQ)}"></div>
  ${C.DOC_KINDS.map(k => { const g = l.filter(d => d.kind === k); return g.length ? `<div class="card" style="margin-bottom:12px"><h2>${esc(k)}</h2>${g.map(d => { const u = offersOfDoc(d);
   return `<div class="doc"><span class="nm">${esc(d.name)}${d.version_label ? ` <span class="tag">${esc(d.version_label)}</span>` : ""}<br><span class="small muted">${d.size ? Math.round(d.size / 1024) + " Ko · " : ""}ajouté le ${esc(fd(String(d.created_at).slice(0, 10)))}</span></span>
   <span class="small">${u.length ? "Envoyé pour : " + u.map(o => `<a href="#" data-a="open-offer" data-id="${esc(o.id)}">${esc(o.company_name)}</a>`).join(", ") : "Pas encore utilisé"}</span>
   ${d.storage_path ? `<button class="btn sm" data-a="open-doc" data-id="${esc(d.id)}">Ouvrir</button>` : `<button class="btn sm" data-a="copy-doc" data-id="${esc(d.id)}">Copier</button>`}<button class="btn sm ghost" data-a="edit-doc" data-id="${esc(d.id)}">Modifier</button></div>`; }).join("")}</div>` : ""; }).join("") || `<div class="card empty">Aucun document. Commence par importer ton CV principal (PDF ou Word, 50 Mo maximum).</div>`}`;
}
async function uploadFiles(files, kind, version, offerId) {
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) { toast(f.name + " dépasse 50 Mo"); continue; }
    const path = `${user.id}/${uid()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    toast("Import de " + f.name + "…");
    const {error} = await sb.storage.from("documents").upload(path, f, {contentType: f.type || "application/octet-stream", upsert: false});
    if (error) { fail(error); continue; }
    const d = await ins("documents", {name: f.name, kind, version_label: version || null, storage_path: path, size: f.size, content_type: f.type});
    if (d && offerId) await ins("document_links", {document_id: d.id, offer_id: offerId, role: "joint"});
    if (d) toast(f.name + " importé");
  }
}
async function openDoc(d) {
  const {data, error} = await sb.storage.from("documents").createSignedUrl(d.storage_path, 120);
  if (error) return fail(error);
  const a = document.createElement("a"); a.href = data.signedUrl; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
}

/* ===================== 9. Calendrier ===================== */
function calItems() {
  const it = [];
  for (const o of D.offers) { const n = o.company_name;
    if (o.applied_at) it.push({d: o.applied_at, k: "Envoi", t: "Envoyée – " + n, a: "open-offer", id: o.id});
    if (o.follow_up_at && WAITING.has(o.status)) it.push({d: o.follow_up_at, k: "Relance", t: "Relance – " + n, a: "open-offer", id: o.id});
    if (o.interview_at) it.push({d: o.interview_at, k: "Entretien", t: "Entretien – " + n, a: "open-offer", id: o.id});
    if (o.test_at) it.push({d: o.test_at, k: "Test", t: "Test – " + n, a: "open-offer", id: o.id});
    if (o.deadline && !isApplied(o)) it.push({d: o.deadline, k: "Échéance", t: "Échéance – " + n, a: "open-offer", id: o.id}); }
  for (const k of D.contacts) if (k.next_action_at) it.push({d: k.next_action_at, k: "Relance", t: (k.next_action || "Recontacter") + " – " + contactName(k), a: "open-contact", id: k.id});
  for (const e of D.events) if (["Entretien", "Appel", "Échange"].includes(e.type)) it.push({d: e.date, k: e.type === "Entretien" ? "Entretien" : "Envoi", t: e.type + (e.text ? " – " + e.text.slice(0, 40) : ""), a: e.offer_id ? "open-offer" : e.contact_id ? "open-contact" : "", id: e.offer_id || e.contact_id});
  for (const x of D.tasks) it.push({d: x.date, k: x.kind === "Échéance" ? "Échéance" : "Tâche", t: (x.done ? "✓ " : "") + (x.time ? x.time + " " : "") + x.text, a: "edit-task", id: x.id});
  return it;
}
function vCal() {
  if (!S.calM) { const n = new Date(); S.calM = new Date(n.getFullYear(), n.getMonth(), 1); }
  const y = S.calM.getFullYear(), m = S.calM.getMonth(), first = new Date(y, m, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const it = calItems(), t = today(); let cells = "";
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const k = iso(d);
    cells += `<div class="d ${d.getMonth() !== m ? "o" : ""} ${k === t ? "t" : ""}"><b>${d.getDate()}</b>${it.filter(x => x.d === k).map(x => `<button class="ev e-${esc(x.k)}" ${x.a ? `data-a="${x.a}" data-id="${esc(x.id)}"` : ""} title="${esc(x.t)}">${esc(x.t)}</button>`).join("")}</div>`; }
  const up = it.filter(x => x.d >= t && days(t, x.d) <= 30 && !x.t.startsWith("✓")).sort((a, b) => a.d.localeCompare(b.d));
  const late = D.tasks.filter(x => !x.done && x.date < t);
  return `<div class="head"><div><h1>Calendrier</h1><p>Entretiens, relances, échéances, appels, échanges, événements de networking et tâches personnelles.</p></div>
  <div class="tools" style="margin:0"><button class="btn" data-a="cal" data-k="-1" aria-label="Mois précédent">‹</button><b style="min-width:9em;text-align:center">${S.calM.toLocaleDateString("fr-FR", {month: "long", year: "numeric"})}</b><button class="btn" data-a="cal" data-k="1" aria-label="Mois suivant">›</button><button class="btn pri" data-a="new-task">Nouveau rappel</button></div></div>
  ${late.length ? `<div class="banner">${late.length} rappel(s) en retard : ${late.map(x => esc(x.text)).join(", ")}</div>` : ""}
  <div class="cal">${["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map(x => `<div class="wd">${x}</div>`).join("")}${cells}</div>
  <div class="card" style="margin-top:14px"><h2>Dans les 30 prochains jours</h2>${up.length ? up.map(x => `<div class="action"><span class="ic"></span><div><b>${esc(fd(x.d))}</b> · ${esc(x.t)}</div>${x.a ? `<button class="btn sm" data-a="${x.a}" data-id="${esc(x.id)}">Ouvrir</button>` : ""}</div>`).join("") : `<p class="muted">Rien de prévu.</p>`}</div>`;
}

/* ===================== Analyse et comparaison ===================== */
function vAnalyse() {
  const open = D.offers.filter(o => !CLOSED.has(o.status)), t = today();
  const cmp = [...S.compare].map(id => byId("offers", id)).filter(Boolean);
  const text = o => norm([o.skills, o.missions, o.description, o.education, o.languages].join(" "));
  const sk = C.SKILLS.map(s => [s, D.offers.filter(o => text(o).includes(norm(s))).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const rec = countBy(D.offers.filter(o => days(String(o.created_at).slice(0, 10), t) <= 90), o => o.company_name).slice(0, 10);
  const best = open.filter(o => o.kind === "publiee" && o.link_state !== "bad").sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
  const startOk = o => { const s = norm(o.start_label); if (!s) return "À vérifier"; if (/2028/.test(s)) return "Oui"; if (/2027/.test(s)) return /janv|fevr|mars/.test(s) && !/avril|mai|juin|juil|sept|oct|nov|dec|aout/.test(s) ? "Avant avril" : "Oui"; return "À vérifier"; };
  const rows = [["Entreprise", o => esc(o.company_name)], ["Poste", o => esc(o.title)], ["Note", o => scB(o)], ["Priorité", o => esc(o.priority || "")], ["Lieu", o => esc([o.city, o.country].filter(Boolean).join(", "))],
    ["Début", o => esc(o.start_label || "")], ["Début compatible (avril 2027 ou après)", o => esc(startOk(o))], ["Durée", o => esc(o.duration || "")], ["Secteur", o => esc(o.sector || "")], ["Missions", o => esc(o.missions || "")],
    ["Compétences", o => esc(o.skills || "")], ["Gratification", o => esc(o.pay || "Non communiquée")], ["Annonce", o => lkB(o) + " " + L(o.offer_url, "ouvrir")], ["Statut", o => stB(o.status)], ["Analyse", o => esc(o.analysis || "")]];
  return `<div class="head"><div><h1>Analyse et comparaison</h1><p>Ce que disent tes données : offres les mieux notées, compétences demandées, entreprises qui recrutent, secteurs porteurs. Chaque chiffre vient des offres enregistrées.</p></div></div>
  <div class="card cmp"><h2>Comparer des offres</h2>${cmp.length ? `<table><tbody>${rows.map(([l, f]) => `<tr><th style="width:12em">${esc(l)}</th>${cmp.map(o => `<td>${f(o)}</td>`).join("")}</tr>`).join("")}</tbody></table><div class="acts"><button class="btn" data-a="cmp-clear">Vider la comparaison</button></div>`
   : `<p class="muted">Coche « Comparer » sur deux ou trois offres dans « Toutes les offres », ou ajoute-les ici :</p>`}
   <div class="tools" style="margin-top:10px"><select id="cmpAdd" style="flex:1"><option value="">Ajouter une offre à la comparaison…</option>${open.filter(o => !S.compare.has(o.id)).map(o => `<option value="${esc(o.id)}">${esc(o.company_name + " – " + o.title)}</option>`).join("")}</select><button class="btn" data-a="cmp-add">Ajouter</button></div></div>
  <div class="grid g2" style="margin-top:14px">
   <div class="card"><h2>Les offres qui te correspondent le mieux</h2>${best.length ? best.map(o => `<div class="action"><span class="ic"></span><div><b>${esc(o.company_name)}</b> · ${esc(o.title)}<small>${esc(o.analysis ? o.analysis.slice(0, 160) + (o.analysis.length > 160 ? "…" : "") : "")}</small></div>${scB(o)} <button class="btn sm" data-a="open-offer" data-id="${esc(o.id)}">Voir</button></div>`).join("") : `<p class="muted">Pas encore d'offre notée.</p>`}</div>
   <div class="card"><h2>Compétences les plus demandées</h2><p class="small muted">Nombre d'offres qui citent chaque compétence (missions, compétences, profil).</p>${bars(sk)}</div>
   <div class="card"><h2>Entreprises qui publient le plus</h2><p class="small muted">Offres et pistes enregistrées sur les 90 derniers jours.</p>${bars(rec)}</div>
   <div class="card"><h2>Secteurs avec le plus d'opportunités</h2>${bars(countBy(open, o => o.sector))}</div>
   <div class="card"><h2>Lieux</h2>${bars(countBy(open, o => [o.city, o.country && o.country !== "France" ? o.country : ""].filter(Boolean).join(", ")).slice(0, 10))}</div>
   <div class="card"><h2>Efficacité de tes candidatures</h2>${(() => { const ap = D.offers.filter(isApplied); const bySec = countBy(ap, o => o.sector).map(([s, n]) => { const r = ap.filter(o => (o.sector || "Non renseigné") === s && (o.response_at || RESPONDED.has(o.status))).length; return [s, r, `${r}/${n}`]; });
     return ap.length ? `<p class="small muted">Réponses obtenues par secteur (réponses / candidatures).</p>` + bars(bySec, Math.max(1, ...countBy(ap, o => o.sector).map(x => x[1]))) : `<p class="muted">Les statistiques apparaîtront après tes premières candidatures.</p>`; })()}</div></div>`;
}

/* ===================== Paramètres et données ===================== */
function vSettings() {
  const runs = [...D.sync_runs].sort((a, b) => String(b.started_at).localeCompare(a.started_at)).slice(0, 15);
  return `<div class="head"><div><h1>Paramètres et données</h1><p>Ton profil, la synchronisation avec la veille, tes sauvegardes et la confidentialité.</p></div></div>
  <div class="grid g2"><div class="card"><h2>Mon profil</h2><div class="fg"><label>Prénom (utilisé dans les messages)<input id="pName" value="${esc(D.config.display_name || "")}"></label><label>École<input id="pSchool" value="${esc(D.config.school || "")}"></label></div>
   <p class="small muted">Compte : ${esc(user.email || "")}${D.config.is_primary ? " · compte alimenté par la veille" : ""}</p><div class="acts"><button class="btn" data-a="pwd">Changer de mot de passe</button><button class="btn pri" data-a="save-profile">Enregistrer</button></div></div>
  <div class="card"><h2>Synchronisation avec la veille</h2><p class="small">Chaque matin, l'agent de veille cherche les nouvelles offres, ouvre chaque annonce pour la vérifier, consulte ta base pour éviter les doublons, puis ajoute les nouvelles offres et pistes. Il met aussi à jour l'état des annonces que tu n'as pas encore traitées. Il ne modifie jamais tes statuts, tes dates, tes notes ni tes documents : la base le lui interdit.</p>
   ${runs.length ? `<table><thead><tr><th>Date</th><th>État</th><th>Ajoutées</th><th>Doublons</th><th>Liens revus</th></tr></thead><tbody>${runs.map(r => `<tr><td>${esc(new Date(r.started_at).toLocaleString("fr-FR", {dateStyle: "short", timeStyle: "short"}))}</td><td>${r.status === "ok" ? `<span class="tag ok">OK</span>` : `<span class="tag bad">${esc(r.status)}</span>`}${r.errors ? `<br><span class="small" style="color:var(--coral)">${esc(r.errors)}</span>` : ""}</td><td>${r.added}</td><td>${r.duplicates}</td><td>${r.link_updates}</td></tr>`).join("")}</tbody></table>`
   : `<p class="banner">Aucune synchronisation enregistrée pour l'instant. Le premier passage de la veille apparaîtra ici avec sa date, ses chiffres et ses éventuelles erreurs.</p>`}</div>
  <div class="card"><h2>Notifications</h2><p class="small">Les offres notées 80/100 ou plus et les annonces devenues indisponibles créent une notification dans l'application. La veille t'envoie aussi son rapport sur ton téléphone via l'application Claude.</p>
   <p class="small muted">Navigateur : ${"Notification" in window ? (Notification.permission === "granted" ? "notifications autorisées (affichées quand l'application est ouverte)" : "non autorisées") : "non pris en charge"}</p>${"Notification" in window && Notification.permission !== "granted" ? `<button class="btn" data-a="push">Autoriser les notifications du navigateur</button>` : ""}</div>
  <div class="card"><h2>Sauvegarde et export</h2><p class="small">Exporte toutes tes données (offres, candidatures, contacts, entreprises, historique, rappels, modèles) en JSON, ou tes offres en CSV pour un tableur. Les fichiers déposés restent dans ton stockage Supabase et s'ouvrent un par un depuis « Documents ».</p>
   <div class="acts" style="justify-content:flex-start"><button class="btn pri" data-a="export-json">Exporter tout (JSON)</button><button class="btn" data-a="export-csv">Exporter les offres (CSV)</button><button class="btn" data-a="export-contacts">Exporter les contacts (CSV)</button></div>
   <p class="small" style="margin-top:12px">Restaurer une sauvegarde JSON (les éléments ayant le même identifiant sont remplacés) :</p><input type="file" id="impIn" accept="application/json,.json"></div>
  <div class="card"><h2>Confidentialité</h2><p class="small">Tes données sont dans ta propre base Supabase. Seul ton compte peut les lire : chaque table est protégée par des règles d'accès vérifiées par la base elle-même, et les fichiers sont dans un espace privé. Le code de l'application est public sur GitHub, mais il ne contient aucune donnée.</p></div></div>`;
}
function exportJSON() { const o = {exported_at: new Date().toISOString(), app: "Cap Finance", config: D.config}; TABLES.forEach(t => o[t] = D[t]); download(`cap-finance-${today()}.json`, JSON.stringify(o, null, 2), "application/json"); }
function csv(rows, cols) { const qq = v => { let s = v == null ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; return "﻿" + [cols.join(";"), ...rows.map(r => cols.map(c => qq(r[c])).join(";"))].join("\r\n"); }
function download(name, content, type) { const b = new Blob([content], {type}); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast("Fichier téléchargé : " + name); }
async function importJSON(file) {
  let data; try { data = JSON.parse(await file.text()); } catch (e) { toast("Fichier JSON illisible"); return; }
  const order = ["companies", "offers", "contacts", "events", "documents", "document_links", "tasks", "templates"];
  const n = order.reduce((a, t) => a + (Array.isArray(data[t]) ? data[t].length : 0), 0);
  formDialog(`Restaurer ${n} élément(s) ?`, [], {}, async () => {
    let k = 0;
    for (const t of order) { if (!Array.isArray(data[t]) || !data[t].length) continue;
      const rows = data[t].map(r => { const x = {...r}; delete x.owner_id; return x; });
      try { await q(sb.from(t).upsert(rows, t === "document_links" ? {onConflict: "document_id,offer_id"} : undefined)); k += rows.length; } catch (e) { fail(e); } }
    await loadAll(); render(); toast(k + " élément(s) restauré(s)");
  }, [], () => $("#dlgf").insertAdjacentHTML("afterbegin", `<p>Les éléments ayant le même identifiant seront remplacés. Le journal de synchronisation et les notifications ne sont pas restaurés.</p>`));
}

/* ===================== Fiches (tiroir) ===================== */
function openDrawer(type, id, tab) { S.drawer = {type, id}; S.tab = tab || (type === "offer" ? "details" : "infos"); $("#drawer").classList.add("open"); $("#scrim").hidden = false; drawDrawer(true); $("#drawer").focus(); }
function closeDrawer() { S.drawer = null; $("#drawer").classList.remove("open"); $("#scrim").hidden = true; }
function drawDrawer(force) {
  const d = S.drawer, dr = $("#drawer"); if (!d) return;
  const item = byId(d.type === "offer" ? "offers" : d.type === "company" ? "companies" : "contacts", d.id);
  if (!item) { closeDrawer(); return; }
  const sig = JSON.stringify(item) + S.tab + D.events.length + D.document_links.length + D.documents.length + D.contacts.length + D.tasks.length;
  if (!force && dr._sig === sig) return; dr._sig = sig;
  dr.innerHTML = d.type === "offer" ? offerSheet(item) : d.type === "company" ? companySheet(item) : contactSheet(item);
  dr.tabIndex = -1;
}
const tabs = (list) => `<div class="tabs">${list.map(([k, l]) => `<button class="tab ${S.tab === k ? "on" : ""}" data-a="tab" data-k="${k}">${esc(l)}</button>`).join("")}</div>`;
const timeline = evs => { const t = today(); evs.sort((a, b) => String(a.d).localeCompare(b.d)); return evs.length ? `<ul class="tl">${evs.map(e => `<li class="${e.d > t ? "fut" : ""}"><time>${esc(fd(e.d))}${e.d > t ? " · à venir" : ""}</time><b>${esc(e.t)}</b>${e.x ? `<br>${esc(e.x)}` : ""}${e.id ? ` <button class="btn sm ghost" data-a="del-event" data-id="${esc(e.id)}" aria-label="Supprimer">×</button>` : ""}</li>`).join("")}</ul>` : `<p class="muted">Aucun événement.</p>`; };
function offerSheet(o) {
  const T = [["details", "Détails"], ["cand", "Candidature"], ["hist", "Historique"], ["docs", "Documents"], ["contacts", "Contacts"], ["prep", "Entretien"], ["notes", "Notes"]];
  let b = "";
  if (S.tab === "details") b = `${o.kind !== "publiee" ? `<div class="banner"><b>${esc(C.KINDS[o.kind])}</b>${o.certainty ? " · " + esc(C.CERTAINTY[o.certainty]) : ""}. Aucune annonce publique n'est confirmée : c'est une piste de prospection, pas une offre.</div>` : ""}
   <dl class="f"><dt>Entreprise</dt><dd><a href="#" data-a="open-company-by-name" data-k="${esc(o.company_name)}">${esc(o.company_name)}</a></dd><dt>Intitulé</dt><dd>${esc(o.title)}</dd><dt>Secteur</dt><dd>${esc(o.sector || "—")}</dd><dt>Lieu</dt><dd>${esc([o.city, o.country].filter(Boolean).join(", ") || "—")}</dd>
   <dt>Contrat</dt><dd>${esc(o.contract || "—")}</dd><dt>Durée</dt><dd>${esc(o.duration || "—")}</dd><dt>Début</dt><dd>${esc(o.start_label || "—")}</dd><dt>Publication</dt><dd>${esc(fd(o.published_at) || "Non vérifiée")}</dd><dt>Dernière actualisation</dt><dd>${esc(fd(o.offer_updated_at) || "—")}</dd><dt>Gratification</dt><dd>${esc(o.pay || "Non communiquée")}</dd></dl>
   <div class="sec">Le poste</div><dl class="f"><dt>Description</dt><dd>${esc(o.description || "—")}</dd><dt>Missions</dt><dd>${esc(o.missions || "—")}</dd><dt>Compétences</dt><dd>${esc(o.skills || "—")}</dd><dt>Formation, niveau</dt><dd>${esc(o.education || "—")}</dd><dt>Langues</dt><dd>${esc(o.languages || "—")}</dd></dl>
   <div class="sec">Pertinence pour ton profil</div><dl class="f"><dt>Note</dt><dd>${scB(o) || "—"} ${esc(o.priority || "")}</dd><dt>Analyse</dt><dd>${esc(o.analysis || "—")}</dd>${o.approach ? `<dt>Démarche proposée</dt><dd>${esc(o.approach)}</dd>` : ""}</dl>
   <div class="sec">Liens et candidature</div><dl class="f"><dt>Annonce</dt><dd>${L(o.offer_url, "Ouvrir l'annonce")} ${lkB(o)}${o.link_checked_at ? ` <span class="small muted">contrôlée le ${esc(fd(o.link_checked_at))}</span>` : ""}</dd><dt>Plateforme</dt><dd>${esc(o.platform || "—")}</dd>
   <dt>Site de recrutement</dt><dd>${L(o.careers_url, "Site officiel")}</dd><dt>Formulaire</dt><dd>${L(o.apply_url, "Accéder au formulaire")}</dd><dt>Recruteur</dt><dd>${esc([o.recruiter_name, o.recruiter_role].filter(Boolean).join(" · ") || "Non publié")}</dd>
   <dt>LinkedIn</dt><dd>${L(o.recruiter_linkedin, "Profil LinkedIn")}</dd><dt>Coordonnées publiques</dt><dd>${esc(o.recruiter_contact || "—")}</dd></dl><p class="small muted">Référence ${esc(o.ext_id)} · ${o.source === "veille" ? "ajoutée par la veille" : "ajoutée par toi"} le ${esc(fd(String(o.created_at).slice(0, 10)))}</p>`;
  if (S.tab === "cand") { const dopt = (v) => `<option value="">—</option>${D.documents.map(d => `<option value="${esc(d.id)}" ${d.id === v ? "selected" : ""}>${esc(d.kind + " · " + d.name + (d.version_label ? " (" + d.version_label + ")" : ""))}</option>`).join("")}`;
    b = `<form id="candForm" class="fg"><label>Statut<select name="status">${opt(C.STATUSES, o.status)}</select></label><label>Date d'envoi<input type="date" name="applied_at" value="${esc(o.applied_at || "")}"></label><label>Prochaine relance<input type="date" name="follow_up_at" value="${esc(o.follow_up_at || "")}"></label>
     <label>Entretien<input type="date" name="interview_at" value="${esc(o.interview_at || "")}"></label><label>Test ou étude de cas<input type="date" name="test_at" value="${esc(o.test_at || "")}"></label><label>Date limite de candidature<input type="date" name="deadline" value="${esc(o.deadline || "")}"></label>
     <label>Date de réponse<input type="date" name="response_at" value="${esc(o.response_at || "")}"></label><label>Résultat<input name="result" value="${esc(o.result || "")}"></label><label class="full">Lien vers la candidature déposée<input type="url" name="applied_url" value="${esc(o.applied_url || "")}" placeholder="https://…"></label>
     <label>Interlocuteur<input name="recruiter_name" value="${esc(o.recruiter_name || "")}"></label><label>Fonction<input name="recruiter_role" value="${esc(o.recruiter_role || "")}"></label><label>LinkedIn<input type="url" name="recruiter_linkedin" value="${esc(o.recruiter_linkedin || "")}"></label><label>Coordonnées<input name="recruiter_contact" value="${esc(o.recruiter_contact || "")}"></label>
     <label>CV envoyé<select name="cv_doc_id">${dopt(o.cv_doc_id)}</select></label><label>Lettre de motivation<select name="letter_doc_id">${dopt(o.letter_doc_id)}</select></label></form>
     <div class="acts">${o.applied_url ? L(o.applied_url, "Ma candidature déposée") : ""}<button class="btn" data-a="new-task" data-offer="${esc(o.id)}">Créer un rappel</button><button class="btn pri" data-a="save-cand" data-id="${esc(o.id)}">Enregistrer</button></div>`; }
  if (S.tab === "hist") { const ev = []; const P = (d, t, x) => d && ev.push({d: String(d).slice(0, 10), t, x});
    P(o.created_at, o.source === "veille" ? "Offre découverte par la veille" : "Offre enregistrée"); P(o.saved_at, "Offre retenue"); P(o.prep_at, "Préparation du dossier"); P(o.applied_at, "Candidature envoyée"); P(o.follow_up_at, "Relance prévue"); P(o.interview_at, "Entretien"); P(o.test_at, "Test ou étude de cas"); P(o.response_at, "Réponse de l'entreprise", o.result);
    D.events.filter(e => e.offer_id === o.id).forEach(e => ev.push({d: e.date, t: e.type, x: e.text, id: e.id}));
    b = timeline(ev) + `<div class="acts"><button class="btn pri" data-a="new-event" data-offer="${esc(o.id)}">Ajouter un échange ou un événement</button></div>`; }
  if (S.tab === "docs") { const ds = docsOfOffer(o);
    b = `${ds.length ? ds.map(d => `<div class="doc"><span class="nm">${esc(d.name)}${d.version_label ? ` <span class="tag">${esc(d.version_label)}</span>` : ""}<br><span class="small muted">${esc(d.kind)}${o.cv_doc_id === d.id ? " · CV envoyé" : ""}${o.letter_doc_id === d.id ? " · lettre envoyée" : ""}</span></span>${d.storage_path ? `<button class="btn sm" data-a="open-doc" data-id="${esc(d.id)}">Ouvrir</button>` : ""}${D.document_links.some(l => l.document_id === d.id && l.offer_id === o.id) ? `<button class="btn sm ghost" data-a="detach" data-id="${esc(d.id)}" data-offer="${esc(o.id)}">Retirer</button>` : ""}</div>`).join("") : `<p class="muted">Aucun document associé.</p>`}
     <div class="sec">Associer un document existant</div><div class="tools"><select id="attSel" style="flex:1"><option value="">Choisir…</option>${D.documents.filter(d => !ds.includes(d)).map(d => `<option value="${esc(d.id)}">${esc(d.kind + " · " + d.name)}</option>`).join("")}</select><button class="btn" data-a="attach" data-offer="${esc(o.id)}">Associer</button></div>
     <div class="sec">Déposer un fichier pour cette candidature</div><div class="tools"><select id="upKind">${opt(C.DOC_KINDS, "Offre (PDF)")}</select><input id="upVer" placeholder="Version (ex. CV PE v2)"><input type="file" id="upOne" data-c="upone" data-offer="${esc(o.id)}"></div>`; }
  if (S.tab === "contacts") { const c = companyOf(o), ks = D.contacts.filter(k => k.offer_id === o.id || (c && (k.company_id === c.id || norm(k.company_name) === norm(c.name))));
    b = `${ks.length ? ks.map(k => `<div class="doc"><span class="nm">${esc(contactName(k))}<br><span class="small muted">${esc(k.role || "")} · ${esc(k.relation)}</span></span><button class="btn sm" data-a="compose" data-contact="${esc(k.id)}" data-offer="${esc(o.id)}">Message</button><button class="btn sm" data-a="open-contact" data-id="${esc(k.id)}">Fiche</button></div>`).join("") : `<p class="muted">Aucun contact enregistré pour cette entreprise.</p>`}
     <div class="acts"><button class="btn" data-a="go" data-id="prospection">Trouver qui contacter</button><button class="btn pri" data-a="new-contact" data-offer="${esc(o.id)}" data-company="${esc(o.company_name)}">Ajouter un contact</button></div>`; }
  if (S.tab === "prep") b = `<p>La fiche de préparation complète (entreprise, métier, questions probables, questions à poser) se trouve dans l'espace dédié.</p><button class="btn pri" data-a="prep" data-id="${esc(o.id)}">Ouvrir la préparation de cet entretien</button>`;
  if (S.tab === "notes") b = `<textarea id="oNotes" rows="12" placeholder="Impressions, informations sur l'entreprise, remarques après un échange…">${esc(o.notes || "")}</textarea><div class="acts"><button class="btn pri" data-a="save-notes" data-id="${esc(o.id)}">Enregistrer les notes</button></div>`;
  return `<div class="dh"><button class="btn ghost x" data-a="close">Fermer</button><button class="fav ${o.favorite ? "on" : ""}" style="float:right" data-a="fav" data-id="${esc(o.id)}" aria-label="Favori">★</button>
   <div class="small muted">${esc(o.ext_id)} · ${esc(o.sector || "")} ${kB(o)}</div><h2 style="margin-top:4px">${esc(o.company_name)} ${isNew(o) ? `<span class="tag new">Nouvelle</span>` : ""}</h2><p style="margin:2px 0 8px">${esc(o.title)}</p>
   <div class="tools" style="margin:0">${stB(o.status)}<select data-c="status" data-id="${esc(o.id)}" aria-label="Changer le statut">${opt(C.STATUSES, o.status)}</select><button class="btn sm" data-a="edit-offer" data-id="${esc(o.id)}">Modifier la fiche</button><button class="btn sm dan" data-a="del-offer" data-id="${esc(o.id)}">Supprimer</button></div>${tabs(T)}</div><div class="db">${b}</div>`;
}
function companySheet(c) {
  const T = [["infos", "Fiche"], ["offres", "Offres et candidatures"], ["contacts", "Contacts"], ["hist", "Historique"]]; let b = "";
  const os = offersOfCompany(c), ks = contactsOfCompany(c);
  if (S.tab === "infos") b = `<dl class="f"><dt>Secteur</dt><dd>${esc(c.sector || "—")}</dd><dt>Rang</dt><dd>${esc(c.tier || "—")}</dd><dt>Présentation</dt><dd>${esc(c.description || "—")}</dd><dt>Implantations</dt><dd>${esc(c.locations || "—")}</dd>
   <dt>Site officiel</dt><dd>${L(c.website)}</dd><dt>Site de recrutement</dt><dd>${L(c.careers_url)} <span class="small muted">${esc(c.link_note || "")}</span></dd><dt>Page LinkedIn</dt><dd>${L(c.linkedin_url)}</dd><dt>Métiers financiers</dt><dd>${esc(c.jobs || "—")}</dd>
   <dt>Repères de recrutement</dt><dd>${esc(c.signal || "—")}</dd><dt>Mes notes</dt><dd>${esc(c.notes || "—")}</dd></dl>`;
  if (S.tab === "offres") b = os.length ? os.map(o => `<div class="doc"><span class="nm">${esc(o.title)}<br><span class="small muted">${esc(o.ext_id)} · ${esc(fd(o.applied_at) || o.start_label || "")}</span> ${kB(o)}</span>${stB(o.status)}<button class="btn sm" data-a="open-offer" data-id="${esc(o.id)}">Ouvrir</button></div>`).join("") + `<div class="acts"><button class="btn" data-a="new-offer" data-kind="prospection" data-company="${esc(c.name)}">Ajouter une piste ou une candidature spontanée</button></div>` : `<p class="muted">Aucune offre enregistrée.</p><div class="acts"><button class="btn pri" data-a="new-offer" data-kind="prospection" data-company="${esc(c.name)}">Ajouter une candidature spontanée</button></div>`;
  if (S.tab === "contacts") b = (ks.length ? ks.map(k => `<div class="doc"><span class="nm">${esc(contactName(k))}<br><span class="small muted">${esc(k.role || "")} · ${esc(k.relation)}</span></span><button class="btn sm" data-a="open-contact" data-id="${esc(k.id)}">Fiche</button></div>`).join("") : `<p class="muted">Aucun contact dans cette entreprise.</p>`)
   + `<div class="sec">Qui contacter</div>${C.PROSPECT_ROLES.map((p, i) => `<div class="doc"><span class="nm">${esc(p.role)}<br><span class="small muted">${esc(p.why)}</span></span><a class="btn sm" href="https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(c.name + " " + p.q)}" target="_blank" rel="noopener">Rechercher sur LinkedIn</a><button class="btn sm" data-a="add-sugg" data-id="${esc(c.id)}" data-i="${i}">Ajouter comme piste</button></div>`).join("")}
   <div class="acts"><button class="btn pri" data-a="new-contact" data-company="${esc(c.name)}">Ajouter un contact</button></div>`;
  if (S.tab === "hist") { const ev = []; os.forEach(o => { if (o.applied_at) ev.push({d: o.applied_at, t: "Candidature envoyée", x: o.title}); D.events.filter(e => e.offer_id === o.id).forEach(e => ev.push({d: e.date, t: e.type + " – " + o.title, x: e.text})); });
    ks.forEach(k => D.events.filter(e => e.contact_id === k.id).forEach(e => ev.push({d: e.date, t: e.type + " – " + contactName(k), x: e.text})));
    D.events.filter(e => e.company_id === c.id).forEach(e => ev.push({d: e.date, t: e.type, x: e.text, id: e.id}));
    b = timeline(ev) + `<div class="acts"><button class="btn" data-a="new-event" data-company="${esc(c.id)}">Ajouter une démarche</button></div>`; }
  return `<div class="dh"><button class="btn ghost x" data-a="close">Fermer</button><button class="fav ${c.is_target ? "on" : ""}" style="float:right" data-a="target" data-id="${esc(c.id)}" aria-label="Entreprise cible" title="Entreprise cible">★</button>
   <div class="small muted">${esc(c.sector || "")}${c.is_target ? " · entreprise cible" : ""}</div><h2 style="margin-top:4px">${esc(c.name)}</h2><p class="small muted" style="margin:4px 0 8px">${os.length} offre(s) · ${os.filter(isApplied).length} candidature(s) · ${ks.filter(k => !k.is_suggestion).length} contact(s)</p>
   <div class="tools" style="margin:0"><button class="btn sm" data-a="edit-company" data-id="${esc(c.id)}">Modifier la fiche</button><button class="btn sm dan" data-a="del-company" data-id="${esc(c.id)}">Supprimer</button></div>${tabs(T)}</div><div class="db">${b}</div>`;
}
function contactSheet(k) {
  const T = [["infos", "Fiche"], ["hist", "Échanges"]]; let b = "";
  if (S.tab === "infos") b = `<dl class="f"><dt>Entreprise</dt><dd>${esc(k.company_name || "—")}</dd><dt>Fonction</dt><dd>${esc(k.role || "—")}</dd><dt>Catégorie</dt><dd>${esc(k.category || "—")}</dd><dt>Secteur</dt><dd>${esc(k.sector || "—")}</dd><dt>Lieu</dt><dd>${esc([k.city, k.country].filter(Boolean).join(", ") || "—")}</dd>
   <dt>LinkedIn</dt><dd>${L(k.linkedin_url, "Profil LinkedIn")}</dd><dt>E-mail</dt><dd>${esc(k.email || "—")}</dd><dt>Origine du contact</dt><dd>${esc(k.origin || "—")}</dd><dt>Premier contact</dt><dd>${esc(fd(k.contacted_at) || "—")}</dd>
   <dt>Suivi</dt><dd>${esc(k.relation)}${k.helped ? " · m'a proposé de l'aide" : ""}${k.can_introduce ? " · peut me mettre en relation" : ""}</dd><dt>A recommandé</dt><dd>${esc(k.recommended || "—")}</dd><dt>Opportunité liée</dt><dd>${k.offer_id && byId("offers", k.offer_id) ? `<a href="#" data-a="open-offer" data-id="${esc(k.offer_id)}">${esc(byId("offers", k.offer_id).title)}</a>` : "—"}</dd>
   <dt>Prochaine action</dt><dd>${esc(k.next_action || "—")}${k.next_action_at ? " · " + esc(fd(k.next_action_at)) : ""}</dd><dt>Notes</dt><dd>${esc(k.notes || "—")}</dd></dl>`;
  if (S.tab === "hist") b = timeline(D.events.filter(e => e.contact_id === k.id).map(e => ({d: e.date, t: e.type, x: e.text, id: e.id}))) + `<div class="acts"><button class="btn pri" data-a="new-event" data-contact="${esc(k.id)}">Ajouter un échange</button></div>`;
  return `<div class="dh"><button class="btn ghost x" data-a="close">Fermer</button><div class="small muted">${esc(k.category || "Contact")}${k.is_suggestion ? " · piste à identifier" : ""}</div><h2 style="margin-top:4px">${esc(contactName(k))}</h2><p class="small muted" style="margin:4px 0 8px">${esc([k.role, k.company_name].filter(Boolean).join(" · "))}</p>
   <div class="tools" style="margin:0"><span class="tag">${esc(k.relation)}</span><button class="btn sm pri" data-a="compose" data-contact="${esc(k.id)}">Préparer un message</button><button class="btn sm" data-a="edit-contact" data-id="${esc(k.id)}">Modifier</button><button class="btn sm" data-a="new-task" data-contact="${esc(k.id)}">Rappel</button><button class="btn sm dan" data-a="del-contact" data-id="${esc(k.id)}">Supprimer</button></div>${tabs(T)}</div><div class="db">${b}</div>`;
}

/* ===================== Formulaires ===================== */
let dlgOnSave = null, dlgExtra = [];
function readForm() { const v = {}; $("#dlgf").querySelectorAll("[name]").forEach(e => { v[e.name] = e.type === "checkbox" ? e.checked : e.value.trim(); }); return v; }
function formDialog(title, fields, vals, onSave, extra, after) {
  const f = $("#dlgf"); if ($("#dlg").open) $("#dlg").close(); dlgOnSave = onSave; dlgExtra = extra || [];
  const fld = ([k, l, t, opts, labels]) => { const v = vals[k] ?? "";
    if (t === "select") return `<label class="${["template_id", "contact_id", "offer_id"].includes(k) ? "full" : ""}">${esc(l)}<select name="${k}">${opts.map(x => `<option value="${esc(x)}" ${String(x) === String(v) ? "selected" : ""}>${esc(labels ? labels[x] : x)}</option>`).join("")}</select></label>`;
    if (t === "area") return `<label class="full">${esc(l)}<textarea name="${k}" rows="${k === "body" ? 12 : 3}">${esc(v)}</textarea></label>`;
    if (t === "check") return `<label class="chk"><input type="checkbox" name="${k}" ${v ? "checked" : ""}>${esc(l)}</label>`;
    if (t === "list") return `<label>${esc(l)}<input name="${k}" list="dl-${k}" value="${esc(v)}"><datalist id="dl-${k}">${opts.map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>`;
    return `<label>${esc(l)}<input name="${k}" type="${t || "text"}" value="${esc(t === "date" ? String(v).slice(0, 10) : v)}" ${t === "number" ? 'min="0" max="100"' : ""}></label>`; };
  f.innerHTML = `<h2>${esc(title)}</h2><div class="fg" style="margin-top:14px">${fields.map(fld).join("")}</div>
   <div class="acts"><button class="btn" value="cancel" formnovalidate>${onSave || dlgExtra.length ? "Annuler" : "Fermer"}</button>${dlgExtra.map((a, i) => `<button type="button" class="btn ${a[1]}" data-x="${i}">${esc(a[0])}</button>`).join("")}${onSave ? `<button type="button" class="btn pri" data-x="save">Enregistrer</button>` : ""}</div>`;
  f.querySelectorAll("[data-x]").forEach(b => b.onclick = async () => { b.disabled = true; try { const fn = b.dataset.x === "save" ? dlgOnSave : dlgExtra[+b.dataset.x][2]; const r = await fn(readForm()); if (r !== false && $("#dlg").open) $("#dlg").close(); } finally { b.disabled = false; } });
  $("#dlg").showModal(); if (after) after();
}
const OFFER_F = () => [["kind", "Catégorie", "select", Object.keys(C.KINDS), C.KINDS], ["certainty", "Niveau de certitude (pistes)", "select", ["", ...Object.keys(C.CERTAINTY)], {"": "—", ...C.CERTAINTY}],
  ["company_name", "Entreprise *", "list", D.companies.map(c => c.name)], ["title", "Intitulé exact du poste *"], ["sector", "Secteur", "select", ["", ...C.SECTORS]], ["city", "Ville"], ["country", "Pays"], ["contract", "Type de contrat"], ["duration", "Durée"], ["start_label", "Date de début"],
  ["published_at", "Date de publication", "date"], ["offer_updated_at", "Dernière actualisation", "date"], ["score", "Note de pertinence /100", "number"], ["priority", "Priorité", "select", ["", "Élevée", "Intermédiaire", "Secondaire"]],
  ["offer_url", "Lien de l'annonce", "url"], ["platform", "Plateforme"], ["careers_url", "Site de recrutement", "url"], ["apply_url", "Lien du formulaire", "url"], ["link_state", "Contrôle du lien", "select", ["", ...Object.keys(LINK)], {"": "—", ...LINK}], ["link_checked_at", "Lien contrôlé le", "date"],
  ["recruiter_name", "Recruteur"], ["recruiter_role", "Fonction du recruteur"], ["recruiter_linkedin", "LinkedIn du recruteur", "url"], ["recruiter_contact", "Coordonnées publiques"], ["pay", "Gratification"], ["languages", "Langues"],
  ["education", "Formation, niveau", "area"], ["description", "Description", "area"], ["missions", "Missions", "area"], ["skills", "Compétences", "area"], ["analysis", "Analyse de pertinence", "area"], ["approach", "Démarche proposée (pistes)", "area"]];
const clean = (v, keys) => { const o = {}; keys.forEach(k => { let x = v[k]; if (x === "") x = null; o[k] = x; }); return o; };
function badUrl(v, keys) { for (const k of keys) if (v[k] && !safe(v[k])) { toast("Le lien « " + k + " » doit commencer par https://"); return true; } return false; }
async function ensureCompany(name, sector) { if (!name) return null; let c = D.companies.find(x => norm(x.name) === norm(name)); if (!c) c = await ins("companies", {name, sector: sector || null}); return c ? c.id : null; }
function offerForm(o, preset) {
  const F = OFFER_F(), keys = F.map(x => x[0]);
  formDialog(o ? "Modifier la fiche" : "Ajouter " + (preset.kind === "publiee" ? "une offre" : preset.kind === "cachee" ? "une opportunité cachée" : "une entreprise à prospecter"), F, o || {country: "France", contract: "Stage", ...preset}, async v => {
    if (!v.company_name || !v.title) { toast("Entreprise et intitulé sont obligatoires"); return false; }
    if (badUrl(v, ["offer_url", "careers_url", "apply_url", "recruiter_linkedin"])) return false;
    const row = clean(v, keys); row.score = v.score === "" ? null : Math.max(0, Math.min(100, +v.score)); row.company_id = await ensureCompany(v.company_name, v.sector);
    if (o) { await upd("offers", o.id, row); toast("Fiche enregistrée"); return; }
    const dup = D.offers.find(x => (row.offer_url && x.offer_url && norm(x.offer_url).replace(/\/+$/, "") === norm(row.offer_url).replace(/\/+$/, "")) || (norm(x.company_name) === norm(row.company_name) && norm(x.title) === norm(row.title)));
    if (dup) { toast("Cette offre existe déjà (" + dup.ext_id + ")"); openDrawer("offer", dup.id); return; }
    const r = await ins("offers", {...row, ext_id: "MAN-" + Date.now().toString(36).toUpperCase(), source: "manuel", status: "À étudier", saved_at: today()});
    if (r) { toast("Ajouté"); openDrawer("offer", r.id); }
  });
}
const CONTACT_F = () => [["first_name", "Prénom"], ["last_name", "Nom"], ["company_name", "Entreprise", "list", D.companies.map(c => c.name)], ["role", "Fonction"], ["category", "Catégorie", "select", ["", ...C.CONTACT_CATEGORIES]], ["sector", "Secteur", "select", ["", ...C.SECTORS]],
  ["city", "Ville"], ["country", "Pays"], ["linkedin_url", "Lien LinkedIn", "url"], ["email", "E-mail professionnel (public ou communiqué par la personne)", "email"], ["origin", "Origine du contact"], ["contacted_at", "Date de prise de contact", "date"],
  ["relation", "Suivi de la relation", "select", C.RELATIONS], ["offer_id", "Opportunité associée", "select", ["", ...D.offers.map(o => o.id)], D.offers.reduce((a, o) => (a[o.id] = o.company_name + " – " + o.title, a), {"": "—"})],
  ["recommended", "M'a recommandé (entreprise)"], ["next_action", "Prochaine action"], ["next_action_at", "Date de la prochaine action", "date"], ["helped", "M'a proposé de l'aide", "check"], ["can_introduce", "Peut me mettre en relation avec un recruteur", "check"], ["notes", "Notes personnelles", "area"]];
function contactForm(k, preset) {
  const F = CONTACT_F(), keys = F.map(x => x[0]);
  formDialog(k ? "Modifier le contact" : "Ajouter un contact", F, k || {relation: "À contacter", country: "France", ...preset}, async v => {
    if (!v.first_name && !v.last_name && !v.role) { toast("Indique au moins un nom ou une fonction"); return false; } if (badUrl(v, ["linkedin_url"])) return false;
    const row = clean(v, keys); row.helped = !!v.helped; row.can_introduce = !!v.can_introduce; row.company_id = await ensureCompany(v.company_name, v.sector);
    if (k) { if (k.is_suggestion && (v.first_name || v.last_name)) row.is_suggestion = false; await upd("contacts", k.id, row); toast("Contact enregistré"); }
    else { const r = await ins("contacts", row); if (r) openDrawer("contact", r.id); }
  });
}
const COMPANY_F = [["name", "Nom *"], ["sector", "Secteur", "select", ["", ...C.SECTORS]], ["tier", "Rang"], ["locations", "Implantations"], ["website", "Site officiel", "url"], ["careers_url", "Site de recrutement", "url"], ["linkedin_url", "Page LinkedIn", "url"], ["is_target", "Entreprise cible", "check"], ["description", "Présentation", "area"], ["jobs", "Métiers financiers présents", "area"], ["signal", "Repères de recrutement", "area"], ["notes", "Mes notes", "area"]];
function companyForm(c) {
  const keys = COMPANY_F.map(x => x[0]);
  formDialog(c ? "Modifier l'entreprise" : "Ajouter une entreprise", COMPANY_F, c || {}, async v => {
    if (!v.name) { toast("Le nom est obligatoire"); return false; } if (badUrl(v, ["website", "careers_url", "linkedin_url"])) return false;
    const row = clean(v, keys); row.is_target = !!v.is_target;
    if (c) await upd("companies", c.id, row); else { if (D.companies.some(x => norm(x.name) === norm(v.name))) { toast("Cette entreprise existe déjà"); return false; } const r = await ins("companies", row); if (r) openDrawer("company", r.id); }
  });
}
function taskForm(x, preset) {
  formDialog(x ? "Modifier le rappel" : "Nouveau rappel", [["date", "Date", "date"], ["time", "Heure (facultatif)", "time"], ["kind", "Type", "select", C.TASK_KINDS], ["text", "Rappel *"],
    ["offer_id", "Candidature liée", "select", ["", ...D.offers.map(o => o.id)], D.offers.reduce((a, o) => (a[o.id] = o.company_name + " – " + o.title, a), {"": "—"})],
    ["contact_id", "Contact lié", "select", ["", ...D.contacts.map(k => k.id)], D.contacts.reduce((a, k) => (a[k.id] = contactName(k), a), {"": "—"})], ...(x ? [["done", "Fait", "check"]] : [])],
    x || {date: today(), kind: "Rappel", ...preset}, async v => {
      if (!v.text) { toast("Écris le rappel"); return false; }
      const row = {date: v.date || today(), time: v.time || null, kind: v.kind, text: v.text, offer_id: v.offer_id || null, contact_id: v.contact_id || null, ...(x ? {done: !!v.done} : {})};
      if (x) await upd("tasks", x.id, row); else { await ins("tasks", row); toast("Rappel créé"); }
    }, x ? [["Supprimer", "dan", async () => { await del("tasks", x.id); }]] : []);
}
function eventForm(preset) {
  formDialog("Ajouter un échange ou un événement", [["date", "Date", "date"], ["type", "Type", "select", ["Échange", "Appel", "Entretien", "Email envoyé", "Message LinkedIn", "Relance", "Événement networking", "Note"]], ["text", "Détail", "area"]],
    {date: today(), type: "Échange"}, async v => { const r = await ins("events", {...preset, date: v.date || today(), type: v.type, text: v.text || null});
      if (r && preset.offer_id && v.type === "Entretien") { const o = byId("offers", preset.offer_id); if (o && !o.interview_at) await upd("offers", o.id, {interview_at: r.date}); } });
}
function templateForm(t) {
  formDialog(t ? "Modifier le modèle" : "Nouveau modèle", [["name", "Nom *"], ["category", "Catégorie"], ["channel", "Canal", "select", ["LinkedIn", "Email"]], ["subject", "Objet (email)"], ["body", "Message — variables : {prenom} {nom} {entreprise} {fonction} {poste} {secteur} {ecole} {mon_prenom}", "area"]],
    t || {channel: "LinkedIn"}, async v => { if (!v.name || !v.body) { toast("Nom et message obligatoires"); return false; } if (t) await upd("templates", t.id, v); else await ins("templates", v); },
    t ? [["Supprimer", "dan", async () => { await del("templates", t.id); }]] : []);
}
function docForm(d) {
  const text = !d || !d.storage_path;
  formDialog(d ? "Modifier le document" : "Nouveau document texte", [["name", "Nom *"], ["kind", "Type", "select", C.DOC_KINDS], ["version_label", "Version"], ["notes", "Notes", "area"], ...(text ? [["body", "Contenu", "area"]] : [])],
    d || {kind: "Modèle d'email"}, async v => { if (!v.name) { toast("Donne un nom"); return false; } const row = {name: v.name, kind: v.kind, version_label: v.version_label || null, notes: v.notes || null, ...(text ? {body: v.body} : {})};
      if (d) await upd("documents", d.id, row); else await ins("documents", row); },
    d ? [["Supprimer", "dan", async () => { const u = offersOfDoc(d);
      formDialog(`Supprimer « ${d.name} » ?`, [], {}, async () => {
        for (const o of u) { const ch = {}; if (o.cv_doc_id === d.id) ch.cv_doc_id = null; if (o.letter_doc_id === d.id) ch.letter_doc_id = null; if (Object.keys(ch).length) await upd("offers", o.id, ch); }
        if (d.storage_path) { const {error} = await sb.storage.from("documents").remove([d.storage_path]); if (error) { fail(error); return false; } }
        await del("documents", d.id); toast("Document supprimé"); }, [], () => $("#dlgf .fg").insertAdjacentHTML("beforebegin", `<p>${u.length ? `Ce document est associé à ${u.length} candidature(s) : il en sera retiré.` : "Il sera supprimé définitivement."}</p>`)); return false; }]] : []);
}
function confirmDel(title, msg, fn) { formDialog(title, [], {}, null, [["Supprimer définitivement", "dan", fn]], () => $("#dlgf .fg").insertAdjacentHTML("beforebegin", `<p>${esc(msg)}</p>`)); }

/* ===================== Interactions (délégation) ===================== */
const ACT = {
  "open-offer": d => openDrawer("offer", d.id), "open-company": d => openDrawer("company", d.id), "open-contact": d => openDrawer("contact", d.id),
  "open-company-by-name": d => { const c = D.companies.find(x => norm(x.name) === norm(d.k)); if (c) openDrawer("company", c.id); },
  close: closeDrawer, tab: d => { S.tab = d.k; drawDrawer(true); },
  go: d => { location.hash = d.id; closeDrawer(); }, prep: d => { S.prepId = d.id; closeDrawer(); if (route() === "entretiens") render(); else location.hash = "entretiens"; },
  kpi: d => { if (d.r === "offres") { S.chip = d.chip; S.kind = "publiee"; } else if (d.r === "candidatures") S.appFilter = d.chip; if (location.hash === "#" + d.r) render(); else location.hash = d.r; },
  kind: d => { S.kind = d.k; S._keepKind = true; render(); }, chip: d => { S.chip = d.k; render(); }, mode: d => { S.mode = d.k; render(); }, appf: d => { S.appFilter = d.k; render(); },
  fav: d => { const o = byId("offers", d.id); upd("offers", o.id, {favorite: !o.favorite}); }, qs: d => setStatus(byId("offers", d.id), d.s),
  target: d => { const c = byId("companies", d.id); upd("companies", c.id, {is_target: !c.is_target}); },
  "new-offer": d => offerForm(null, {kind: d.kind || "publiee", company_name: d.company || ""}), "edit-offer": d => offerForm(byId("offers", d.id)),
  "del-offer": d => { const o = byId("offers", d.id); confirmDel("Supprimer cette fiche ?", isApplied(o) ? "Cette candidature fait partie de ton historique. Pour la conserver, passe-la plutôt au statut « Abandonnée » ou « Refus »." : "La fiche, son historique et ses rappels seront supprimés.", async () => { if (await del("offers", o.id)) { closeDrawer(); toast("Fiche supprimée"); } }); },
  "save-cand": async d => { const o = byId("offers", d.id), f = $("#candForm"), v = {}; f.querySelectorAll("[name]").forEach(e => v[e.name] = e.value.trim()); if (badUrl(v, ["applied_url", "recruiter_linkedin"])) return;
    const ns = v.status; delete v.status; Object.keys(v).forEach(k => { if (v[k] === "") v[k] = null; }); const r = await upd("offers", o.id, v); if (r && ns !== o.status) await setStatus(r, ns); else if (r) toast("Candidature enregistrée"); },
  "save-notes": d => upd("offers", d.id, {notes: $("#oNotes").value}).then(r => r && toast("Notes enregistrées")),
  "new-event": d => eventForm({offer_id: d.offer || null, contact_id: d.contact || null, company_id: d.company || null}),
  "del-event": d => confirmDel("Supprimer cet événement ?", "Il disparaîtra de l'historique.", () => del("events", d.id)),
  "new-task": d => taskForm(null, {offer_id: d.offer || "", contact_id: d.contact || ""}), "edit-task": d => taskForm(byId("tasks", d.id)), "task-done": d => upd("tasks", d.id, {done: true}).then(r => r && toast("Bien joué !")),
  "new-contact": d => { const o = d.offer && byId("offers", d.offer); contactForm(null, {company_name: d.company || "", offer_id: d.offer || "", sector: o ? o.sector : ""}); },
  "edit-contact": d => contactForm(byId("contacts", d.id)), "del-contact": d => confirmDel("Supprimer ce contact ?", "Le contact et l'historique de vos échanges seront supprimés.", async () => { if (await del("contacts", d.id)) closeDrawer(); }),
  "add-sugg": async d => { const c = byId("companies", d.id), p = C.PROSPECT_ROLES[+d.i]; const r = await ins("contacts", {is_suggestion: true, company_id: c.id, company_name: c.name, role: p.role, sector: c.sector, relation: "À contacter", category: p.role.startsWith("Ancien") ? "Anciens élèves IGR-IAE Rennes" : p.role.startsWith("Responsable recrutement") || p.role.startsWith("Chargé") ? "Recruteurs et RH" : "Autres", notes: p.why}); if (r) toast("Piste ajoutée : complète-la quand tu as identifié la personne"); },
  "new-company": () => companyForm(null), "edit-company": d => companyForm(byId("companies", d.id)),
  "del-company": d => { const c = byId("companies", d.id); confirmDel("Supprimer cette entreprise ?", `Les offres et contacts liés sont conservés mais ne seront plus rattachés à la fiche ${c.name}.`, async () => { if (await del("companies", c.id)) closeDrawer(); }); },
  compose: d => compose(d), "new-template": () => templateForm(null), "edit-template": d => templateForm(byId("templates", d.id)),
  upload: () => $("#upIn").click(), "new-textdoc": () => docForm(null), "edit-doc": d => docForm(byId("documents", d.id)), "open-doc": d => openDoc(byId("documents", d.id)), "copy-doc": d => copy(byId("documents", d.id).body || ""),
  attach: async d => { const v = $("#attSel").value; if (v) { await ins("document_links", {document_id: v, offer_id: d.offer, role: "joint"}); toast("Document associé"); } },
  detach: async d => { try { await q(sb.from("document_links").delete().eq("document_id", d.id).eq("offer_id", d.offer)); D.document_links = D.document_links.filter(l => !(l.document_id === d.id && l.offer_id === d.offer)); render(); } catch (e) { fail(e); } },
  cal: d => { S.calM = new Date(S.calM.getFullYear(), S.calM.getMonth() + (+d.k), 1); render(); },
  "cmp-clear": () => { S.compare.clear(); render(); }, "cmp-add": () => { const v = $("#cmpAdd").value; if (v) { if (S.compare.size >= 4) { toast("4 offres maximum"); return; } S.compare.add(v); render(); } },
  qcat: d => { S.qCat = d.k; S.qIdx = 0; render(); }, qnext: () => { S.qIdx++; render(); }, qrand: () => { S.qIdx = Math.floor(Math.random() * 100); render(); },
  "save-prep": d => { const v = {}; $("#prepForm").querySelectorAll("[name]").forEach(e => v[e.name] = e.value); upd("offers", d.id, {prep: v}).then(r => r && toast("Fiche de préparation enregistrée")); },
  "save-pitch": () => updConfig({pitch: $("#pitch").value, motivations: $("#motiv").value}).then(r => r && toast("Enregistré")),
  timer: () => { if (S.timer) { clearInterval(S.timer); S.timer = null; render(); return; } let s = 120; const el = () => $("#timer"); S.timer = setInterval(() => { s--; const e = el(); if (e) e.textContent = Math.floor(Math.max(s, 0) / 60) + ":" + pad(Math.max(s, 0) % 60); if (s <= 0) { clearInterval(S.timer); S.timer = null; toast("Temps écoulé : 2 minutes"); render(); } }, 1000); render(); },
  "save-profile": () => updConfig({display_name: $("#pName").value.trim() || null, school: $("#pSchool").value.trim() || null}).then(r => r && toast("Profil enregistré")), pwd: newPassword,
  push: async () => { const p = await Notification.requestPermission(); toast(p === "granted" ? "Notifications autorisées" : "Notifications refusées"); render(); },
  "export-json": exportJSON, "export-csv": () => download(`offres-${today()}.csv`, csv(D.offers, ["ext_id", "kind", "company_name", "title", "sector", "city", "country", "start_label", "duration", "published_at", "score", "priority", "status", "favorite", "applied_at", "follow_up_at", "interview_at", "response_at", "result", "offer_url", "apply_url", "careers_url", "link_state", "link_checked_at", "notes"]), "text/csv"),
  "export-contacts": () => download(`contacts-${today()}.csv`, csv(D.contacts, ["first_name", "last_name", "company_name", "role", "category", "city", "country", "linkedin_url", "email", "relation", "contacted_at", "next_action", "next_action_at", "notes"]), "text/csv"),
  "notif-read": async d => { await upd("notifications", d.id, {read: true}); if (d.offer) openDrawer("offer", d.offer); showNotifs(); },
  "notif-all": async () => { for (const n of D.notifications.filter(x => !x.read)) await upd("notifications", n.id, {read: true}); showNotifs(); },
  gres: d => { $("#gres").hidden = true; $("#gq").value = ""; if (d.t === "doc") { location.hash = "documents"; } else openDrawer(d.t, d.id); },
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-a]"); if (!el) { if (!e.target.closest(".notifs,#bellBtn")) { const n = $(".notifs"); if (n) n.remove(); } if (!e.target.closest(".search")) $("#gres").hidden = true; return; }
  if (el.tagName === "TR" && e.target.closest("button,a,input,select")) return;
  if (el.classList.contains("kc") && e.target.closest("select")) return;
  if (el.tagName === "A" && el.getAttribute("href") === "#") e.preventDefault();
  if (el.dataset.a !== "open-offer" || el.tagName !== "DIV" || !e.target.closest("button")) { const fn = ACT[el.dataset.a]; if (fn) { e.stopPropagation(); fn(el.dataset, el, e); } }
});
let ft;
document.addEventListener("input", e => { const el = e.target; if (!el.dataset.c) { if (el.id === "pitch") { const n = el.value.trim().split(/\s+/).filter(Boolean).length; const c = $("#pitchCount"); if (c) c.textContent = n + " mots · environ " + Math.round(n / 130 * 60) + " secondes à l'oral"; } return; }
  if (["f", "net", "comp"].includes(el.dataset.c) && el.type === "search") { clearTimeout(ft); ft = setTimeout(() => { S[el.dataset.k] = el.value; render(); }, 200); }
  if (el.dataset.c === "docq") { clearTimeout(ft); ft = setTimeout(() => { S.docQ = el.value; render(); }, 200); } });
document.addEventListener("change", e => { const el = e.target, c = el.dataset.c; if (!c) { if (el.id === "upIn") pickUpload([...el.files]); if (el.id === "impIn" && el.files[0]) importJSON(el.files[0]); return; }
  if (["f", "net", "comp"].includes(c) && el.type !== "search") { S[el.dataset.k] = el.value; render(); }
  if (c === "compT") { S.compTarget = el.checked; render(); } if (c === "status") setStatus(byId("offers", el.dataset.id), el.value);
  if (c === "cmp") { if (el.checked) { if (S.compare.size >= 4) { el.checked = false; toast("4 offres maximum"); return; } S.compare.add(el.dataset.id); } else S.compare.delete(el.dataset.id); render(); }
  if (c === "prep") { S.prepId = el.value; render(); }
  if (c === "upone" && el.files[0]) uploadFiles([el.files[0]], $("#upKind").value, $("#upVer").value.trim(), el.dataset.offer); });
function pickUpload(files) { if (!files.length) return; formDialog(`Importer ${files.length} fichier(s)`, [["kind", "Type de document", "select", C.DOC_KINDS], ["version_label", "Version (ex. CV Private Equity v2)"]], {kind: "CV principal"}, async v => { await uploadFiles(files, v.kind, v.version_label); $("#upIn").value = ""; }); }
/* glisser-déposer du Kanban */
document.addEventListener("dragstart", e => { const c = e.target.closest && e.target.closest("[data-card]"); if (c) e.dataTransfer.setData("text/plain", c.dataset.card); });
document.addEventListener("dragover", e => { const c = e.target.closest && e.target.closest("[data-col]"); if (c) { e.preventDefault(); c.classList.add("drop"); } });
document.addEventListener("dragleave", e => { const c = e.target.closest && e.target.closest("[data-col]"); if (c) c.classList.remove("drop"); });
document.addEventListener("drop", e => { const c = e.target.closest && e.target.closest("[data-col]"); if (!c) return; e.preventDefault(); c.classList.remove("drop"); const o = byId("offers", e.dataTransfer.getData("text/plain")); if (o) setStatus(o, c.dataset.col); });
/* barre supérieure */
$("#menuBtn").addEventListener("click", () => $("#side").classList.toggle("open"));
$("#scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#dlg").open) { closeDrawer(); $("#gres").hidden = true; } });
$("#gq").addEventListener("input", e => { const qq = norm(e.target.value), r = $("#gres"); if (qq.length < 2) { r.hidden = true; return; }
  const res = [...D.offers.filter(o => norm(o.company_name + " " + o.title + " " + o.city).includes(qq)).slice(0, 6).map(o => ["offer", o.id, o.company_name + " – " + o.title, (C.KINDS[o.kind] || "") + " · " + o.status]),
    ...D.companies.filter(c => norm(c.name + " " + (c.sector || "")).includes(qq)).slice(0, 4).map(c => ["company", c.id, c.name, "Entreprise · " + (c.sector || "")]),
    ...D.contacts.filter(k => norm(contactName(k) + " " + (k.company_name || "") + " " + (k.role || "")).includes(qq)).slice(0, 4).map(k => ["contact", k.id, contactName(k), "Contact · " + (k.company_name || "")]),
    ...D.documents.filter(d => norm(d.name + " " + d.kind).includes(qq)).slice(0, 3).map(d => ["doc", d.id, d.name, "Document · " + d.kind])];
  r.innerHTML = res.length ? res.map(([t, id, a, b]) => `<button data-a="gres" data-t="${t}" data-id="${esc(id)}">${esc(a)}<small>${esc(b)}</small></button>`).join("") : `<div class="empty">Aucun résultat</div>`; r.hidden = false; });
function showNotifs() { const old = $(".notifs"); if (old) old.remove(); const l = [...D.notifications].sort((a, b) => String(b.created_at).localeCompare(a.created_at)).slice(0, 30);
  document.body.insertAdjacentHTML("beforeend", `<div class="notifs"><div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0"><b>Notifications</b>${l.some(n => !n.read) ? `<button class="btn sm ghost" data-a="notif-all">Tout marquer comme lu</button>` : ""}</div>
   ${l.length ? l.map(n => `<div class="action"><span class="ic" style="${n.read ? "background:#ccd6d2" : "background:var(--coral)"}"></span><div><b>${esc(n.title)}</b><small>${esc(n.body || "")} · ${esc(new Date(n.created_at).toLocaleString("fr-FR", {dateStyle: "short", timeStyle: "short"}))}</small></div><button class="btn sm" data-a="notif-read" data-id="${esc(n.id)}" data-offer="${esc(n.offer_id || "")}">${n.offer_id ? "Voir" : "Lu"}</button></div>`).join("") : `<p class="muted">Aucune notification.</p>`}</div>`); }
$("#bellBtn").addEventListener("click", e => { e.stopPropagation(); if ($(".notifs")) $(".notifs").remove(); else showNotifs(); });
/* notifications du navigateur pour les nouveautés depuis la dernière visite */
function browserNotify() { if (!("Notification" in window) || Notification.permission !== "granted") return; const n = D.notifications.filter(x => !x.read && x.created_at > since); if (n.length) new Notification("Cap Finance", {body: n.length === 1 ? n[0].title : n.length + " nouvelles notifications"}); }
const _start = start; start = async u => { await _start(u); browserNotify(); };
/* actualisation automatique toutes les 5 minutes quand la page est visible (nouvelles offres de la veille) */
setInterval(async () => { if (user && document.visibilityState === "visible" && !$("#dlg").open) { const before = D.notifications.length; try { await loadAll(); render(); if (D.notifications.length > before) browserNotify(); } catch (e) { /* hors ligne */ } } }, 300000);
boot();
})();
