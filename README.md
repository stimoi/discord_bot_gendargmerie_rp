# Bot Gendarmerie RP

## Commandes npm
- `npm run setup`   crée / met à jour salons, rôles, panneaux (relançable sans doublons)
- `npm start`       lance le bot
- `npm run restore` liste les sauvegardes ; `npm run restore -- <fichier>` restaure (bot arrêté)

## Rester en ligne 24/7
Le bot doit tourner en permanence (PC allumé ou serveur/VPS). Avec pm2 :
```
npm i -g pm2
npm run pm2:start
pm2 save
```
Sous Windows pour le démarrage auto : `npm i -g pm2-windows-startup` puis `pm2-startup install`.

## Sauvegardes
- `data.json` est écrit de façon atomique ; copie horodatée dans `backups/` au démarrage puis chaque heure
  (72 dernières + 1 par jour sur 30 jours).
- Si `data.json` est corrompu, le bot recharge la dernière sauvegarde.
- `/sauvegarde` (admin) renvoie le fichier en pièce jointe : garde-le hors du PC/serveur.

## Intent « Server Members » (message de bienvenue)
1. Portail développeur Discord > Bot > activer **Server Members Intent**.
2. Ajouter `MEMBERS_INTENT=1` dans `.env`, relancer le bot.

## Réglages
`src/config.js` : structure des salons, emojis, conditions de promotion (`promoMinHours`, `promoMinDays`),
anti-spam (`spamMax`, `spamWindowMs`), rappel d'événement (`reminderMin`).

## Installation depuis GitHub
```
git clone <url-du-repo>
cd <dossier>
cp .env.example .env     # puis renseigner BOT_TOKEN
npm install
npm run setup            # crée salons/rôles/panneaux (une fois, ou après modification)
npm start
```
Ne jamais committer `.env` ni `data.json` (déjà dans `.gitignore`).
