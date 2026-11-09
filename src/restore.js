// Usage : npm run restore            -> liste les sauvegardes
//         npm run restore -- <nom>   -> restaure (copie l'actuel en data.before-restore.json)
const fs = require('fs');
const path = require('path');
const { listBackups, FILE } = require('./lib');
const arg = process.argv[2];
const all = listBackups();
if (!arg) { console.log(all.length ? all.map(f => path.basename(f)).join('\n') : 'Aucune sauvegarde.'); process.exit(0); }
const f = all.find(x => path.basename(x) === arg || path.basename(x) === `${arg}.json`);
if (!f) { console.error('Sauvegarde introuvable. Lance sans argument pour lister.'); process.exit(1); }
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE.replace('data.json', 'data.before-restore.json'));
fs.copyFileSync(f, FILE);
console.log('Restauré :', path.basename(f), '(arrêter le bot avant, puis le relancer)');
