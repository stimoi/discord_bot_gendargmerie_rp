// Systèmes judiciaires (affaires, casiers, mandats, auditions) et parc (véhicules/équipements).
const { EmbedBuilder, SlashCommandBuilder, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const { d, save } = require('./lib');
const { btn, row } = require('./panels');

const eph = c => ({ ...(typeof c === 'string' ? { content: c } : c), flags: MessageFlags.Ephemeral });
const pad = (p, n) => `${p}-${String(n).padStart(4, '0')}`;
const ts = t => `<t:${Math.floor(t / 1000)}:f>`;
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const MANDAT_DAYS = 7;
const MANDAT_TYPES = ['Perquisition', 'Arrestation', 'Comparution', 'Saisie', 'Écoute'];
const AUD_TYPES = ['Témoin', 'Victime', 'Suspect', 'Mis en cause'];
const STATUT_COLOR = { 'En cours': 0x3498db, 'Classée': 0x7f8c8d };

module.exports = ({ chan, H, getGuild }) => {
  const can = (m, h, tier) => m.permissions.has(P.Administrator) || m.roles.cache.some(r => h.atLeast(tier).includes(r.id));
  const needRank = async i => {
    const h = await H();
    if (!h.rankOf(i.member) && !i.member.permissions.has(P.Administrator)) { await i.reply(eph('Réservé au personnel gradé.')); return null; }
    return h;
  };
  const need = async (i, tier, label) => {
    const h = await H();
    if (!can(i.member, h, tier)) { await i.reply(eph(`Réservé aux ${label}.`)); return null; }
    return h;
  };

  // ---------- affaires ----------
  const affEmbed = a => {
    const e = new EmbedBuilder().setColor(STATUT_COLOR[a.statut]).setTitle(`${a.id} — ${a.titre}`)
      .setDescription(cut(a.description, 1500))
      .addFields({ name: 'Statut', value: a.statut, inline: true }, { name: 'Ouverte par', value: `<@${a.by}>`, inline: true },
        { name: 'Ouverte le', value: ts(a.at), inline: true });
    if (a.pieces.length) e.addFields({ name: `Pièces (${a.pieces.length})`, value: cut(a.pieces.slice(-8).map(p => `• ${cut(p.texte, 140)} — <@${p.by}>`).join('\n'), 1020) });
    if (a.auditions?.length) e.addFields({ name: 'Auditions', value: a.auditions.map(x => `#${x}`).join(', ') });
    if (a.mandats?.length) e.addFields({ name: 'Mandats', value: a.mandats.join(', ') });
    if (a.conclusion) e.addFields({ name: 'Conclusion', value: cut(a.conclusion, 1000) });
    return e;
  };
  const refreshAff = async a => {
    const m = a.msg && await chan('aff_cours')?.messages.fetch(a.msg).catch(() => null);
    if (m) await m.edit({ embeds: [affEmbed(a)] });
  };
  const getAff = async (i, id) => {
    const a = d.affaires[id.toUpperCase()];
    if (!a) await i.reply(eph(`Affaire ${id} introuvable.`));
    return a;
  };

  // ---------- parc ----------
  const parcEmbed = () => {
    const items = Object.values(d.parc);
    const fmt = k => items.filter(x => x.kind === k).map(x => `${x.holder ? '🔴' : '🟢'} **${x.id}** ${x.nom}${x.ref ? ` (${x.ref})` : ''}${x.holder ? ` — <@${x.holder}>` : ''}`).join('\n') || '—';
    return new EmbedBuilder().setColor(0x1b3a8a).setTitle('Véhicules et équipements').setTimestamp()
      .addFields({ name: 'Véhicules', value: cut(fmt('Véhicule'), 1020) }, { name: 'Équipements', value: cut(fmt('Équipement'), 1020) })
      .setFooter({ text: '🟢 disponible · 🔴 attribué' });
  };
  const refreshParc = async () => {
    const ch = chan('parc');
    if (!ch) return;
    const m = d.msg.parc_live && await ch.messages.fetch(d.msg.parc_live).catch(() => null);
    if (m) await m.edit({ embeds: [parcEmbed()] });
    else { d.msg.parc_live = (await ch.send({ embeds: [parcEmbed()] })).id; save(); }
  };
  // rend tout le matériel d'un membre (fin de service)
  const returnAll = async uid => {
    const own = Object.values(d.parc).filter(x => x.holder === uid);
    own.forEach(x => { x.holder = null; });
    if (own.length) { save(); await refreshParc(); }
    return own;
  };

  // ---------- définitions ----------
  const sub = (b, name, desc, f) => b.addSubcommand(s => f(s.setName(name).setDescription(desc)));
  const str = (n, desc, req = true, extra) => o => { o.addStringOption(x => { x.setName(n).setDescription(desc).setRequired(req); extra?.(x); return x; }); return o; };
  const chain = (s, ...fs) => fs.reduce((a, f) => f(a), s);
  const choices = arr => x => x.addChoices(...arr.map(v => ({ name: v, value: v })));

  const defs = [
    (() => { let b = new SlashCommandBuilder().setName('affaire').setDescription('Gestion des affaires');
      b = sub(b, 'ouvrir', 'Ouvrir une affaire', s => chain(s, str('titre', 'Titre'), str('description', 'Description des faits')));
      b = sub(b, 'piece', 'Ajouter une pièce / un élément', s => chain(s, str('numero', 'N° (AFF-0001)'), str('texte', 'Élément')));
      b = sub(b, 'classer', 'Classer une affaire (officier subalterne+)', s => chain(s, str('numero', 'N°'), str('conclusion', 'Conclusion')));
      b = sub(b, 'info', 'Voir une affaire', s => chain(s, str('numero', 'N°')));
      return b; })(),
    (() => { let b = new SlashCommandBuilder().setName('casier').setDescription('Casiers judiciaires');
      b = sub(b, 'ajouter', 'Ajouter une inscription', s => chain(s, str('nom', 'Nom RP de la personne'), str('infraction', 'Infraction'), str('details', 'Détails / peine', false), str('affaire', 'N° affaire liée', false)));
      b = sub(b, 'voir', 'Consulter un casier', s => chain(s, str('nom', 'Nom RP')));
      return b; })(),
    (() => { let b = new SlashCommandBuilder().setName('mandat').setDescription('Mandats');
      b = sub(b, 'emettre', 'Émettre un mandat (officier subalterne+)', s => chain(s, str('type', 'Type', true, choices(MANDAT_TYPES)), str('cible', 'Personne / lieu visé'), str('motif', 'Motif'), str('affaire', 'N° affaire liée', false)));
      return b; })(),
    (() => { let b = new SlashCommandBuilder().setName('audition').setDescription('Auditions');
      b = sub(b, 'enregistrer', 'Enregistrer une audition', s => chain(s, str('affaire', 'N° affaire'), str('personne', 'Personne entendue'), str('statut', 'Qualité', true, choices(AUD_TYPES)), str('resume', 'Compte rendu')));
      return b; })(),
    (() => { let b = new SlashCommandBuilder().setName('parc').setDescription('Véhicules et équipements');
      b = sub(b, 'ajouter', 'Ajouter au parc (staff)', s => chain(s, str('type', 'Type', true, choices(['Véhicule', 'Équipement'])), str('nom', 'Nom'), str('ref', 'Plaque / n° de série', false)));
      b = sub(b, 'retirer', 'Retirer du parc (staff)', s => chain(s, str('id', 'ID (P-0001)', true, x => x.setAutocomplete(true))));
      b = sub(b, 'prendre', 'Prendre un élément (en service)', s => chain(s, str('id', 'Élément', true, x => x.setAutocomplete(true))));
      b = sub(b, 'rendre', 'Rendre un élément', s => chain(s, str('id', 'Élément', true, x => x.setAutocomplete(true))));
      return b; })(),
  ].map(b => b.toJSON());

  // ---------- handlers ----------
  const run = {
    async affaire(i) {
      const g = i.options.getSubcommand();
      if (g === 'ouvrir') {
        if (!(await needRank(i))) return;
        const id = pad('AFF', ++d.seq.aff);
        const a = { id, titre: i.options.getString('titre'), description: i.options.getString('description'), statut: 'En cours', by: i.user.id, at: Date.now(), pieces: [], auditions: [], mandats: [] };
        const m = await chan('aff_cours').send({ embeds: [affEmbed(a)] });
        a.msg = m.id; d.affaires[id] = a; save();
        return i.reply(eph(`Affaire **${id}** ouverte : ${m.url}`));
      }
      const a = await getAff(i, i.options.getString('numero'));
      if (!a) return;
      if (g === 'info') return i.reply(eph({ embeds: [affEmbed(a)] }));
      if (a.statut === 'Classée') return i.reply(eph('Affaire déjà classée.'));
      if (g === 'piece') {
        if (!(await needRank(i))) return;
        a.pieces.push({ texte: i.options.getString('texte'), by: i.user.id, at: Date.now() }); save();
        await refreshAff(a);
        return i.reply(eph(`Pièce ajoutée à ${a.id}.`));
      }
      if (g === 'classer') {
        if (!(await need(i, 'sub', 'officiers subalternes et plus'))) return;
        a.statut = 'Classée'; a.conclusion = i.options.getString('conclusion'); a.closedBy = i.user.id; a.closedAt = Date.now();
        const old = await chan('aff_cours')?.messages.fetch(a.msg).catch(() => null);
        await old?.delete().catch(() => {});
        const m = await chan('aff_clos').send({ embeds: [affEmbed(a).addFields({ name: 'Classée par', value: `<@${i.user.id}> le ${ts(a.closedAt)}` })] });
        a.msg = m.id; save();
        return i.reply(eph(`Affaire ${a.id} classée.`));
      }
    },

    async casier(i) {
      if (!(await need(i, 'sousoff', 'sous-officiers et plus'))) return;
      const nom = i.options.getString('nom').trim();
      const key = nom.toLowerCase();
      if (i.options.getSubcommand() === 'ajouter') {
        const aff = i.options.getString('affaire')?.toUpperCase();
        if (aff && !d.affaires[aff]) return i.reply(eph(`Affaire ${aff} introuvable.`));
        const c = d.casiers[key] ??= { nom, entries: [] };
        c.entries.push({ infraction: i.options.getString('infraction'), details: i.options.getString('details') ?? '', affaire: aff ?? null, by: i.user.id, at: Date.now() });
        save();
        const ch = chan('casiers');
        const e = new EmbedBuilder().setColor(0xc0392b).setTitle(`Casier — ${c.nom}`)
          .setDescription(`**${i.options.getString('infraction')}**${i.options.getString('details') ? `\n${i.options.getString('details')}` : ''}${aff ? `\nAffaire : ${aff}` : ''}`)
          .setFooter({ text: `Inscription n°${c.entries.length} par ${i.user.tag}` }).setTimestamp();
        await ch?.send({ embeds: [e] });
        return i.reply(eph(`Inscription ajoutée au casier de **${c.nom}** (${c.entries.length} au total).`));
      }
      const c = d.casiers[key];
      if (!c) return i.reply(eph(`Aucun casier pour **${nom}** (casier vierge).`));
      const e = new EmbedBuilder().setColor(0xc0392b).setTitle(`Casier — ${c.nom}`)
        .setDescription(cut(c.entries.map((x, n) => `**${n + 1}.** ${x.infraction}${x.details ? ` — ${x.details}` : ''}${x.affaire ? ` (${x.affaire})` : ''} · ${ts(x.at)}`).join('\n'), 3800));
      return i.reply(eph({ embeds: [e] }));
    },

    async mandat(i) {
      if (!(await need(i, 'sub', 'officiers subalternes et plus'))) return;
      const aff = i.options.getString('affaire')?.toUpperCase();
      if (aff && !d.affaires[aff]) return i.reply(eph(`Affaire ${aff} introuvable.`));
      const id = pad('M', ++d.seq.mandat);
      const m = { id, type: i.options.getString('type'), cible: i.options.getString('cible'), motif: i.options.getString('motif'), affaire: aff ?? null, by: i.user.id, at: Date.now(), expire: Date.now() + MANDAT_DAYS * 864e5, statut: 'Valide' };
      const e = mandatEmbed(m);
      const msg = await chan('mandats').send({ embeds: [e], components: [row(btn(`mdt:exec:${id}`, 'Marquer exécuté', 3), btn(`mdt:cancel:${id}`, 'Annuler', 4))] });
      m.msg = msg.id; d.mandats[id] = m;
      if (aff) { d.affaires[aff].mandats.push(id); await refreshAff(d.affaires[aff]); }
      save();
      return i.reply(eph(`Mandat **${id}** émis : ${msg.url}`));
    },

    async audition(i) {
      if (!(await needRank(i))) return;
      const aff = i.options.getString('affaire').toUpperCase();
      const a = d.affaires[aff];
      if (!a) return i.reply(eph(`Affaire ${aff} introuvable.`));
      const n = d.auditions.length + 1;
      const au = { n, affaire: aff, personne: i.options.getString('personne'), statut: i.options.getString('statut'), resume: i.options.getString('resume'), by: i.user.id, at: Date.now() };
      d.auditions.push(au);
      a.auditions.push(n); save();
      const e = new EmbedBuilder().setColor(0x8e44ad).setTitle(`Audition #${n} — ${au.personne}`)
        .addFields({ name: 'Affaire', value: `${aff} — ${a.titre}`, inline: true }, { name: 'Qualité', value: au.statut, inline: true },
          { name: 'Par', value: `<@${au.by}>`, inline: true }, { name: 'Compte rendu', value: cut(au.resume, 1000) }).setTimestamp();
      await chan('auditions').send({ embeds: [e] });
      await refreshAff(a);
      return i.reply(eph(`Audition #${n} enregistrée.`));
    },

    async parc(i) {
      const g = i.options.getSubcommand();
      const h = await H();
      if (g === 'ajouter' || g === 'retirer') {
        if (!h.isStaff(i.member)) return i.reply(eph('Réservé au staff.'));
        if (g === 'ajouter') {
          const id = pad('P', ++d.seq.parc);
          d.parc[id] = { id, kind: i.options.getString('type'), nom: i.options.getString('nom'), ref: i.options.getString('ref') ?? '', holder: null };
          save(); await refreshParc();
          return i.reply(eph(`**${id}** ajouté.`));
        }
        const id = i.options.getString('id').toUpperCase();
        if (!d.parc[id]) return i.reply(eph('ID inconnu.'));
        delete d.parc[id]; save(); await refreshParc();
        return i.reply(eph(`${id} retiré.`));
      }
      const id = i.options.getString('id').toUpperCase();
      const it = d.parc[id];
      if (!it) return i.reply(eph('Élément inconnu.'));
      if (g === 'prendre') {
        if (!d.service[i.user.id]) return i.reply(eph('Tu dois être en service.'));
        if (it.holder) return i.reply(eph(`Déjà attribué à <@${it.holder}>.`));
        it.holder = i.user.id; save(); await refreshParc();
        return i.reply(eph(`Tu as pris **${it.nom}**.`));
      }
      if (it.holder !== i.user.id && !h.isStaff(i.member)) return i.reply(eph('Ce n\'est pas toi qui l\'as.'));
      it.holder = null; save(); await refreshParc();
      return i.reply(eph(`**${it.nom}** rendu.`));
    },
  };

  const mandatEmbed = m => new EmbedBuilder()
    .setColor({ Valide: 0x2ecc71, Exécuté: 0x3498db, Annulé: 0x7f8c8d, Expiré: 0x7f8c8d }[m.statut])
    .setTitle(`Mandat ${m.id} — ${m.type}`)
    .addFields({ name: 'Cible', value: m.cible, inline: true }, { name: 'Statut', value: m.statut, inline: true },
      { name: 'Expire', value: ts(m.expire), inline: true }, { name: 'Motif', value: cut(m.motif, 1000) },
      ...(m.affaire ? [{ name: 'Affaire', value: m.affaire, inline: true }] : []), { name: 'Émis par', value: `<@${m.by}>`, inline: true });

  // boutons mandat
  const buttons = {
    async mdt(i, [act, id]) {
      const m = d.mandats[id];
      if (!m) return i.reply(eph('Mandat inconnu.'));
      const h = await H();
      if (!h.rankOf(i.member) && !i.member.permissions.has(P.Administrator)) return i.reply(eph('Réservé au personnel.'));
      if (m.statut !== 'Valide') return i.reply(eph(`Mandat déjà ${m.statut.toLowerCase()}.`));
      if (act === 'cancel' && i.user.id !== m.by && !h.isStaff(i.member)) return i.reply(eph('Seul l\'émetteur ou le staff peut annuler.'));
      if (Date.now() > m.expire) m.statut = 'Expiré'; else m.statut = act === 'exec' ? 'Exécuté' : 'Annulé';
      m.closedBy = i.user.id; save();
      return i.update({ embeds: [mandatEmbed(m)], components: m.statut === 'Valide' ? i.message.components : [] });
    },
  };

  const autocomplete = async i => {
    const g = i.options.getSubcommand();
    const q = i.options.getFocused().toLowerCase();
    let items = Object.values(d.parc);
    if (g === 'prendre') items = items.filter(x => !x.holder);
    if (g === 'rendre') items = items.filter(x => x.holder === i.user.id);
    await i.respond(items.filter(x => `${x.id} ${x.nom}`.toLowerCase().includes(q)).slice(0, 25)
      .map(x => ({ name: cut(`${x.id} · ${x.kind} · ${x.nom}`, 100), value: x.id })));
  };

  // expiration auto des mandats (toutes les 10 min)
  const sweep = async () => {
    for (const m of Object.values(d.mandats)) {
      if (m.statut === 'Valide' && Date.now() > m.expire) {
        m.statut = 'Expiré'; save();
        const msg = await chan('mandats')?.messages.fetch(m.msg).catch(() => null);
        await msg?.edit({ embeds: [mandatEmbed(m)], components: [] }).catch(() => {});
      }
    }
  };
  setInterval(() => sweep().catch(() => {}), 600000);

  return { defs, run, buttons, autocomplete, returnAll, refreshParc };
};
