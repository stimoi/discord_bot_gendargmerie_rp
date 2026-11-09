require('dotenv').config({ quiet: true });
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const cfg = require('./config');
const { d, save, norm, hierarchy, overwrites, TIERS } = require('./lib');
const panels = require('./panels');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let guild, h;

const ensureCategory = async (name, ow) => {
  let c = guild.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name.toLowerCase() === name.toLowerCase());
  if (!c) { c = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: ow }); console.log('+ catégorie', name); }
  else await c.permissionOverwrites.set(ow);
  return c;
};

const ensureChannel = async (cat, spec, access) => {
  const voice = spec.type === 'voice';
  const type = voice ? ChannelType.GuildVoice : ChannelType.GuildText;
  const base = norm(spec.name);
  const name = `${spec.emoji ?? cfg.emoji[base] ?? '💬'}・${base}`;
  const ow = spec.ow ?? overwrites(guild, h, spec.access ?? access, voice);
  let ch = guild.channels.cache.find(x => x.parentId === cat.id && x.type === type && norm(x.name.split('・').pop()) === base);
  if (!ch) {
    ch = await guild.channels.create({ name, type, parent: cat.id, topic: voice ? undefined : spec.topic, permissionOverwrites: ow });
    console.log('  + salon', name);
  } else {
    await ch.permissionOverwrites.set(ow);
    if (ch.name !== name) { await ch.setName(name); console.log('  ~ renommé', name); }
    if (!voice && spec.topic && ch.topic !== spec.topic) await ch.setTopic(spec.topic);
  }
  return ch;
};

const upsert = async (ch, key, payload) => {
  const id = d.msg[key];
  if (id) {
    const m = await ch.messages.fetch(id).catch(() => null);
    if (m) { await m.edit(payload); return; }
  }
  d.msg[key] = (await ch.send(payload)).id;
  save();
};

(async () => {
  await client.login(process.env.BOT_TOKEN);
  await new Promise(r => client.once('clientReady', r));
  guild = await client.guilds.fetch(cfg.guildId);
  await guild.roles.fetch();
  await guild.channels.fetch();
  await guild.members.fetchMe();

  // rôle "En service"
  let svc = guild.roles.cache.find(r => r.name === cfg.serviceRoleName);
  if (!svc) { svc = await guild.roles.create({ name: cfg.serviceRoleName, color: 0x2ecc71, hoist: true, reason: 'Système de service' }); console.log('+ rôle', svc.name); }
  d.roles.service = svc.id;
  let civil = guild.roles.cache.find(r => r.name === cfg.civilRoleName);
  if (!civil) { civil = await guild.roles.create({ name: cfg.civilRoleName, color: 0x95a5a6, reason: 'Règlement accepté' }); console.log('+ rôle', civil.name); }
  d.roles.civil = civil.id;
  save();

  h = hierarchy(guild, [cfg.serviceRoleName, cfg.civilRoleName]);
  const msgs = panels(h);

  for (const c of cfg.categories) {
    const cat = await ensureCategory(c.name, overwrites(guild, h, c.access));
    if (c.key) d.ch[c.key] = cat.id;
    for (const spec of c.channels) {
      const ch = await ensureChannel(cat, spec, c.access);
      if (spec.key) {
        d.ch[spec.key] = ch.id;
      }
    }
  }
  save();
  // panneaux : second passage pour que les mentions de salons soient résolues
  const full = panels(h, k => (d.ch[k] ? `<#${d.ch[k]}>` : k));
  for (const [key, payload] of Object.entries(full)) {
    const ch = guild.channels.cache.get(d.ch[key]);
    if (ch?.isTextBased()) await upsert(ch, key, payload);
  }

  // salons de grade : un par grade, visible par ce grade et les grades supérieurs
  const used = new Set();
  let n = cfg.gradeCategoryStart;
  for (const t of h.tiers) {
    const cat = await ensureCategory(`${n++} – ${cfg.gradeCategoryPrefix} · ${t.title.toUpperCase()}`, overwrites(guild, h, `min:${t.key}`));
    const career = [...t.roles].reverse();
    for (const r of career) {
      let name = norm(r.name);
      if (used.has(name)) name = `${name}-${t.key}`;
      used.add(name);
      // visibilité : ce grade + plus gradés
      const ids = h.ranks.filter(x => x.position <= r.position).map(x => x.id);
      const ow = [
        { id: guild.id, deny: ['ViewChannel'] },
        ...ids.map(id => ({ id, allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'AttachFiles', 'EmbedLinks', 'AddReactions'] })),
      ];
      const spec = { name, emoji: cfg.tierEmoji[t.key], ow, topic: `Salon du grade ${r.name.trim()} — accessible à ce grade et aux grades supérieurs.` };
      const ch = await ensureChannel(cat, spec, 'personnel');
      const key = `grade_${r.id}`;
      if (!d.msg[key]) {
        await upsert(ch, key, { content: `Bienvenue dans le salon des **${r.name.trim()}**. Accès : <@&${r.id}> et grades supérieurs.`, allowedMentions: { parse: [] } });
      }
    }
  }
  save();
  console.log('Setup terminé.');
  process.exit(0);
})().catch(e => { console.error('ERREUR:', e); process.exit(1); });
