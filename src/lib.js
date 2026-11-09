const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits: P } = require('discord.js');

// ---------- état persistant + sauvegardes ----------
const FILE = path.join(__dirname, '..', 'data.json');
const BK = path.join(__dirname, '..', 'backups');
const d = { ch: {}, roles: {}, msg: {}, tickets: {}, service: {}, stats: {}, apps: {}, promo: {}, sanctions: [],
  affaires: {}, casiers: {}, mandats: {}, auditions: [], parc: {}, seq: { aff: 0, mandat: 0, parc: 0, sanction: 0 },
  leaves: {}, events: {}, lastRank: {} };

const listBackups = () => (fs.existsSync(BK) ? fs.readdirSync(BK).filter(f => /^data-.*.json$/.test(f)).sort().map(f => path.join(BK, f)) : []);
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
try { Object.assign(d, readJson(FILE)); } catch (e) {
  if (fs.existsSync(FILE)) {
    console.error('data.json illisible:', e.message);
    const last = listBackups().pop();
    if (last) { Object.assign(d, readJson(last)); console.error('restauré depuis', last); }
  }
}
// écriture atomique : fichier temporaire puis renommage
const save = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(d, null, 2)); fs.renameSync(FILE + '.tmp', FILE); };

// copie horodatée ; garde les 72 plus récentes + la dernière de chaque jour sur 30 jours
function backup() {
  if (!fs.existsSync(FILE)) return null;
  fs.mkdirSync(BK, { recursive: true });
  const n = new Date(), p = x => String(x).padStart(2, '0');
  const dest = path.join(BK, `data-${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}.json`);
  fs.copyFileSync(FILE, dest);
  const all = listBackups();
  const keep = new Set(all.slice(-72));
  const days = new Map();
  all.forEach(f => days.set(path.basename(f).slice(5, 13), f)); // dernier du jour
  [...days.values()].slice(-30).forEach(f => keep.add(f));
  all.filter(f => !keep.has(f)).forEach(f => fs.unlinkSync(f));
  return dest;
}

// ---------- noms ----------
const norm = s => s.toLowerCase().normalize('NFC').replace(/[’']/g, '-').replace(/[^\p{L}\p{N}_\s-]/gu, '')
  .trim().replace(/\s+/g, '-').replace(/-+/g, '-');

// ---------- hiérarchie des rôles ----------
const TIERS = [
  { key: 'vol', re: /volontaires/i, title: 'Gendarmes adjoints volontaires' },
  { key: 'sousoff', re: /sous-officiers/i, title: 'Sous-officiers' },
  { key: 'sub', re: /subalternes/i, title: 'Officiers subalternes' },
  { key: 'sup', re: /sup[ée]rieurs/i, title: 'Officiers supérieurs' },
  { key: 'gen', re: /g[ée]n[ée]raux/i, title: 'Officiers généraux' },
  { key: 'dir', re: /direction/i, title: 'Direction générale' },
];

// Plus petite position = plus gradé. Séparateur "---X---" placé au-dessus (position plus haute) de son groupe.
function hierarchy(guild, excluded = ['En service']) {
  excluded = [].concat(excluded);
  const botPos = guild.members.me.roles.highest.position;
  const all = [...guild.roles.cache.values()]
    .filter(r => r.id !== guild.id && !r.managed && r.position < botPos && !excluded.includes(r.name));
  const isSep = r => /^\s*-{2,}.*-{2,}\s*$/.test(r.name);
  const seps = all.filter(isSep).sort((a, b) => a.position - b.position);
  const ranks = all.filter(r => !isSep(r)).sort((a, b) => a.position - b.position); // plus gradé d'abord
  const career = [...ranks].reverse(); // plus bas grade d'abord
  const sepOf = r => seps.find(s => s.position > r.position);
  const tiers = TIERS.map(t => {
    const sep = seps.find(s => t.re.test(s.name));
    if (!sep) throw new Error(`Séparateur introuvable pour le tier ${t.key}`);
    return { ...t, sep, roles: ranks.filter(r => sepOf(r)?.id === sep.id) };
  });
  const sepPos = key => tiers.find(t => t.key === key).sep.position;
  const atLeast = key => {
    const sp = sepPos(key);
    return [...ranks.filter(r => r.position < sp), ...seps.filter(s => s.position <= sp)].map(r => r.id);
  };
  const staff = new Set(atLeast('sup'));
  return {
    ranks, career, seps, tiers, sepOf, atLeast, staff,
    personnel: [...ranks, ...seps].map(r => r.id),
    rankOf: m => ranks.find(r => m.roles.cache.has(r.id)),
    isStaff: m => m.permissions.has(P.Administrator) || m.roles.cache.some(r => staff.has(r.id)),
    tierOf: r => tiers.find(t => t.sep.id === sepOf(r)?.id),
  };
}

// ---------- permissions ----------
const VIEW = [P.ViewChannel, P.ReadMessageHistory];
const TXT_USE = [P.SendMessages, P.SendMessagesInThreads, P.AttachFiles, P.EmbedLinks, P.AddReactions];
const TXT_DENY = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions];
const VC_USE = [P.Connect, P.Speak, P.Stream, P.UseVAD];

function overwrites(guild, h, access, voice = false) {
  const m = new Map();
  const add = (id, allow = [], deny = []) => {
    const o = m.get(id) ?? { id, allow: new Set(), deny: new Set() };
    allow.forEach(x => o.allow.add(x)); deny.forEach(x => o.deny.add(x));
    m.set(id, o);
  };
  const use = voice ? VC_USE : TXT_USE;
  const [kind, arg] = access.split(':');
  const ev = guild.id;
  switch (kind) {
    case 'public':
      add(ev, VIEW, voice ? [P.Speak] : TXT_DENY);
      h.staff.forEach(id => add(id, use));
      break;
    case 'public-write':
      add(ev, [...VIEW, ...use]);
      break;
    case 'personnel':
      add(ev, [], [P.ViewChannel]);
      h.personnel.forEach(id => add(id, [...VIEW, ...use]));
      break;
    case 'personnel-read':
      add(ev, [], [P.ViewChannel, ...TXT_DENY]);
      h.personnel.forEach(id => add(id, VIEW));
      h.staff.forEach(id => add(id, use));
      break;
    case 'staff':
      add(ev, [], [P.ViewChannel]);
      h.staff.forEach(id => add(id, [...VIEW, ...use]));
      break;
    case 'min':
      add(ev, [], [P.ViewChannel]);
      h.atLeast(arg).forEach(id => add(id, [...VIEW, ...use]));
      break;
    default: throw new Error(`access inconnu: ${access}`);
  }
  return [...m.values()].map(o => ({ id: o.id, allow: [...o.allow], deny: [...o.deny] }));
}

module.exports = { d, save, backup, listBackups, FILE, norm, hierarchy, overwrites, TIERS, VIEW, TXT_USE, VC_USE };
