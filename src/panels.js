const { EmbedBuilder: E, ActionRowBuilder: R, ButtonBuilder: B, ButtonStyle: S } = require('discord.js');

const COLOR = 0x1b3a8a;
const btn = (id, label, style = S.Primary) => new B().setCustomId(id).setLabel(label).setStyle(style);
const row = (...b) => new R().addComponents(...b);
const emb = (title, desc) => new E().setColor(COLOR).setTitle(title).setDescription(desc);

// Messages fixes postés dans les salons (clé = key du salon dans config.js)
module.exports = (h, ch = k => k) => ({
  reglement: {
    embeds: [emb('Règlement du serveur', [
      '**1. Respect** — Aucune insulte, discrimination ou harcèlement. Respectez les membres et la hiérarchie.',
      '**2. Roleplay** — Restez crédible : pas de metagaming, de powergaming ni de HRP en service.',
      '**3. Hiérarchie** — Les ordres d\'un supérieur en service sont suivis, dans le respect du RP.',
      '**4. Service** — Prenez et terminez votre service via les boutons prévus. Aucune intervention hors service.',
      '**5. Radio** — Messages courts et clairs. Pas de parasitage des fréquences.',
      '**6. Rapports** — Toute intervention ou incident doit faire l\'objet d\'un rapport.',
      '**7. Sanctions** — Avertissement, blâme, mise à pied, exclusion, selon la gravité.',
      '**8. Confidentialité** — Les dossiers, casiers et procédures RP ne sortent pas du serveur.',
      '',
      'Clique sur le bouton ci-dessous pour accepter le règlement et obtenir le rôle **Civil**.',
    ].join('\n'))],
    components: [row(btn('rules:accept', 'J\'accepte le règlement', S.Success))],
  },
  informations: {
    embeds: [emb('Informations', [
      'Serveur de **Gendarmerie nationale RP**.',
      '',
      '**Services disponibles**',
      '• Effectifs et grades · Prise et fin de service',
      '• Patrouilles et interventions RP · Véhicules et équipements',
      '• Procédures judiciaires fictives · Rapports et comptes rendus',
      '• Radio et vocal · Sanctions et hiérarchie',
      '• Tickets de support · Demandes de promotion',
      '',
      `Besoin d'aide ? Ouvrez un ticket dans ${ch('tickets_panel')}.`,
    ].join('\n'))],
  },
  hierarchie: {
    embeds: [new E().setColor(COLOR).setTitle('Grades et hiérarchie')
      .setDescription('Du grade le plus élevé au plus bas.')
      .addFields([...h.tiers].reverse().map(t => ({
        name: t.title,
        value: [...t.roles].map(r => `<@&${r.id}>`).join('\n') || '—',
      })))],
  },
  candidatures: {
    embeds: [emb('Recrutement', [
      'Vous souhaitez rejoindre la Gendarmerie ?',
      '',
      '**Étapes**',
      `1. Déposez votre candidature dans ${ch('depot')}.`,
      `2. Suivez son avancement dans ${ch('suivi')}.`,
      `3. Si elle est retenue, passez l'entretien dans le vocal ${ch('entretien')}.`,
      '4. En cas de réussite, vous intégrez le grade de départ.',
      '',
      'Soyez sérieux et complet dans vos réponses.',
    ].join('\n'))],
  },
  depot: {
    embeds: [emb('Déposer une candidature', 'Cliquez sur le bouton, remplissez le formulaire, puis attendez la décision du recrutement.')],
    components: [row(btn('app:open', 'Déposer ma candidature'))],
  },
  prise: {
    embeds: [emb('Prise de service', 'Cliquez pour prendre votre service. Vous recevrez le rôle **En service**.')],
    components: [row(btn('svc:start', 'Prendre mon service', S.Success))],
  },
  fin: {
    embeds: [emb('Fin de service', 'Cliquez pour terminer votre service. Votre durée de service est enregistrée.')],
    components: [row(btn('svc:end', 'Terminer mon service', S.Danger))],
  },
  tickets_panel: {
    embeds: [emb('Support', 'Choisissez le type de ticket à ouvrir. Un membre du staff vous répondra.')],
    components: [row(
      btn('tk:open:support', 'Support'),
      btn('tk:open:recrutement', 'Recrutement'),
      btn('tk:open:signalement', 'Signalement', S.Danger),
      btn('tk:open:promotion', 'Promotion', S.Success),
      btn('tk:open:autre', 'Autre', S.Secondary),
    )],
  },
  promo_demande: {
    embeds: [emb('Demande de promotion', [
      'Cliquez pour demander une promotion. Le staff étudiera votre demande.',
      '',
      'Une seule demande toutes les 24 h. Mettez en avant votre activité et vos missions.',
    ].join('\n'))],
    components: [row(btn('promo:open', 'Demander une promotion', S.Success))],
  },
});

module.exports.btn = btn;
module.exports.row = row;
module.exports.emb = emb;
module.exports.COLOR = COLOR;
