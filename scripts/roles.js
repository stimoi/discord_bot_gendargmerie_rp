require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once('ready', async () => {
  const g = await c.guilds.fetch('1569073946467368970');
  await g.roles.fetch();
  const me = await g.members.fetchMe();
  console.log('Bot:', c.user.tag, '| perms admin:', me.permissions.has('Administrator'), '| top role pos:', me.roles.highest.position);
  [...g.roles.cache.values()].sort((a, b) => b.position - a.position)
    .forEach(r => console.log(String(r.position).padStart(3), r.id, r.name, r.managed ? '(managed)' : '', r.permissions.has('Administrator') ? '[ADMIN]' : ''));
  const chans = await g.channels.fetch();
  console.log('Channels existants:', chans.size);
  chans.forEach(ch => console.log(' -', ch.type, ch.name));
  process.exit(0);
});
c.login(process.env.BOT_TOKEN).catch(e => { console.error('LOGIN FAIL:', e.message); process.exit(1); });
