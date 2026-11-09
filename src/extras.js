// Profil, planning, congés, inactifs, anti-spam, bienvenue, règlement, sauvegarde, MAJ hiérarchie.
const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const path = require('path');
const cfg = require('./config');
const { d, save, backup, FILE } = require('./lib');
const { btn, row, COLOR } = require('./panels');
const panels = require('./panels');

const eph = c => ({ ...(typeof c === 'string' ? { content: c } : c), flags: MessageFlags.Ephemeral });
const ts = (t, f = 'f') => `<t:${Math.floor(t / 1000)}:${f}>`;
const dur = ms => { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const DAY = 864e5;

// sanction bloquante en cours ? (mise à pied / exclusion, non levée, non expirée)
const activeSanction = uid => d.sanctions.find(s => s.user === uid && !s.lifted
  && (s.type === 'Mise à pied' || s.type === 'Exclusion') && (!s.until || s.until > Date.now()));

module.exports = ({ chan, H, getGuild }) => {
  const staffOnly = async i => {
    const h = await H();
    if (!h.isStaff(i.member)) { await i.reply(eph('Réservé au staff.')); return null; }
    return h;
  };

  // ---------- définitions ----------
  const defs = [
    new SlashCommandBuilder().setName('profil').setDescription('Fiche d\'un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre (toi par défaut)')),
    new SlashCommandBuilder().setName('inactifs').setDescription('Membres sans service depuis N jours (staff)')
      .addIntegerOption(o => o.setName('jours').setDescription('Défaut 14').setMinValue(1).setMaxValue(365)),
    new SlashCommandBuilder().setName('conge').setDescription('Congés et absences')
      .addSubcommand(s => s.setName('declarer').setDescription('Déclarer une absence')
        .addIntegerOption(o => o.setName('jours').setDescription('Durée en jours').setRequired(true).setMinValue(1).setMaxValue(60))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)))
      .addSubcommand(s => s.setName('retour').setDescription('Mettre fin à ton absence')),
    new SlashCommandBuilder().setName('planning').setDescription('Planning des opérations')
      .addSubcommand(s => s.setName('creer').setDescription('Créer un événement (staff)')
        .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true))
        .addStringOption(o => o.setName('date').setDescription('JJ/MM/AAAA HH:MM').setRequired(true))
        .addIntegerOption(o => o.setName('places').setDescription('Nombre de places (0 = illimité)').setMinValue(0).setMaxValue(100)))
      .addSubcommand(s => s.setName('annuler').setDescription('Annuler un événement (staff)')
        .addIntegerOption(o => o.setName('id').setDescription('N° événement').setRequired(true))),
    new SlashCommandBuilder().setName('sauvegarde').setDescription('Sauvegarde et envoie data.json (administrateur)'),
    new SlashCommandBuilder().setName('sanction-lever').setDescription('Lever une sanction (staff)')
      .addIntegerOption(o => o.setName('id').setDescription('N° sanction').setRequired(true)),
  ].map(b => b.toJSON());

  // ---------- planning ----------
  const evEmbed = e => {
    const full = e.places && e.inscrits.length >= e.places;
    return new EmbedBuilder().setColor(e.done ? 0x7f8c8d : COLOR).setTitle(`#${e.id} — ${e.titre}`)
      .addFields({ name: 'Date', value: `${ts(e.at)} (${ts(e.at, 'R')})`, inline: true },
        { name: 'Places', value: `${e.inscrits.length}${e.places ? ` / ${e.places}` : ''}${full ? ' (complet)' : ''}`, inline: true },
        { name: 'Organisateur', value: `<@${e.by}>`, inline: true },
        { name: 'Inscrits', value: e.inscrits.map(u => `<@${u}>`).join(', ') || '—' })
      .setFooter({ text: e.done ? 'Terminé / annulé' : 'Inscription via les boutons' });
  };
  const evButtons = e => (e.done ? [] : [row(btn(`plan:join:${e.id}`, 'S\'inscrire', 3), btn(`plan:leave:${e.id}`, 'Se désister', 2))]);
  const refreshEv = async e => {
    const m = await chan('planning')?.messages.fetch(e.msg).catch(() => null);
    await m?.edit({ embeds: [evEmbed(e)], components: evButtons(e) }).catch(() => {});
  };
  const parseDate = s => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[:h](\d{2})$/.exec(s.trim());
    if (!m) return null;
    const t = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
    return Number.isNaN(t) ? null : t;
  };

  // ---------- commandes ----------
  const run = {
    async profil(i) {
      const h = await H();
      if (!h.rankOf(i.member) && !i.member.permissions.has(P.Administrator)) return i.reply(eph('Réservé au personnel.'));
      const user = i.options.getUser('membre') ?? i.user;
      const m = await getGuild().members.fetch(user.id).catch(() => null);
      if (!m) return i.reply(eph('Membre introuvable.'));
      const rank = h.rankOf(m), st = d.stats[user.id] ?? { ms: 0, count: 0 };
      const sanc = d.sanctions.filter(s => s.user === user.id);
      const leave = d.leaves[user.id];
      const e = new EmbedBuilder().setColor(COLOR).setTitle(`Profil — ${m.displayName}`).setThumbnail(m.displayAvatarURL())
        .addFields(
          { name: 'Grade', value: rank ? rank.name.trim() : 'Aucun', inline: true },
          { name: 'Palier', value: rank ? (h.tierOf(rank)?.title ?? '—') : '—', inline: true },
          { name: 'En service', value: d.service[user.id] ? `Oui (depuis ${ts(d.service[user.id], 'R')})` : 'Non', inline: true },
          { name: 'Heures de service', value: dur(st.ms + (d.service[user.id] ? Date.now() - d.service[user.id] : 0)), inline: true },
          { name: 'Services effectués', value: String(st.count), inline: true },
          { name: 'Dernière promotion', value: d.lastRank[user.id] ? ts(d.lastRank[user.id], 'D') : '—', inline: true },
          { name: 'Sanctions', value: `${sanc.length}${activeSanction(user.id) ? ' (une en cours)' : ''}`, inline: true },
          { name: 'Absence', value: leave && leave.until > Date.now() ? `Jusqu'au ${ts(leave.until, 'D')}` : '—', inline: true });
      return i.reply(eph({ embeds: [e] }));
    },

    async inactifs(i) {
      if (!(await staffOnly(i))) return;
      const jours = i.options.getInteger('jours') ?? 14;
      const limit = Date.now() - jours * DAY;
      const list = Object.entries(d.stats)
        .filter(([uid, s]) => (s.last ?? 0) < limit && !d.service[uid] && !(d.leaves[uid]?.until > Date.now()))
        .sort((a, b) => (a[1].last ?? 0) - (b[1].last ?? 0));
      return i.reply(eph(list.length
        ? `**Inactifs depuis ${jours} j ou plus** (hors absence déclarée) :\n${list.slice(0, 40).map(([uid, s]) => `• <@${uid}> — ${s.last ? ts(s.last, 'R') : 'date inconnue'}`).join('\n')}`
        : `Aucun inactif depuis ${jours} jours.`));
    },

    async conge(i) {
      if (i.options.getSubcommand() === 'retour') {
        if (!d.leaves[i.user.id]) return i.reply(eph('Aucune absence déclarée.'));
        delete d.leaves[i.user.id]; save();
        await chan('conges')?.send({ content: `✅ <@${i.user.id}> est de retour.`, allowedMentions: { parse: [] } });
        return i.reply(eph('Bon retour !'));
      }
      const h = await H();
      if (!h.rankOf(i.member)) return i.reply(eph('Réservé au personnel.'));
      const jours = i.options.getInteger('jours'), raison = i.options.getString('raison');
      d.leaves[i.user.id] = { until: Date.now() + jours * DAY, raison, at: Date.now() }; save();
      const e = new EmbedBuilder().setColor(0xe67e22).setTitle('Absence déclarée')
        .addFields({ name: 'Membre', value: `<@${i.user.id}>`, inline: true }, { name: 'Jusqu\'au', value: ts(d.leaves[i.user.id].until, 'D'), inline: true }, { name: 'Raison', value: raison.slice(0, 900) });
      await chan('conges')?.send({ embeds: [e] });
      return i.reply(eph(`Absence enregistrée jusqu'au ${ts(d.leaves[i.user.id].until, 'D')}.`));
    },

    async planning(i) {
      if (!(await staffOnly(i))) return;
      if (i.options.getSubcommand() === 'annuler') {
        const e = d.events[i.options.getInteger('id')];
        if (!e || e.done) return i.reply(eph('Événement introuvable ou terminé.'));
        e.done = true; save(); await refreshEv(e);
        return i.reply(eph(`Événement #${e.id} annulé.`));
      }
      const at = parseDate(i.options.getString('date'));
      if (!at || at < Date.now()) return i.reply(eph('Date invalide ou passée. Format : JJ/MM/AAAA HH:MM'));
      const id = (d.seq.event = (d.seq.event ?? 0) + 1);
      const e = { id, titre: i.options.getString('titre'), at, places: i.options.getInteger('places') ?? 0, by: i.user.id, inscrits: [], reminded: false, done: false };
      const m = await chan('planning').send({ embeds: [evEmbed(e)], components: evButtons(e) });
      e.msg = m.id; d.events[id] = e; save();
      return i.reply(eph(`Événement #${id} créé : ${m.url}`));
    },

    async sauvegarde(i) {
      if (!i.member.permissions.has(P.Administrator)) return i.reply(eph('Réservé aux administrateurs.'));
      const f = backup();
      return i.reply(eph({ content: `Sauvegarde locale : \`${f ? path.basename(f) : '—'}\`. Copie jointe, garde-la hors de ce PC.`, files: [new AttachmentBuilder(FILE, { name: 'data.json' })] }));
    },

    async 'sanction-lever'(i) {
      if (!(await staffOnly(i))) return;
      const s = d.sanctions.find(x => x.id === i.options.getInteger('id'));
      if (!s) return i.reply(eph('Sanction introuvable.'));
      if (s.lifted) return i.reply(eph('Déjà levée.'));
      s.lifted = true; s.liftedBy = i.user.id; s.liftedAt = Date.now(); save();
      await chan('sanctions')?.send({ content: `♻️ Sanction #${s.id} (${s.type}) de <@${s.user}> levée par <@${i.user.id}>.`, allowedMentions: { parse: [] } });
      return i.reply(eph(`Sanction #${s.id} levée.`));
    },
  };

  // ---------- boutons ----------
  const buttons = {
    async rules(i) {
      if (!d.roles.civil) return i.reply(eph('Rôle non configuré (lance npm run setup).'));
      if (i.member.roles.cache.has(d.roles.civil)) return i.reply(eph('Tu as déjà accepté le règlement.'));
      await i.member.roles.add(d.roles.civil);
      return i.reply(eph('Règlement accepté, rôle **Civil** attribué. Bienvenue !'));
    },
    async plan(i, [act, id]) {
      const e = d.events[id];
      if (!e || e.done) return i.reply(eph('Événement terminé ou annulé.'));
      const h = await H();
      if (!h.rankOf(i.member)) return i.reply(eph('Réservé au personnel.'));
      const has = e.inscrits.includes(i.user.id);
      if (act === 'join') {
        if (has) return i.reply(eph('Déjà inscrit.'));
        if (e.places && e.inscrits.length >= e.places) return i.reply(eph('Complet.'));
        e.inscrits.push(i.user.id);
      } else {
        if (!has) return i.reply(eph('Tu n\'es pas inscrit.'));
        e.inscrits = e.inscrits.filter(u => u !== i.user.id);
      }
      save();
      return i.update({ embeds: [evEmbed(e)], components: evButtons(e) });
    },
  };

  // ---------- tâches planifiées ----------
  const tick = async () => {
    const now = Date.now();
    for (const e of Object.values(d.events)) {
      if (e.done) continue;
      if (!e.reminded && e.at - now <= cfg.reminderMin * 60000 && e.at > now) {
        e.reminded = true; save();
        const mentions = e.inscrits.map(u => `<@${u}>`).join(' ');
        await chan('patrouilles')?.send({ content: `⏰ **${e.titre}** commence ${ts(e.at, 'R')}. ${mentions}` });
      }
      if (now - e.at > 2 * 3600000) { e.done = true; save(); await refreshEv(e); }
    }
    for (const [uid, l] of Object.entries(d.leaves)) if (l.until < now) { delete d.leaves[uid]; save(); }
  };

  // ---------- anti-spam (nombre de messages, sans lire leur contenu) ----------
  const hits = new Map();
  const onMessage = async msg => {
    if (!msg.guild || msg.author.bot || !msg.member) return;
    const now = Date.now();
    const arr = (hits.get(msg.author.id) ?? []).filter(t => now - t < cfg.spamWindowMs);
    arr.push(now); hits.set(msg.author.id, arr);
    if (arr.length < cfg.spamMax) return;
    hits.delete(msg.author.id);
    const h = await H();
    if (h.isStaff(msg.member) || !msg.member.moderatable) return;
    await msg.member.timeout(5 * 60000, 'Anti-spam').catch(() => {});
    await chan('logs')?.send({ content: `🛡️ Anti-spam : <@${msg.author.id}> mis en sourdine 5 min dans <#${msg.channelId}>.`, allowedMentions: { parse: [] } });
  };

  // ---------- bienvenue (nécessite l'intent Server Members : MEMBERS_INTENT=1) ----------
  const onMemberAdd = async m => {
    await chan('bienvenue')?.send({
      content: `Bienvenue <@${m.id}> ! Lis le règlement (${d.ch.reglement ? `<#${d.ch.reglement}>` : 'règlement'}) et accepte-le pour obtenir le rôle Civil.`,
    });
  };

  // ---------- MAJ auto du message hiérarchie quand les rôles changent ----------
  let timer;
  const refreshHierarchie = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const h = await H();
        const ch = chan('hierarchie');
        const msg = d.msg.hierarchie && await ch?.messages.fetch(d.msg.hierarchie).catch(() => null);
        if (msg) await msg.edit(panels(h, k => (d.ch[k] ? `<#${d.ch[k]}>` : k)).hierarchie);
      } catch (e) { console.error('MAJ hiérarchie:', e.message); }
    }, 20000);
  };

  return { defs, run, buttons, tick, onMessage, onMemberAdd, refreshHierarchie };
};
module.exports.activeSanction = activeSanction;
