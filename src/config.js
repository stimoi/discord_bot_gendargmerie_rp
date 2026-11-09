// Structure du serveur. access: public | public-write | personnel | personnel-read | staff | min:<tier>
// tiers: vol < sousoff < sub < sup < gen < dir
const T = 'text';
const V = 'voice';

module.exports = {
  guildId: '1569073946467368970',
  serviceRoleName: 'En service',
  civilRoleName: 'Civil',
  promoMinHours: 10, // heures de service minimum pour demander une promotion
  promoMinDays: 3, // délai minimum depuis le dernier changement de grade
  spamMax: 8, spamWindowMs: 6000, // anti-spam : messages max par fenêtre
  reminderMin: 15, // rappel avant un événement du planning
  categories: [
    {
      name: '01 – ACCUEIL', access: 'public',
      channels: [
        { key: 'bienvenue', name: 'bienvenue', topic: 'Bienvenue aux nouveaux arrivants.' },
        { key: 'annonces', name: 'annonces', topic: 'Annonces officielles de la Gendarmerie.' },
        { key: 'reglement', name: 'règlement', topic: 'Règlement du serveur. Sa lecture est obligatoire.' },
        { key: 'informations', name: 'informations', topic: 'Informations générales sur le serveur et ses services.' },
        { key: 'presentations', name: 'présentations', topic: 'Présentez-vous ici.', access: 'public-write' },
        { key: 'hierarchie', name: 'grades-et-hiérarchie', topic: 'Liste des grades, du plus élevé au plus bas.' },
      ],
    },
    {
      name: '02 – RECRUTEMENT', access: 'public',
      channels: [
        { key: 'candidatures', name: 'candidatures', topic: 'Conditions et déroulement du recrutement.' },
        { key: 'depot', name: 'déposer-une-candidature', topic: 'Cliquez sur le bouton pour déposer votre candidature.' },
        { key: 'suivi', name: 'suivi-des-candidatures', topic: 'Suivi des candidatures en cours.' },
        { key: 'entretien', name: 'entretien-recrutement', type: V, access: 'public-write' },
      ],
    },
    {
      name: '03 – SERVICE', access: 'personnel',
      channels: [
        { key: 'prise', name: 'prise-de-service', access: 'personnel-read', topic: 'Bouton de prise de service.' },
        { key: 'fin', name: 'fin-de-service', access: 'personnel-read', topic: 'Bouton de fin de service.' },
        { key: 'effectifs', name: 'effectifs-en-service', access: 'personnel-read', topic: 'Effectifs actuellement en service (mis à jour automatiquement).' },
        { key: 'patrouilles', name: 'patrouilles', topic: 'Annonces et suivi des patrouilles RP.' },
        { key: 'parc', name: 'véhicules-et-équipements', access: 'personnel-read', topic: 'Parc en temps réel (/parc).' },
        { key: 'conges', name: 'congés-et-absences', access: 'personnel-read', topic: 'Congés et absences déclarés (/conge).' },
        { key: 'planning', name: 'planning', access: 'personnel-read', topic: 'Planning des services et opérations.' },
      ],
    },
    {
      name: '04 – COMMUNICATION RADIO', access: 'personnel',
      channels: [
        { name: 'radio-générale', type: V },
        { name: 'radio-patrouille-1', type: V },
        { name: 'radio-patrouille-2', type: V },
        { name: 'radio-intervention', type: V },
        { name: 'radio-commandement', type: V, access: 'min:sub' },
      ],
    },
    {
      name: '05 – ZONES OPÉRATIONNELLES', access: 'personnel',
      channels: [
        { name: 'secteur-nord' }, { name: 'secteur-sud' }, { name: 'secteur-est' },
        { name: 'secteur-ouest' }, { name: 'secteur-centre' },
        { name: 'carte-des-secteurs', access: 'personnel-read', topic: 'Carte et découpage des secteurs.' },
      ],
    },
    {
      name: '06 – SERVICE JUDICIAIRE', access: 'personnel',
      channels: [
        { key: 'aff_cours', name: 'affaires-en-cours', access: 'personnel-read', topic: 'Affaires ouvertes (/affaire).' },
        { key: 'aff_clos', name: 'affaires-classées', access: 'personnel-read', topic: 'Affaires classées.' },
        { name: 'procédures-judiciaires', access: 'personnel-read', topic: 'Guide des procédures.' },
        { key: 'casiers', name: 'casiers-judiciaires', access: 'min:sousoff', topic: 'Casiers (/casier). Sous-officiers et plus.' },
        { key: 'auditions', name: 'auditions-rp', access: 'personnel-read', topic: 'Auditions enregistrées (/audition).' },
        { key: 'mandats', name: 'mandats-rp', access: 'personnel-read', topic: 'Mandats émis (/mandat).' },
      ],
    },
    {
      name: '07 – RAPPORTS', access: 'personnel',
      channels: [
        { name: 'rapports-de-mission' },
        { name: 'rapports-d-intervention' },
        { name: 'rapports-de-patrouille' },
        { name: 'comptes-rendus' },
        { name: 'incidents-de-service' },
      ],
    },
    {
      name: '08 – ADMINISTRATION', access: 'staff',
      channels: [
        { name: 'état-major' },
        { name: 'gestion-des-effectifs' },
        { name: 'dossiers-du-personnel' },
        { name: 'gestion-du-serveur', access: 'min:dir' },
        { name: 'salon-des-fondateurs', access: 'min:dir' },
      ],
    },
    {
      name: '09 – SUPPORT', access: 'public',
      channels: [
        { key: 'tickets_panel', name: 'créer-un-ticket', topic: 'Ouvrez un ticket pour contacter le staff.' },
        { key: 'tickets_logs', name: 'logs-tickets', access: 'staff', topic: 'Transcriptions des tickets fermés.' },
      ],
    },
    { key: 'tickets_cat', name: '10 – TICKETS', access: 'staff', channels: [] },
    {
      name: '11 – PROMOTIONS ET SANCTIONS', access: 'personnel',
      channels: [
        { key: 'promo_demande', name: 'demande-de-promotion', access: 'personnel-read', topic: 'Demandez une promotion via le bouton.' },
        { key: 'promo_valid', name: 'validation-promotions', access: 'staff', topic: 'Demandes de promotion à valider.' },
        { key: 'promos', name: 'promotions', access: 'personnel-read', topic: 'Promotions et rétrogradations.' },
        { key: 'sanctions', name: 'registre-des-sanctions', access: 'staff', topic: 'Registre des sanctions.' },
        { key: 'logs', name: 'logs-bot', access: 'staff', topic: 'Journal du bot (services, recrutement, grades).' },
      ],
    },
  ],
  // une catégorie par tier, un salon par grade (visible par le grade et les grades supérieurs)
  gradeCategoryPrefix: 'GRADES',
  gradeCategoryStart: 12,
};

