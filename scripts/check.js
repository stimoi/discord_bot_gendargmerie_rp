require('dotenv').config({ quiet: true });
const { Client, GatewayIntentBits } = require('discord.js');
const cfg = require('../src/config'); const { hierarchy } = require('../src/lib');
const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once('clientReady', async () => {
  const g = await c.guilds.fetch(cfg.guildId); await g.roles.fetch(); await g.members.fetchMe();
  const h = hierarchy(g, [cfg.serviceRoleName, cfg.civilRoleName]);
  console.log('ranks', h.ranks.length, '| premier (plus bas):', h.career[0].name, '| dernier (plus haut):', h.career.at(-1).name);
  console.log('tiers', h.tiers.map(t => `${t.key}:${t.roles.length}`).join(' '), '| staff ids', h.staff.size);
  const cmds = await g.commands.fetch(); console.log('commandes', cmds.size, [...cmds.values()].map(x => x.name).join(' '));
  process.exit(0);
});
c.login(process.env.BOT_TOKEN);
