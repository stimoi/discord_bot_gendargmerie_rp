require('dotenv').config({ quiet: true });
const {
  Client, GatewayIntentBits, ChannelType, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, SlashCommandBuilder, AttachmentBuilder, MessageFlags, PermissionFlagsBits: P,
} = require('discord.js');
const cfg = require('./config');
const { d, save, backup, hierarchy, VIEW, TXT_USE } = require('./lib');
const { btn, row, emb, COLOR } = require('./panels');

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
if (process.env.MEMBERS_INTENT === '1') intents.push(GatewayIntentBits.GuildMembers); // à activer aussi dans le portail développeur
const client = new Client({ intents });
let guild;

const eph = c => ({ ...(typeof c === 'string' ? { content: c } : c), flags: MessageFlags.Ephemeral });
const chan = k => guild.channels.cache.get(d.ch[k]);
const H = async () => { await guild.roles.fetch(); await guild.members.fetchMe(); return hierarchy(guild, [cfg.serviceRoleName, cfg.civilRoleName]); };
const log = async p => chan('logs')?.send(typeof p === 'string' ? { content: p, allowedMentions: { parse: [] } } : p).catch(() => {});
const dm = (user, p) => user.send(p).catch(() => {});
const fmtDur = ms => { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const input = (id, label, style, ph) => new ActionRowBuilder().addComponents(
  new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(style === TextInputStyle.Short ? 80 : 900).setPlaceholder(ph ?? ''));

// ---------- grades ----------
async function applyRank(member, role, h) {
  const newSep = h.sepOf(role);
  const oldRanks = h.ranks.filter(r => r.id !== role.id && member.roles.cache.has(r.id));
  const oldSeps = h.seps.filter(s => s.id !== newSep?.id && member.roles.cache.has(s.id));
  await member.roles.add([role, ...(newSep ? [newSep] : [])]);
  const civil = d.roles.civil && member.roles.cache.has(d.roles.civil) ? [d.roles.civil] : [];
  if (oldRanks.length || oldSeps.length || civil.length) await member.roles.remove([...oldRanks, ...oldSeps, ...civil]);
  d.lastRank[member.id] = Date.now(); save();
}

// dir = +1 promotion, -1 rétrogradation. Renvoie {error} ou {from, to}
async function changeRank(execMember, target, dir, h) {
  if (!h.isStaff(execMember)) return { error: 'Réservé au staff (officiers supérieurs et plus).' };
  const cur = h.rankOf(target);
  const idx = cur ? h.career.indexOf(cur) : -1;
  const nIdx = idx + dir;
  if (dir < 0 && !cur) return { error: 'Ce membre n\'a aucun grade.' };
  const to = h.career[nIdx];
  if (!to) return { error: dir > 0 ? 'Grade maximum atteint.' : 'Grade minimum atteint.' };
  const admin = execMember.permissions.has(P.Administrator);
  const exec = h.rankOf(execMember);
  if (!admin) {
    if (!exec || exec.position >= to.position) return { error: 'Tu dois être plus gradé que le grade visé.' };
    if (cur && exec.position >= cur.position) return { error: 'Tu dois être plus gradé que le membre.' };
    if (h.tierOf(to)?.key === 'dir') return { error: 'La Direction générale est réservée aux administrateurs.' };
  }
  await applyRank(target, to, h);
  const e = new EmbedBuilder().setColor(dir > 0 ? 0x2ecc71 : 0xe67e22)
    .setTitle(dir > 0 ? 'Promotion' : 'Rétrogradation')
    .addFields({ name: 'Membre', value: `<@${target.id}>`, inline: true },
      { name: 'Ancien grade', value: cur?.name.trim() ?? '—', inline: true },
      { name: 'Nouveau grade', value: to.name.trim(), inline: true },
      { name: 'Par', value: `<@${execMember.id}>`, inline: true })
    .setTimestamp();
  return { from: cur, to, embed: e };
}

// ---------- effectifs ----------
async function updateEffectifs() {
  const ch = chan('effectifs');
  if (!ch) return;
  const ids = Object.keys(d.service);
  const e = new EmbedBuilder().setColor(COLOR).setTitle(`Effectifs en service (${ids.length})`)
    .setDescription(ids.length ? ids.map(id => `• <@${id}> — depuis <t:${Math.floor(d.service[id] / 1000)}:R>`).join('\n') : 'Personne n\'est en service.')
    .setTimestamp();
  const m = d.msg.effectifs_live && await ch.messages.fetch(d.msg.effectifs_live).catch(() => null);
  if (m) await m.edit({ embeds: [e] });
  else { d.msg.effectifs_live = (await ch.send({ embeds: [e] })).id; save(); }
}

const jud = require('./judiciaire')({ chan, H });
const extrasFactory = require('./extras');
const { activeSanction } = extrasFactory;
const ext = extrasFactory({ chan, H, getGuild: () => guild });

// ---------- commandes ----------
const commands = [
  new SlashCommandBuilder().setName('promouvoir').setDescription('Promouvoir un membre au grade supérieur')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('retrograder').setDescription('Rétrograder un membre d\'un grade')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('sanction').setDescription('Sanctionner un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
      .addChoices(...['Avertissement', 'Blâme', 'Mise à pied', 'Exclusion'].map(x => ({ name: x, value: x }))))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en jours (mise à pied : défaut 3, exclusion : indéfinie)').setMinValue(1).setMaxValue(365)),
  new SlashCommandBuilder().setName('historique-sanctions').setDescription('Voir les sanctions d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('effectifs').setDescription('Voir les effectifs en service'),
].map(c => c.toJSON()).concat(jud.defs, ext.defs);

const cmds = {
  ...jud.run,
  ...ext.run,
  async promouvoir(i) { return rankCmd(i, +1); },
  async retrograder(i) { return rankCmd(i, -1); },
  async sanction(i) {
    const h = await H();
    if (!h.isStaff(i.member)) return i.reply(eph('Réservé au staff.'));
    const user = i.options.getUser('membre'), type = i.options.getString('type'), raison = i.options.getString('raison');
    const target = await guild.members.fetch(user.id).catch(() => null);
    if (!target) return i.reply(eph('Membre introuvable.'));
    if (!i.member.permissions.has(P.Administrator)) {
      const a = h.rankOf(i.member), b = h.rankOf(target);
      if (b && (!a || a.position >= b.position)) return i.reply(eph('Tu dois être plus gradé que le membre.'));
    }
    const jours = i.options.getInteger('duree') ?? (type === 'Mise à pied' ? 3 : null);
    const s = { id: ++d.seq.sanction, user: user.id, by: i.user.id, type, raison, at: Date.now(), until: jours && (type === 'Mise à pied' || type === 'Exclusion') ? Date.now() + jours * 864e5 : null };
    d.sanctions.push(s); save();
    if ((type === 'Mise à pied' || type === 'Exclusion') && d.service[user.id]) {
      delete d.service[user.id]; save();
      await target.roles.remove(d.roles.service).catch(() => {});
      await jud.returnAll(user.id);
      await updateEffectifs();
    }
    const e = new EmbedBuilder().setColor(0xc0392b).setTitle(`${type} #${s.id}`)
      .addFields({ name: 'Membre', value: `<@${user.id}>`, inline: true }, { name: 'Par', value: `<@${i.user.id}>`, inline: true }, ...(s.until ? [{ name: 'Jusqu\'au', value: `<t:${Math.floor(s.until / 1000)}:D>`, inline: true }] : []), { name: 'Raison', value: raison })
      .setTimestamp();
    await chan('sanctions')?.send({ embeds: [e] });
    await dm(user, { embeds: [e] });
    await i.reply(eph(`Sanction #${s.id} enregistrée.`));
  },
  async 'historique-sanctions'(i) {
    const h = await H();
    if (!h.isStaff(i.member)) return i.reply(eph('Réservé au staff.'));
    const u = i.options.getUser('membre');
    const list = d.sanctions.filter(s => s.user === u.id);
    await i.reply(eph(list.length ? list.map(s => `#${s.id} · **${s.type}** · <t:${Math.floor(s.at / 1000)}:d> · ${s.raison}`).join('\n') : 'Aucune sanction.'));
  },
  async effectifs(i) {
    const ids = Object.keys(d.service);
    await i.reply(eph(ids.length ? ids.map(id => `• <@${id}> — depuis <t:${Math.floor(d.service[id] / 1000)}:R>`).join('\n') : 'Personne en service.'));
  },
};

async function rankCmd(i, dir) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const h = await H();
  const user = i.options.getUser('membre');
  const target = await guild.members.fetch(user.id).catch(() => null);
  if (!target) return i.editReply('Membre introuvable.');
  const r = await changeRank(i.member, target, dir, h);
  if (r.error) return i.editReply(r.error);
  const raison = i.options.getString('raison');
  if (raison) r.embed.addFields({ name: 'Raison', value: raison });
  await chan('promos')?.send({ embeds: [r.embed] });
  await dm(user, { embeds: [r.embed] });
  await i.editReply(`${dir > 0 ? 'Promu' : 'Rétrogradé'} : **${r.to.name.trim()}**.`);
}

// ---------- boutons / modals ----------
const handlers = {
  ...jud.buttons,
  ...ext.buttons,
  // ----- service -----
  async svc(i, [act]) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const h = await H();
    if (!h.rankOf(i.member)) return i.editReply('Tu dois avoir un grade pour utiliser le service.');
    const uid = i.user.id;
    if (act === 'start') {
      if (d.service[uid]) return i.editReply('Tu es déjà en service.');
      const sc = activeSanction(uid);
      if (sc) return i.editReply(`Service impossible : ${sc.type} en cours${sc.until ? ` jusqu'au <t:${Math.floor(sc.until / 1000)}:D>` : ''}.`);
      delete d.leaves[uid];
      d.service[uid] = Date.now(); save();
      await i.member.roles.add(d.roles.service).catch(() => {});
      await log(`🟢 <@${uid}> prend son service.`);
      await i.editReply('Service pris. Bon courage !');
    } else {
      if (!d.service[uid]) return i.editReply('Tu n\'es pas en service.');
      const ms = Date.now() - d.service[uid];
      delete d.service[uid];
      d.stats[uid] = { ms: (d.stats[uid]?.ms ?? 0) + ms, count: (d.stats[uid]?.count ?? 0) + 1, last: Date.now() }; save();
      await i.member.roles.remove(d.roles.service).catch(() => {});
      await log(`🔴 <@${uid}> termine son service (${fmtDur(ms)}). Total : ${fmtDur(d.stats[uid].ms)}.`);
      const back = await jud.returnAll(uid);
      await i.editReply(`Service terminé. Durée : **${fmtDur(ms)}**.${back.length ? `\nMatériel rendu automatiquement : ${back.map(x => x.nom).join(', ')}.` : ''}`);
    }
    await updateEffectifs();
  },

  // ----- candidatures -----
  async app(i, [act, uid]) {
    if (act === 'open') {
      if (d.apps[i.user.id]) return i.reply(eph('Tu as déjà une candidature en cours.'));
      if (d.roles.civil && !i.member.roles.cache.has(d.roles.civil)) return i.reply(eph('Accepte d\'abord le règlement (bouton dans le salon règlement).'));
      return i.showModal(new ModalBuilder().setCustomId('app:submit').setTitle('Candidature').addComponents(
        input('pseudo', 'Pseudo RP', TextInputStyle.Short), input('age', 'Âge', TextInputStyle.Short),
        input('xp', 'Expérience en roleplay', TextInputStyle.Paragraph),
        input('motiv', 'Motivations', TextInputStyle.Paragraph)));
    }
    if (act === 'submit') {
      if (d.apps[i.user.id]) return i.reply(eph('Tu as déjà une candidature en cours.'));
      const f = n => i.fields.getTextInputValue(n);
      const e = new EmbedBuilder().setColor(0xf1c40f).setTitle(`Candidature — ${f('pseudo')}`)
        .setThumbnail(i.user.displayAvatarURL())
        .addFields({ name: 'Candidat', value: `<@${i.user.id}>`, inline: true }, { name: 'Âge', value: f('age'), inline: true },
          { name: 'Expérience', value: f('xp') }, { name: 'Motivations', value: f('motiv') }, { name: 'Statut', value: 'En attente' })
        .setTimestamp();
      await chan('suivi').send({ embeds: [e], components: [row(
        btn(`app:accept:${i.user.id}`, 'Accepter', 3), btn(`app:interview:${i.user.id}`, 'Entretien', 1), btn(`app:refuse:${i.user.id}`, 'Refuser', 4))] });
      d.apps[i.user.id] = 1; save();
      return i.reply(eph('Candidature envoyée. Suis son avancement dans suivi-des-candidatures.'));
    }
    // décisions
    await i.deferUpdate();
    const h = await H();
    if (!h.isStaff(i.member)) return i.followUp(eph('Réservé au staff.'));
    const user = await client.users.fetch(uid);
    const e = EmbedBuilder.from(i.message.embeds[0]);
    const setStatus = (txt, color) => {
      const fields = e.data.fields.map(x => x.name === 'Statut' ? { ...x, value: `${txt} — par ${i.user.tag}` } : x);
      e.setFields(fields).setColor(color);
    };
    if (act === 'interview') {
      setStatus('Entretien à passer', 0x3498db);
      await i.editReply({ embeds: [e] });
      return dm(user, `Ta candidature est retenue. Rends-toi dans le vocal **entretien-recrutement** pour passer ton entretien.`);
    }
    delete d.apps[uid]; save();
    if (act === 'refuse') {
      setStatus('Refusée', 0xe74c3c);
      await i.editReply({ embeds: [e], components: [] });
      return dm(user, 'Ta candidature a été refusée. Tu pourras en redéposer une.');
    }
    const target = await guild.members.fetch(uid).catch(() => null);
    if (target) await applyRank(target, h.career[0], h);
    setStatus(target ? `Acceptée (${h.career[0].name.trim()})` : 'Acceptée (membre absent du serveur)', 0x2ecc71);
    await i.editReply({ embeds: [e], components: [] });
    await dm(user, `Félicitations, ta candidature est acceptée. Grade : **${h.career[0].name.trim()}**.`);
    await log(`✅ Candidature de <@${uid}> acceptée par <@${i.user.id}>.`);
  },

  // ----- demandes de promotion -----
  async promo(i, [act, uid]) {
    if (act === 'open') {
      const last = d.promo[i.user.id];
      if (last && Date.now() - last < 864e5) return i.reply(eph(`Prochaine demande possible <t:${Math.floor((last + 864e5) / 1000)}:R>.`));
      return i.showModal(new ModalBuilder().setCustomId('promo:submit').setTitle('Demande de promotion').addComponents(
        input('motiv', 'Pourquoi mérites-tu une promotion ?', TextInputStyle.Paragraph, 'Activité, missions, ancienneté...')));
    }
    if (act === 'submit') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const h = await H();
      const cur = h.rankOf(i.member);
      if (!cur) return i.editReply('Tu n\'as pas de grade.');
      const next = h.career[h.career.indexOf(cur) + 1];
      if (!next) return i.editReply('Tu as déjà le grade maximum.');
      const st = d.stats[i.user.id]?.ms ?? 0;
      if (st < cfg.promoMinHours * 3600000) return i.editReply(`Conditions non remplies : ${cfg.promoMinHours} h de service minimum (tu as ${fmtDur(st)}).`);
      const lr = d.lastRank[i.user.id];
      if (lr && Date.now() - lr < cfg.promoMinDays * 864e5) return i.editReply(`Conditions non remplies : ${cfg.promoMinDays} jours minimum depuis ton dernier changement de grade.`);
      d.promo[i.user.id] = Date.now(); save();
      const e = new EmbedBuilder().setColor(0xf1c40f).setTitle('Demande de promotion')
        .addFields({ name: 'Membre', value: `<@${i.user.id}>`, inline: true }, { name: 'Grade actuel', value: cur.name.trim(), inline: true },
          { name: 'Grade visé', value: next.name.trim(), inline: true }, { name: 'Motivation', value: i.fields.getTextInputValue('motiv') },
          { name: 'Statut', value: 'En attente' }).setTimestamp();
      await chan('promo_valid').send({ embeds: [e], components: [row(btn(`promo:ok:${i.user.id}`, 'Accepter', 3), btn(`promo:no:${i.user.id}`, 'Refuser', 4))] });
      return i.editReply('Demande envoyée au staff.');
    }
    await i.deferUpdate();
    const h = await H();
    if (!h.isStaff(i.member)) return i.followUp(eph('Réservé au staff.'));
    const e = EmbedBuilder.from(i.message.embeds[0]);
    const user = await client.users.fetch(uid);
    const setStatus = (txt, color) => e.setColor(color).setFields(e.data.fields.map(x => x.name === 'Statut' ? { ...x, value: `${txt} — par ${i.user.tag}` } : x));
    if (act === 'no') {
      setStatus('Refusée', 0xe74c3c);
      await i.editReply({ embeds: [e], components: [] });
      return dm(user, 'Ta demande de promotion a été refusée.');
    }
    const target = await guild.members.fetch(uid).catch(() => null);
    if (!target) return i.followUp(eph('Membre absent du serveur.'));
    const r = await changeRank(i.member, target, +1, h);
    if (r.error) return i.followUp(eph(r.error));
    setStatus(`Acceptée (${r.to.name.trim()})`, 0x2ecc71);
    await i.editReply({ embeds: [e], components: [] });
    await chan('promos')?.send({ embeds: [r.embed] });
    await dm(user, { embeds: [r.embed] });
  },

  // ----- tickets -----
  async tk(i, [act, type]) {
    if (act === 'open') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const open = Object.entries(d.tickets).find(([, t]) => t.owner === i.user.id);
      if (open && guild.channels.cache.has(open[0])) return i.editReply(`Tu as déjà un ticket ouvert : <#${open[0]}>`);
      const h = await H();
      const ow = [
        { id: guild.id, deny: [P.ViewChannel] },
        { id: i.user.id, allow: [...VIEW, ...TXT_USE] },
        ...[...h.staff].map(id => ({ id, allow: [...VIEW, ...TXT_USE] })),
      ];
      const slug = i.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'membre';
      const ch = await guild.channels.create({ name: `${type}-${slug}`, type: ChannelType.GuildText, parent: d.ch.tickets_cat, permissionOverwrites: ow });
      d.tickets[ch.id] = { owner: i.user.id, type, at: Date.now() }; save();
      await ch.send({
        content: `<@${i.user.id}>`,
        embeds: [emb(`Ticket — ${type}`, 'Explique ta demande, un membre du staff va te répondre.')],
        components: [row(btn('tk:claim', 'Prendre en charge', 3), btn('tk:close', 'Fermer', 4))],
      });
      await chan('tickets_logs')?.send({ content: `📩 Ticket **${type}** ouvert par <@${i.user.id}> : <#${ch.id}>`, allowedMentions: { parse: [] } });
      return i.editReply(`Ticket créé : <#${ch.id}>`);
    }
    const t = d.tickets[i.channelId];
    if (!t) return i.reply(eph('Ticket inconnu.'));
    const h = await H();
    const staff = h.isStaff(i.member);
    if (act === 'claim') {
      if (!staff) return i.reply(eph('Réservé au staff.'));
      if (t.claimed) return i.reply(eph(`Déjà pris en charge par <@${t.claimed}>.`));
      t.claimed = i.user.id; save();
      return i.reply({ content: `🛠️ Ticket pris en charge par <@${i.user.id}>.`, allowedMentions: { parse: [] } });
    }
    if (act === 'close') {
      if (!staff && i.user.id !== t.owner) return i.reply(eph('Tu ne peux pas fermer ce ticket.'));
      await i.reply('Fermeture du ticket dans 5 secondes...');
      let all = [], before;
      for (let n = 0; n < 5; n++) {
        const batch = await i.channel.messages.fetch({ limit: 100, before });
        if (!batch.size) break;
        all.push(...batch.values()); before = batch.last().id;
      }
      const text = all.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${m.embeds.length ? ' [embed]' : ''}${m.attachments.size ? ' ' + [...m.attachments.values()].map(a => a.url).join(' ') : ''}`).join('\n');
      await chan('tickets_logs')?.send({
        content: `🔒 Ticket **${t.type}** de <@${t.owner}> fermé par <@${i.user.id}>${t.claimed ? ` (pris en charge par <@${t.claimed}>)` : ''}.`,
        allowedMentions: { parse: [] },
        files: [new AttachmentBuilder(Buffer.from(text || 'vide', 'utf8'), { name: `${i.channel.name}.txt` })],
      });
      delete d.tickets[i.channelId]; save();
      setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
  },
};

client.on('interactionCreate', async i => {
  try {
    if (i.isAutocomplete()) return await jud.autocomplete(i);
    if (i.isChatInputCommand()) return await cmds[i.commandName]?.(i);
    if (i.isButton() || i.isModalSubmit()) {
      const [ns, ...args] = i.customId.split(':');
      return await handlers[ns]?.(i, args);
    }
  } catch (e) {
    console.error(e);
    const msg = eph('Erreur interne, réessaie.');
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {}); else i.reply(msg).catch(() => {});
  }
});

client.once('clientReady', async () => {
  guild = await client.guilds.fetch(cfg.guildId);
  await guild.channels.fetch();
  await guild.commands.set(commands).then(() => console.log('Commandes enregistrées.'), e => console.error('Commandes KO:', e.message));
  await updateEffectifs().catch(console.error);
  await jud.refreshParc().catch(console.error);
  backup();
  setInterval(() => { try { backup(); } catch (e) { console.error('backup:', e.message); } }, 3600000);
  setInterval(() => ext.tick().catch(console.error), 60000);
  console.log(`Bot prêt : ${client.user.tag}`);
});

for (const ev of ['roleCreate', 'roleUpdate', 'roleDelete']) client.on(ev, () => ext.refreshHierarchie());
client.on('messageCreate', m => ext.onMessage(m).catch(() => {}));
if (process.env.MEMBERS_INTENT === '1') client.on('guildMemberAdd', m => ext.onMemberAdd(m).catch(() => {}));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));

client.login(process.env.BOT_TOKEN);