// emoji par salon (clé = nom normalisé), affiché "emoji・nom"
module.exports.emoji = {
  'annonces': '📢', 'règlement': '📜', 'informations': '📋', 'présentations': '👋', 'grades-et-hiérarchie': '🎖️',
  'candidatures': '📄', 'déposer-une-candidature': '📥', 'suivi-des-candidatures': '📋', 'entretien-recrutement': '🎙️',
  'prise-de-service': '🟢', 'fin-de-service': '🔴', 'effectifs-en-service': '📊', 'patrouilles': '🚔',
  'véhicules-et-équipements': '🚙', 'planning': '📋', 'congés-et-absences': '🏖️', 'bienvenue': '🎉',
  'radio-générale': '📻', 'radio-patrouille-1': '🚓', 'radio-patrouille-2': '🚓', 'radio-intervention': '🚨', 'radio-commandement': '🎙️',
  'secteur-nord': '📍', 'secteur-sud': '📍', 'secteur-est': '📍', 'secteur-ouest': '📍', 'secteur-centre': '📍', 'carte-des-secteurs': '🗺️',
  'affaires-en-cours': '📁', 'affaires-classées': '📂', 'procédures-judiciaires': '⚖️', 'casiers-judiciaires': '🔒', 'auditions-rp': '📝', 'mandats-rp': '📑',
  'rapports-de-mission': '📝', 'rapports-d-intervention': '🚨', 'rapports-de-patrouille': '🚔', 'comptes-rendus': '📋', 'incidents-de-service': '⚠️',
  'état-major': '🎖️', 'gestion-des-effectifs': '📊', 'dossiers-du-personnel': '📁', 'gestion-du-serveur': '⚙️', 'salon-des-fondateurs': '🔐',
  'créer-un-ticket': '🎫', 'logs-tickets': '🗃️',
  'demande-de-promotion': '⬆️', 'validation-promotions': '✅', 'promotions': '🏅', 'registre-des-sanctions': '🚫', 'logs-bot': '🤖',
};
module.exports.tierEmoji = { vol: '🔰', sousoff: '🎖️', sub: '⭐', sup: '🌟', gen: '🏅', dir: '👑' };
