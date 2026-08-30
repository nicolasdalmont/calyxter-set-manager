import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Plus, X, Check, ExternalLink, ListPlus, Users, Pencil, ChevronUp, ChevronDown, GripVertical,
  ChevronRight, Radio, ListMusic, Ban, Sparkles, Settings, Music2,
  MessageCircle, Flag, AlertTriangle, Crown, Loader2,
  Calendar, MapPin, Clock, Trash2, ArrowLeft, Mic2, Repeat
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  DATA / CONSTANTS                                                   */
/* ------------------------------------------------------------------ */

const STATUS = {
  ready:       { label: 'Prêt',            badge: 'PRÊT',        color: '#6FA287' },
  to_prepare:  { label: 'En préparation',  badge: 'À PRÉPARER',  color: '#E8B04B' },
  proposed:    { label: 'Proposé',         badge: 'PROPOSÉ',     color: '#7C8BA8' },
  rejected:    { label: 'Sorti',           badge: 'SORTI',       color: '#C1454B' },
};

const LANGUAGES = {
  FR: 'Francophone',
  EN: 'Anglophone',
  INSTRUMENTAL: 'Instrumental',
  OTHER: 'Autre',
};

const LANGUAGE_TAG = {
  FR: { short: 'FR', color: '#F2A93B' },
  EN: { short: 'EN', color: '#7C8BA8' },
  INSTRUMENTAL: { short: 'INSTR', color: '#6FA287' },
  OTHER: { short: '?', color: '#6B6862' },
};

const PLATFORMS = {
  spotify: 'Spotify',
  deezer: 'Deezer',
  apple_music: 'Apple Music',
};

const STEP_ORDER = ['proposal', 'veto', 'vote', 'result'];
const STEP_LABEL = {
  proposal: 'Proposition',
  veto: 'Veto',
  vote: 'Vote',
  result: 'Résultat',
};

const EVENT_KIND = {
  repetition: { label: 'Répétition',         badge: 'RÉPÉT',     color: '#7C8BA8' },
  atelier:    { label: 'Atelier de travail', badge: 'ATELIER',   color: '#6FA287' },
  residence:  { label: 'Résidence',          badge: 'RÉSIDENCE', color: '#E8B04B' },
  autre:      { label: 'Autre',              badge: 'AUTRE',     color: '#6B6862' },
};
const CONCERT_EVENT_KIND = { label: 'Concert', badge: 'CONCERT', color: '#C1454B' };

const RECURRENCE_UNIT_LABEL = {
  day: { singular: 'jour', plural: 'jours' },
  week: { singular: 'semaine', plural: 'semaines' },
  month: { singular: 'mois', plural: 'mois' },
  year: { singular: 'an', plural: 'ans' },
};
const MAX_RECURRENCE_OCCURRENCES = 200; // filet de sécurité anti-boucle / série démesurée

const DEFAULT_MEMBERS = [
  { id: 'usr_sandra',    name: 'Sandra',    instrument: 'Chant',                       preferred_platform: 'spotify' },
  { id: 'usr_gaelle',    name: 'Gaëlle',    instrument: 'Chant',                       preferred_platform: 'spotify' },
  { id: 'usr_david',     name: 'David',     instrument: 'Clavier / Guitare rythmique', preferred_platform: 'spotify' },
  { id: 'usr_alexandre', name: 'Alexandre', instrument: 'Guitare solo',                preferred_platform: 'spotify' },
  { id: 'usr_nicolas',   name: 'Nicolas',   instrument: 'Basse',                       preferred_platform: 'spotify' },
  { id: 'usr_do',        name: 'Do',        instrument: 'Batterie',                    preferred_platform: 'spotify' },
];

const DEFAULT_SONGS = [
  {
    "id": "sng_001",
    "title": "3600",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 231,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_002",
    "title": "3600 (chill edit)",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 199,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_003",
    "title": "Abime",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 213,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_004",
    "title": "Angel",
    "artist": "Calyxter",
    "album": "Sur le pavé",
    "duration_seconds": 300,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_005",
    "title": "Bas les pattes",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 205,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_006",
    "title": "Beautiful things",
    "artist": "Benson Boone",
    "album": "",
    "duration_seconds": 180,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_011",
    "title": "Comme tu avances",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 258,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_012",
    "title": "Crazy in love",
    "artist": "Beyonce",
    "album": "",
    "duration_seconds": 236,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_013",
    "title": "Diamonds",
    "artist": "Rihanna",
    "album": "",
    "duration_seconds": 225,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_014",
    "title": "Fannie Lou Hamer",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 210,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_016",
    "title": "Jesus he knows me",
    "artist": "Genesis",
    "album": "",
    "duration_seconds": 258,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_017",
    "title": "La bonne étoile",
    "artist": "-M-",
    "album": "",
    "duration_seconds": 219,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_018",
    "title": "Le dernier passage (chill edit)",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 165,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_019",
    "title": "Le dernier passager",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 302,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_020",
    "title": "Lèche vitrine",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 100,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_022",
    "title": "Maitre de rien",
    "artist": "Calyxter",
    "album": "Sur le pavé",
    "duration_seconds": 240,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_023",
    "title": "Never tear us apart",
    "artist": "INXS",
    "album": "",
    "duration_seconds": 184,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_024",
    "title": "Non conforme",
    "artist": "Calyxter",
    "album": "L'oeil du cadran",
    "duration_seconds": 166,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_025",
    "title": "Price tag",
    "artist": "Jessie J",
    "album": "",
    "duration_seconds": 222,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_026",
    "title": "Rendez-vous",
    "artist": "Manu",
    "album": "",
    "duration_seconds": 260,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_027",
    "title": "Shout",
    "artist": "Tears for fears",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_028",
    "title": "Somewhere only we know",
    "artist": "Keane",
    "album": "",
    "duration_seconds": 237,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_029",
    "title": "Sur le pavé",
    "artist": "Calyxter",
    "album": "Sur le pavé",
    "duration_seconds": 240,
    "language": "FR",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_030",
    "title": "Whole Lotta Love",
    "artist": "Lussi in the skies",
    "album": "",
    "duration_seconds": 240,
    "language": "EN",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_031",
    "title": "C’est pour toi",
    "artist": "Dolly",
    "album": "",
    "duration_seconds": 180,
    "language": "FR",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_032",
    "title": "Don't stop me now",
    "artist": "Queen",
    "album": "",
    "duration_seconds": 195,
    "language": "EN",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_033",
    "title": "I’m a believer",
    "artist": "Smash Mouth",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_034",
    "title": "In the end",
    "artist": "Linkin Park",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_035",
    "title": "Love is what I'm waiting for",
    "artist": "Flying Colors",
    "album": "",
    "duration_seconds": 300,
    "language": "EN",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_036",
    "title": "Tous des stars",
    "artist": "Dolly",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_037",
    "title": "Tout le monde danse",
    "artist": "Shaka Ponk/Zazie",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_038",
    "title": "Wonder why",
    "artist": "Julian Peretta",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "to_prepare",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_039",
    "title": "À ma place",
    "artist": "Zazie/Axel Bauer",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_040",
    "title": "Au moins",
    "artist": "Daran",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_041",
    "title": "Bad girl ?",
    "artist": "Jamiroquai",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_042",
    "title": "Dance Monkey",
    "artist": "Tones & I",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_043",
    "title": "Enjoy the silence",
    "artist": "Lacuna Coil",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_044",
    "title": "Fade Away",
    "artist": "Yodelice",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_045",
    "title": "Faith",
    "artist": "George Michael",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_046",
    "title": "Fortunate son",
    "artist": "John Fogerty",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_047",
    "title": "Ghost",
    "artist": "Skip the use",
    "album": "",
    "duration_seconds": null,
    "language": "OTHER",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_048",
    "title": "Happy Crowd",
    "artist": "Yodelice",
    "album": "",
    "duration_seconds": 165,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_049",
    "title": "Heathens",
    "artist": "21 pilots",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_050",
    "title": "J'irai mélanger les couleurs",
    "artist": "Kaolin",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_051",
    "title": "Just a girl",
    "artist": "No doubt",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_052",
    "title": "Kiss",
    "artist": "Prince",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_053",
    "title": "La Isla Bonita",
    "artist": "Madonna",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_054",
    "title": "La sentinelle",
    "artist": "Luke",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_055",
    "title": "Lady Marmelade",
    "artist": "Parti Labelle",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_056",
    "title": "Le complexe du cornflake",
    "artist": "-M-",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_057",
    "title": "Le pire et le meilleur",
    "artist": "FFF",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_058",
    "title": "Love games",
    "artist": "Franck Carter",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_059",
    "title": "Modern Love",
    "artist": "David Bowie",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_060",
    "title": "My name is stain",
    "artist": "Shaka ponk",
    "album": "",
    "duration_seconds": null,
    "language": "OTHER",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_061",
    "title": "Prendre Racine",
    "artist": "Calogero",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_062",
    "title": "R U mine",
    "artist": "Arctic monkeys",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_063",
    "title": "Respire encore",
    "artist": "Clara Luciani",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_064",
    "title": "Rythm is love",
    "artist": "Keziah Jones",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_065",
    "title": "Shut up and dance",
    "artist": "Walk the Moon",
    "album": "",
    "duration_seconds": null,
    "language": "OTHER",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_066",
    "title": "Song 2",
    "artist": "Blur",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_067",
    "title": "Song for a jedi",
    "artist": "Dyonisos",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_068",
    "title": "Stand my ground",
    "artist": "Within Temptation",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_069",
    "title": "Starman",
    "artist": "David Bowie",
    "album": "",
    "duration_seconds": 260,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_070",
    "title": "Supercharged",
    "artist": "Ayrton Jones",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_071",
    "title": "Technicolor Life",
    "artist": "Kokomo",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_072",
    "title": "The Dark of the matinée",
    "artist": "Franz Ferdinand",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_073",
    "title": "Uprising",
    "artist": "Muse",
    "album": "",
    "duration_seconds": null,
    "language": "OTHER",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_074",
    "title": "What's up ?",
    "artist": "4 non blonds",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_075",
    "title": "You give me something",
    "artist": "Jamiroquai",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "proposed",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_076",
    "title": "A Ton Etoile",
    "artist": "Noir Désir",
    "album": "",
    "duration_seconds": 270,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_077",
    "title": "All the small things",
    "artist": "Blink 182",
    "album": "",
    "duration_seconds": 170,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_078",
    "title": "Anatomique",
    "artist": "Daran et les chaises",
    "album": "",
    "duration_seconds": 300,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_079",
    "title": "Andy",
    "artist": "Les Rita Mitsouko",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_080",
    "title": "Another One Bites The Dust",
    "artist": "Queen",
    "album": "",
    "duration_seconds": 210,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_081",
    "title": "Are you gonna go my way",
    "artist": "Lenny Kravitz",
    "album": "",
    "duration_seconds": 210,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_082",
    "title": "Army of me",
    "artist": "Bjork",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_083",
    "title": "Basket Case",
    "artist": "Greenday",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_084",
    "title": "Besoin d'air",
    "artist": "Calyxter",
    "album": "On ne sait jamais",
    "duration_seconds": 240,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_085",
    "title": "Break on through",
    "artist": "The Doors",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_086",
    "title": "Bring me to life",
    "artist": "Evanescence",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_087",
    "title": "Ca Me Vexe",
    "artist": "Mademoiselle K",
    "album": "",
    "duration_seconds": 240,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_088",
    "title": "Call Me",
    "artist": "Blondie",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_089",
    "title": "Clocks",
    "artist": "Coldplay",
    "album": "",
    "duration_seconds": 310,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_090",
    "title": "Comme elle vient",
    "artist": "Noir Désir",
    "album": "",
    "duration_seconds": 150,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_091",
    "title": "Crazy",
    "artist": "Gnarls Barkley",
    "album": "",
    "duration_seconds": 300,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_092",
    "title": "Donne le sens",
    "artist": "Calyxter",
    "album": "On ne sait jamais",
    "duration_seconds": 195,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_093",
    "title": "Dormir dehors",
    "artist": "Daran et les chaises",
    "album": "",
    "duration_seconds": 225,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_094",
    "title": "Estranged",
    "artist": "Guns n’ roses",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_095",
    "title": "Et pourtant",
    "artist": "Calyxter",
    "album": "On ne sait jamais",
    "duration_seconds": 285,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_096",
    "title": "Ex",
    "artist": "Calyxter",
    "album": "On ne sait jamais",
    "duration_seconds": 270,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_097",
    "title": "Express yourself",
    "artist": "Madonna",
    "album": "",
    "duration_seconds": 240,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_098",
    "title": "Fade Away",
    "artist": "Yodelice",
    "album": "",
    "duration_seconds": 255,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_099",
    "title": "Fleur de saison",
    "artist": "Emilie Simon",
    "album": "",
    "duration_seconds": 251,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_100",
    "title": "Foxey Lady",
    "artist": "Jimi Hendrix",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_101",
    "title": "Gamma Ray",
    "artist": "Aimee Mann",
    "album": "",
    "duration_seconds": 180,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_102",
    "title": "Get back",
    "artist": "The Beatles",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_103",
    "title": "Glory & Consequences",
    "artist": "Ben Harper",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_104",
    "title": "Going Under",
    "artist": "Evanescence",
    "album": "",
    "duration_seconds": 215,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_105",
    "title": "Great Big White World",
    "artist": "Marylin Manson",
    "album": "",
    "duration_seconds": 300,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_106",
    "title": "Ground on down",
    "artist": "Ben Harper",
    "album": "",
    "duration_seconds": 295,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_107",
    "title": "Heavy Cross",
    "artist": "Gossip",
    "album": "",
    "duration_seconds": 240,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_108",
    "title": "Highway to hell",
    "artist": "AC-DC",
    "album": "",
    "duration_seconds": 210,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_109",
    "title": "Hold the line",
    "artist": "Toto",
    "album": "",
    "duration_seconds": 236,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_110",
    "title": "I kissed a girl",
    "artist": "Katy Perry",
    "album": "",
    "duration_seconds": 177,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_111",
    "title": "I will Survive",
    "artist": "Cake",
    "album": "",
    "duration_seconds": 310,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_112",
    "title": "Ignition",
    "artist": "Jabberwocky",
    "album": "",
    "duration_seconds": 285,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_113",
    "title": "Impasse et perd",
    "artist": "Calyxter",
    "album": "On ne sait jamais",
    "duration_seconds": 195,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_114",
    "title": "In the cross fire",
    "artist": "Starsailor",
    "album": "",
    "duration_seconds": 210,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_115",
    "title": "In the shadows",
    "artist": "The Rasmus",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_116",
    "title": "In too deep",
    "artist": "Sum 41",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_117",
    "title": "La nuit je mens",
    "artist": "Alain Bashung",
    "album": "",
    "duration_seconds": 265,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_118",
    "title": "Le baptême",
    "artist": "-M-",
    "album": "",
    "duration_seconds": 240,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_119",
    "title": "Le monde est fou",
    "artist": "Calyxter",
    "album": "Sur le pavé",
    "duration_seconds": 300,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_120",
    "title": "Life on mars",
    "artist": "David Bowie",
    "album": "",
    "duration_seconds": 240,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_121",
    "title": "Light my fire",
    "artist": "The Doors",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_122",
    "title": "Long Train Running",
    "artist": "The Doobie Brothers",
    "album": "",
    "duration_seconds": 270,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_123",
    "title": "Losing my religion",
    "artist": "R.E.M",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_124",
    "title": "Machistador",
    "artist": "-M-",
    "album": "",
    "duration_seconds": 225,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_125",
    "title": "Mad World",
    "artist": "Michael Andrews",
    "album": "",
    "duration_seconds": 210,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_126",
    "title": "Misirlou",
    "artist": "Dick Dale",
    "album": "",
    "duration_seconds": null,
    "language": "INSTRUMENTAL",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_127",
    "title": "Miss you",
    "artist": "Rolling Stone",
    "album": "",
    "duration_seconds": 290,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_128",
    "title": "Missile",
    "artist": "Dorothea",
    "album": "",
    "duration_seconds": 208,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_129",
    "title": "Moves like Jagger",
    "artist": "Maroon5",
    "album": "",
    "duration_seconds": 200,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_130",
    "title": "Muscle Museum",
    "artist": "Muse",
    "album": "",
    "duration_seconds": 270,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_131",
    "title": "My blood is burning",
    "artist": "Yodelice",
    "album": "",
    "duration_seconds": 225,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_132",
    "title": "My Type",
    "artist": "Saint Motel",
    "album": "",
    "duration_seconds": 210,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_133",
    "title": "Nowhere to run",
    "artist": "Boga",
    "album": "",
    "duration_seconds": 235,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_134",
    "title": "On ne sait jamais",
    "artist": "Calyxter",
    "album": "On ne sait jamais",
    "duration_seconds": 330,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_135",
    "title": "Paradise City",
    "artist": "Guns n’ roses",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_136",
    "title": "Personal Jesus",
    "artist": "Depeche Mode",
    "album": "",
    "duration_seconds": 225,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_137",
    "title": "Personal Jesus",
    "artist": "Kokomo",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_138",
    "title": "Plug In Baby",
    "artist": "Muse",
    "album": "",
    "duration_seconds": 225,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_139",
    "title": "Poker Face",
    "artist": "Lady Gaga",
    "album": "",
    "duration_seconds": 240,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_140",
    "title": "Proud Mary",
    "artist": "Ike & Tina Turner",
    "album": "",
    "duration_seconds": 300,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_141",
    "title": "Purple Haze",
    "artist": "Jimi Hendrix",
    "album": "",
    "duration_seconds": 170,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_142",
    "title": "Regrets",
    "artist": "Calyxter",
    "album": "Sur le pavé",
    "duration_seconds": 390,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_143",
    "title": "Respire encore",
    "artist": "Clara Luciani",
    "album": "",
    "duration_seconds": null,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_144",
    "title": "Rockafeller Skank",
    "artist": "Fat Boy Slim",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_145",
    "title": "Running up that hill",
    "artist": "Kate Bush",
    "album": "",
    "duration_seconds": 300,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_146",
    "title": "Sans maudire",
    "artist": "Calyxter",
    "album": "Sur le pavé",
    "duration_seconds": 240,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_147",
    "title": "Singing in the shower",
    "artist": "Les Rita Mitsouko",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_148",
    "title": "Smells Like Teen Spirit",
    "artist": "Nirvana",
    "album": "Sur le pavé",
    "duration_seconds": 270,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_149",
    "title": "Sweet child of mine",
    "artist": "Guns n’ roses",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_150",
    "title": "Take me out",
    "artist": "Franz Ferdinand",
    "album": "",
    "duration_seconds": 250,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_151",
    "title": "The Bitter End",
    "artist": "Placebo",
    "album": "",
    "duration_seconds": 195,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_152",
    "title": "The Trickster",
    "artist": "Radiohead",
    "album": "",
    "duration_seconds": 285,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_153",
    "title": "This Love",
    "artist": "Maroon5",
    "album": "",
    "duration_seconds": 210,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_154",
    "title": "Thunderstruck",
    "artist": "AC/DC",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_155",
    "title": "Tu Vois Loin",
    "artist": "Eiffel",
    "album": "",
    "duration_seconds": 240,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_156",
    "title": "Un jour en France",
    "artist": "Noir Désir",
    "album": "",
    "duration_seconds": 200,
    "language": "FR",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_157",
    "title": "Under pressure",
    "artist": "Queen",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_158",
    "title": "Vertigo",
    "artist": "U2",
    "album": "",
    "duration_seconds": 191,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_159",
    "title": "Walk this way",
    "artist": "Aerosmith",
    "album": "",
    "duration_seconds": 240,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_160",
    "title": "What you know",
    "artist": "Two doors cinema club",
    "album": "",
    "duration_seconds": 190,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_161",
    "title": "Where's life ?",
    "artist": "Keziah Jones",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_162",
    "title": "With a little help..",
    "artist": "Joe Cocker",
    "album": "",
    "duration_seconds": 567,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_163",
    "title": "Would I lie to you",
    "artist": "Eurythmics",
    "album": "",
    "duration_seconds": 270,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_164",
    "title": "You got me",
    "artist": "Eskobar",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_165",
    "title": "You keep me hanging on",
    "artist": "Kim WIlde",
    "album": "",
    "duration_seconds": null,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_166",
    "title": "You really got me",
    "artist": "Van Halen",
    "album": "",
    "duration_seconds": 155,
    "language": "EN",
    "status": "rejected",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  },
  {
    "id": "sng_medley",
    "title": "Medley",
    "artist": "Medley (plusieurs artistes)",
    "album": "",
    "duration_seconds": 660,
    "language": "OTHER",
    "status": "ready",
    "added_by_user_id": null,
    "links": {},
    "created_at": "2026-08-29T00:00:00.000Z"
  }
];

/* ------------------------------------------------------------------ */
/*  HELPERS                                                             */
/* ------------------------------------------------------------------ */

const uid = () => crypto.randomUUID();

function formatTotalDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m} min`;
}

function formatSongDuration(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseDurationInput(str) {
  const parts = String(str).split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (Number.isNaN(m) || Number.isNaN(s)) return null;
  return m * 60 + s;
}

function listenUrl(song, platform) {
  if (song.links && song.links.custom_url) return song.links.custom_url;
  if (song.links && song.links.deezer_url && platform === 'deezer') return song.links.deezer_url;
  const q = encodeURIComponent(`${song.title} ${song.artist}`);
  if (platform === 'deezer') return `https://www.deezer.com/search/${q}`;
  if (platform === 'apple_music') return `https://music.apple.com/search?term=${q}`;
  return `https://open.spotify.com/search/${q}`;
}

// Stockage personnel léger (qui es-tu sur cet appareil) — localStorage classique,
// disponible dans un vrai navigateur (contrairement à l'aperçu Claude).
function savePersonal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.error('Storage error', key, e); }
}
function loadPersonal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function deletePersonal(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

// Never let a slow or hanging network call keep the app stuck on the loading screen.
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/* ------------------------------------------------------------------ */
/*  SUPABASE — connexion (pas de SDK, appels fetch directs :          */
/*  les artefacts ne peuvent importer que les librairies autorisées)   */
/*  Gestion des utilisateurs au niveau de l'appli, pas de Supabase     */
/*  Auth : la clé publishable suffit pour tous les appels.             */
/* ------------------------------------------------------------------ */

const SUPABASE_URL = 'https://hhtjuwmlllgglnxtnjtx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_78oxJJanE3jzXYs8xbrMxg_sjgwBaB2';

async function supabaseTable(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur Supabase (${res.status}) : ${errText}`);
  }
  // Ne pas se fier uniquement au code 204 : un POST avec
  // "Prefer: return=minimal" répond en 201 avec un corps vide, et appeler
  // res.json() sur une chaîne vide lève une SyntaxError (sur Safari :
  // "The string did not match the expected pattern."). On lit donc le texte
  // brut d'abord, et on ne tente le parsing JSON que s'il y a effectivement
  // un contenu.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Réponse Supabase inattendue (non-JSON)', text);
    return null;
  }
}

async function fetchMembersFromSupabase() {
  return supabaseTable('members?select=id,name,instrument,preferred_platform,created_at&order=name.asc');
}

async function upsertRows(table, rows) {
  if (!rows || rows.length === 0) return null;
  // PostgREST (POST en lot) exige que tous les objets du tableau aient exactement
  // les mêmes clés ("All object keys must match" / PGRST102). Un objet construit
  // côté client (ex. un nouveau morceau) peut ne pas porter toutes les colonnes
  // présentes sur les lignes déjà chargées depuis Supabase (ex. updated_at) :
  // on complète donc chaque objet avec l'union des clés du lot. Les colonnes
  // horodatées (suffixe _at, ex. updated_at) sont NOT NULL en base : on leur
  // donne l'heure courante plutôt que null pour ne pas violer la contrainte.
  const nowIso = new Date().toISOString();
  const allKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const normalized = rows.map((r) => {
    const filled = {};
    for (const k of allKeys) {
      if (k in r) filled[k] = r[k];
      else filled[k] = k.endsWith('_at') ? nowIso : null;
    }
    return filled;
  });
  return supabaseTable(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(normalized),
  });
}

async function loadOrSeedSongs() {
  const existing = await supabaseTable('songs?select=*');
  if (existing && existing.length > 0) return existing;
  const seeded = DEFAULT_SONGS.map((s) => ({ ...s, id: uid() }));
  await upsertRows('songs', seeded);
  return seeded;
}

async function fetchActivePhase() {
  const rows = await supabaseTable('phases?closed_at=is.null&select=*&order=created_at.desc&limit=1');
  return rows && rows[0] ? rows[0] : null;
}

async function fetchNotifications() {
  const rows = await supabaseTable('notifications?select=*&order=created_at.desc&limit=40');
  return rows || [];
}

async function fetchConcerts() {
  const rows = await supabaseTable('concerts?select=*&order=event_date.desc,event_time.desc.nullslast');
  return rows || [];
}

async function fetchEvents() {
  const rows = await supabaseTable('events?select=*&order=event_date.desc,start_time.desc.nullslast');
  return rows || [];
}

async function callMemberAuth(action, memberId, password) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/member-auth`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, member_id: memberId, password }),
  });
  return res.json();
}

async function searchDeezer(query) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/search-deezer?q=${encodeURIComponent(query)}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'La recherche Deezer a échoué.');
  return data.results || [];
}




function computeRanking(songs, votes) {
  const eligible = songs.filter((s) => s.status === 'proposed');
  const points = {};
  const maxNote = {};
  eligible.forEach((s) => { points[s.id] = 0; maxNote[s.id] = 0; });

  votes.forEach((v) => {
    v.rankings.forEach((r) => {
      if (points[r.song_id] === undefined) return;
      points[r.song_id] += r.points;
      maxNote[r.song_id] = Math.max(maxNote[r.song_id], r.points);
    });
  });

  const scored = eligible.map((s) => ({
    ...s,
    points: points[s.id] || 0,
    maxNote: maxNote[s.id] || 0,
  }));

  scored.sort((a, b) => b.points - a.points || b.maxNote - a.maxNote);

  // Detect a boundary tie for the qualifying slot(s) around position 3.
  let tieGroup = [];
  let slotsForTie = 0;
  if (scored.length > 3) {
    const cutoff = scored[2];
    tieGroup = scored.filter((s) => s.points === cutoff.points && s.maxNote === cutoff.maxNote);
    if (tieGroup.length > 1) {
      const strictlyAbove = scored.filter((s) => !tieGroup.includes(s) &&
        (s.points > cutoff.points || (s.points === cutoff.points && s.maxNote > cutoff.maxNote))).length;
      slotsForTie = 3 - strictlyAbove;
    }
  }

  return { scored, tieGroup, slotsForTie };
}

function resolveWithTieBreak(scored, tieGroup, slotsForTie, tieBreakVotes) {
  if (tieGroup.length <= 1 || slotsForTie <= 0) {
    return { top3: scored.slice(0, 3), tieResolved: true, needsManual: false };
  }
  // Count express tie-break votes among tied songs.
  const counts = {};
  tieGroup.forEach((s) => { counts[s.id] = 0; });
  tieBreakVotes.forEach((v) => { if (counts[v.song_id] !== undefined) counts[v.song_id] += 1; });

  const ranked = [...tieGroup].sort((a, b) => counts[b.id] - counts[a.id]);
  const cutoffCount = ranked[slotsForTie - 1] ? counts[ranked[slotsForTie - 1].id] : 0;
  const stillTied = ranked.filter((s) => counts[s.id] === cutoffCount);
  const aboveCutoffCount = ranked.filter((s) => counts[s.id] > cutoffCount).length;

  if (stillTied.length > (slotsForTie - aboveCutoffCount) && tieBreakVotes.length > 0) {
    return { top3: null, tieResolved: false, needsManual: true, counts };
  }
  if (tieBreakVotes.length === 0) {
    return { top3: null, tieResolved: false, needsManual: false, counts };
  }

  const winners = ranked.slice(0, slotsForTie);
  const nonTied = scored.filter((s) => !tieGroup.includes(s));
  const merged = [...nonTied];
  // Reinsert winners at their proper rank position.
  const firstTieIndex = scored.findIndex((s) => tieGroup.includes(s));
  merged.splice(firstTieIndex, 0, ...winners);
  return { top3: merged.slice(0, 3), tieResolved: true, needsManual: false, counts };
}

function applyFrQuota(top3, scored) {
  if (!top3) return { finalTop3: null, quotaApplied: false, bumped: null, promoted: null };
  const hasFr = top3.some((s) => s.language === 'FR');
  if (hasFr) return { finalTop3: top3, quotaApplied: false, bumped: null, promoted: null };

  const top2Ids = top3.slice(0, 2).map((s) => s.id);
  const bestFr = scored.find((s) => s.language === 'FR' && !top2Ids.includes(s.id));
  if (!bestFr) return { finalTop3: top3, quotaApplied: false, bumped: null, promoted: null, noFrAvailable: true };

  const bumped = top3[2];
  const finalTop3 = [top3[0], top3[1], bestFr];
  return { finalTop3, quotaApplied: true, bumped, promoted: bestFr };
}

/* ------------------------------------------------------------------ */
/*  ROOT COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]); // vraie table "members" Supabase
  const [songs, setSongs] = useState([]);
  const [phase, setPhase] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [concerts, setConcerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [concertToOpen, setConcertToOpen] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [membersError, setMembersError] = useState('');

  const [tab, setTab] = useState('repertoire');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const [artistFilter, setArtistFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifLog, setShowNotifLog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [supaMembers, s, p, n, c, ev] = await Promise.all([
          withTimeout(fetchMembersFromSupabase(), 8000, null),
          withTimeout(loadOrSeedSongs(), 8000, DEFAULT_SONGS),
          withTimeout(fetchActivePhase(), 8000, null),
          withTimeout(fetchNotifications(), 8000, []),
          withTimeout(fetchConcerts(), 8000, []),
          withTimeout(fetchEvents(), 8000, []),
        ]);
        if (cancelled) return;
        if (supaMembers) {
          setMembers(supaMembers);
        } else {
          setMembersError("Impossible de charger les membres depuis Supabase — vérifie la connexion.");
        }
        setSongs(s);
        setPhase(p);
        setNotifications(n);
        setConcerts(c);
        setEvents(ev);
        setCurrentUserId(loadPersonal('current-member-id'));
      } catch (e) {
        console.error('Failed to load app data', e);
        if (cancelled) return;
        setMembersError("Impossible de charger les données depuis Supabase — vérifie la connexion.");
        setSongs(DEFAULT_SONGS);
        setPhase(null);
        setNotifications([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentUser = useMemo(() => members.find((m) => m.id === currentUserId) || null, [members, currentUserId]);

  const onAuthenticated = useCallback((member) => {
    setCurrentUserId(member.id);
    savePersonal('current-member-id', member.id);
  }, []);

  const signOut = useCallback(() => {
    setCurrentUserId(null);
    deletePersonal('current-member-id');
  }, []);

  const pushNotification = useCallback(async (text, kind) => {
    const entry = { id: uid(), text, kind: kind || 'info', created_at: new Date().toISOString() };
    setNotifications((prev) => [entry, ...prev].slice(0, 40));
    try {
      await supabaseTable('notifications', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{ text: entry.text, kind: entry.kind }]),
      });
    } catch (e) {
      console.error('Erreur en enregistrant la notification', e);
    }
  }, []);

  const updateSongs = useCallback(async (updater) => {
    let prevSongs;
    let next;
    setSongs((prev) => {
      prevSongs = prev;
      next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
    try {
      // On n'envoie à Supabase que les lignes réellement ajoutées ou modifiées.
      // Envoyer tout le tableau ferait cohabiter, dans un même upsert groupé,
      // des objets aux clés différentes (ex. un morceau tout juste créé côté
      // client, sans `updated_at`, à côté de morceaux venus de la base avec
      // toutes leurs colonnes) — ce que PostgREST refuse (PGRST102).
      const prevById = new Map(prevSongs.map((s) => [s.id, s]));
      const changed = next.filter((s) => prevById.get(s.id) !== s);
      if (changed.length > 0) {
        await upsertRows('songs', changed);
      }
    } catch (e) {
      console.error('Erreur en enregistrant les morceaux', e);
    }
  }, []);

  const deleteSong = useCallback(async (songId) => {
    setSongs((prev) => prev.filter((s) => s.id !== songId));
    try {
      await supabaseTable(`songs?id=eq.${songId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch (e) {
      console.error('Erreur en supprimant le morceau', e);
    }
  }, []);

  const saveConcert = useCallback(async (concert) => {
    setConcerts((prev) => {
      const exists = prev.some((c) => c.id === concert.id);
      return exists ? prev.map((c) => (c.id === concert.id ? concert : c)) : [...prev, concert];
    });
    try {
      await upsertRows('concerts', [concert]);
    } catch (e) {
      console.error('Erreur en enregistrant le concert', e);
    }
  }, []);

  const deleteConcert = useCallback(async (concertId) => {
    setConcerts((prev) => prev.filter((c) => c.id !== concertId));
    try {
      await supabaseTable(`concerts?id=eq.${concertId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch (e) {
      console.error('Erreur en supprimant le concert', e);
    }
  }, []);

  const saveEvent = useCallback(async (event) => {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === event.id);
      return exists ? prev.map((e) => (e.id === event.id ? event : e)) : [...prev, event];
    });
    try {
      await upsertRows('events', [event]);
    } catch (e) {
      console.error('Erreur en enregistrant le rendez-vous', e);
    }
  }, []);

  const deleteEvent = useCallback(async (eventId) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      await supabaseTable(`events?id=eq.${eventId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch (e) {
      console.error('Erreur en supprimant le rendez-vous', e);
    }
  }, []);

  const updatePhase = useCallback(async (updater) => {
    let prevPhase;
    let next;
    setPhase((prev) => {
      prevPhase = prev;
      next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
    try {
      if (next) {
        await upsertRows('phases', [next]);
      } else if (prevPhase) {
        await supabaseTable(`phases?id=eq.${prevPhase.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ current_step: 'closed', closed_at: new Date().toISOString() }),
        });
      }
    } catch (e) {
      console.error('Erreur en enregistrant la phase', e);
    }
  }, []);

  const matchesNonArtistFilters = (s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (langFilter !== 'all' && s.language !== langFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!s.title.toLowerCase().includes(q) && !s.artist.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const filteredSongs = songs
    .filter((s) => matchesNonArtistFilters(s) && (artistFilter === 'all' || s.artist === artistFilter))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  const totalSeconds = filteredSongs.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const artistOptions = [...new Set(songs.filter(matchesNonArtistFilters).map((s) => s.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  useEffect(() => {
    if (artistFilter !== 'all' && !artistOptions.includes(artistFilter)) {
      setArtistFilter('all');
    }
  }, [artistOptions.join('|')]);

  if (loading) {
    return (
      <div className="calyxter-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <GlobalStyle />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9A958C' }}>
          <Loader2 size={18} className="clx-spin" />
          <span className="clx-mono" style={{ fontSize: 13 }}>Chargement du répertoire…</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="calyxter-app" style={{ minHeight: '100vh' }}>
        <GlobalStyle />
        <MemberPicker members={members} onAuthenticated={onAuthenticated} error={membersError} />
      </div>
    );
  }

  return (
    <div className="calyxter-app">
      <GlobalStyle />

      <TopBar
        currentUser={currentUser}
        onSignOut={signOut}
        onOpenSettings={() => setShowSettings(true)}
        tab={tab}
        setTab={setTab}
        phaseActive={!!phase}
      />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px 64px', position: 'relative', zIndex: 1 }}>
        {tab === 'repertoire' && (
          <Repertoire
            songs={filteredSongs}
            allSongsCount={songs.length}
            totalSeconds={totalSeconds}
            search={search} setSearch={setSearch}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            langFilter={langFilter} setLangFilter={setLangFilter}
            artistFilter={artistFilter} setArtistFilter={setArtistFilter}
            artistOptions={artistOptions}
            members={members}
            currentUser={currentUser}
            onAddClick={() => setShowAdd(true)}
            onEditClick={(song) => setEditingSong(song)}
          />
        )}

        {tab === 'phase' && (
          <PhaseWorkflow
            phase={phase}
            songs={songs}
            members={members}
            currentUser={currentUser}
            updatePhase={updatePhase}
            updateSongs={updateSongs}
            deleteSong={deleteSong}
            pushNotification={pushNotification}
          />
        )}

        {tab === 'concerts' && (
          <ConcertsTab
            concerts={concerts}
            songs={songs}
            members={members}
            currentUser={currentUser}
            saveConcert={saveConcert}
            deleteConcert={deleteConcert}
            pushNotification={pushNotification}
            initialConcertId={concertToOpen}
            onInitialConcertConsumed={() => setConcertToOpen(null)}
          />
        )}

        {tab === 'rendezvous' && (
          <RendezVousTab
            events={events}
            concerts={concerts}
            members={members}
            currentUser={currentUser}
            saveEvent={saveEvent}
            deleteEvent={deleteEvent}
            pushNotification={pushNotification}
            onViewConcert={(concertId) => { setConcertToOpen(concertId); setTab('concerts'); }}
          />
        )}

        {tab === 'notifications' && (
          <NotificationLog notifications={notifications} />
        )}
      </main>

      {showAdd && (
        <AddSongModal
          currentUser={currentUser}
          existingSongs={songs}
          onClose={() => setShowAdd(false)}
          onAdd={async (song) => {
            await updateSongs((prev) => [...prev, song]);
            await pushNotification(`🎵 « ${song.title} » ajouté au répertoire par ${currentUser.name}.`, 'info');
            setShowAdd(false);
          }}
        />
      )}

      {editingSong && (
        <AddSongModal
          currentUser={currentUser}
          initialSong={editingSong}
          existingSongs={songs}
          onClose={() => setEditingSong(null)}
          onAdd={async (updatedSong) => {
            const previousStatus = editingSong.status;
            const statusChanged = updatedSong.status !== previousStatus;
            await updateSongs((prev) => prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)));
            if (statusChanged) {
              await pushNotification(`🔧 ${currentUser.name} a changé manuellement le statut de « ${updatedSong.title} » : ${STATUS[previousStatus].label} → ${STATUS[updatedSong.status].label}.`, 'info');
            } else {
              await pushNotification(`✏️ « ${updatedSong.title} » a été mis à jour par ${currentUser.name}.`, 'info');
            }
            setEditingSong(null);
          }}
          onDelete={async (songId) => {
            const title = editingSong.title;
            await deleteSong(songId);
            await pushNotification(`🗑️ « ${title} » a été supprimé du répertoire par ${currentUser.name}.`, 'info');
            setEditingSong(null);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onSave={async (platform) => {
            await supabaseTable(`members?id=eq.${currentUser.id}`, {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ preferred_platform: platform }),
            });
            setMembers((prev) => prev.map((m) => (m.id === currentUser.id ? { ...m, preferred_platform: platform } : m)));
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GLOBAL STYLE (dark-rock "backstage setlist" theme)                 */
/* ------------------------------------------------------------------ */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');

      .calyxter-app, .calyxter-app *, .calyxter-app *::before, .calyxter-app *::after {
        box-sizing: border-box;
      }
      .calyxter-app {
        background: #0B0B0C;
        color: #F5F1E8;
        font-family: 'Inter', sans-serif;
        min-height: 100vh;
        overflow-x: hidden;
      }
      .calyxter-app { background-image:
        radial-gradient(ellipse 900px 500px at 15% -10%, rgba(242,169,59,0.10), transparent 55%),
        radial-gradient(ellipse 700px 500px at 100% 0%, rgba(193,69,75,0.08), transparent 50%);
        background-attachment: fixed;
      }
      .clx-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }
      .clx-mono { font-family: 'Space Mono', monospace; }

      .clx-card {
        background: #16161A;
        border: 1px solid #2A2A2E;
        border-radius: 6px;
        position: relative;
      }
      .clx-tape {
        position: absolute;
        top: -7px;
        left: 18px;
        width: 34px;
        height: 13px;
        background: rgba(242,169,59,0.85);
        transform: rotate(-3deg);
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        border-radius: 1px;
      }
      .clx-tape.red { background: rgba(193,69,75,0.85); left: auto; right: 18px; transform: rotate(3deg); }

      .clx-row {
        border-left: 2px dashed #2A2A2E;
      }
      .clx-row:hover { border-left-color: #F2A93B55; background: #18181D; }

      .clx-badge {
        font-family: 'Space Mono', monospace;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 3px 8px;
        border-radius: 3px;
        display: inline-block;
        white-space: nowrap;
      }

      .clx-btn {
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: transform 0.08s ease, filter 0.15s ease, background 0.15s ease;
      }
      .clx-btn:hover { filter: brightness(1.1); }
      .clx-btn:active { transform: scale(0.97); }

      .clx-btn-primary { background: #F2A93B; color: #16130A; }
      .clx-btn-ghost { background: transparent; color: #F5F1E8; border: 1px solid #2A2A2E; }
      .clx-btn-ghost:hover { border-color: #F2A93B55; background: #1B1B1F; }
      .clx-btn-danger { background: #C1454B; color: #F5F1E8; }

      .clx-input {
        background: #101012;
        border: 1px solid #2A2A2E;
        color: #F5F1E8;
        border-radius: 5px;
        padding: 9px 12px;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        outline: none;
        width: 100%;
      }
      .clx-input:focus { border-color: #F2A93B; box-shadow: 0 0 0 3px #F2A93B22; }
      .clx-input::placeholder { color: #6B6862; }

      .clx-chip {
        font-family: 'Space Mono', monospace;
        font-size: 11px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid #2A2A2E;
        background: transparent;
        color: #9A958C;
        cursor: pointer;
        white-space: nowrap;
      }
      .clx-chip.active { background: #F2A93B; color: #16130A; border-color: #F2A93B; }

      .clx-counter {
        background: #101012;
        border: 1px solid #2A2A2E;
        border-radius: 6px;
        font-family: 'Space Mono', monospace;
        color: #F2A93B;
        text-shadow: 0 0 14px rgba(242,169,59,0.35);
      }

      a.clx-link { color: #F2A93B; text-decoration: none; }
      a.clx-link:hover { text-decoration: underline; }

      *:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }

      .clx-spin { animation: clxspin 0.9s linear infinite; }
      @keyframes clxspin { to { transform: rotate(360deg); } }

      .clx-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
      .clx-scrollbar::-webkit-scrollbar-thumb { background: #2A2A2E; border-radius: 3px; }

      /* Barre d'onglets : jamais coupée, quel que soit l'appareil.
         En dessous de 640px, la nav prend toute la largeur et passe en
         icônes seules (label masqué, conservé pour lecteurs d'écran via
         aria-label et en info-bulle via title) : les 4 onglets tiennent
         alors sur un seul écran de smartphone. Dans tous les cas, la nav
         reste défilable horizontalement en filet de sécurité (grande
         police, zoom d'accessibilité…). */
      .clx-topnav {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .clx-topnav::-webkit-scrollbar { display: none; }

      @media (max-width: 640px) {
        .clx-topnav { width: 100%; justify-content: center; }
        .clx-tab-label { display: none; }
        .clx-tab-btn { padding: 9px 10px; }
      }

      @media (max-width: 560px) {
        .clx-song-info { flex: 1 1 100%; order: 1; }
        .clx-song-cover { order: 0; }
        .clx-song-meta { order: 2; flex: 1 1 100%; justify-content: space-between; margin-top: 4px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .clx-btn, .clx-spin { transition: none; animation: none; }
      }
    `}</style>
  );
}

/* ------------------------------------------------------------------ */
/*  MEMBER PICKER (stand-in for auth in the prototype)                 */
/* ------------------------------------------------------------------ */

function MemberPicker({ members, onAuthenticated, error }) {
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('picker'); // 'picker' | 'login' | 'create'
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectMember = (m) => {
    setSelected(m);
    setMode('login');
    setPassword('');
    setConfirmPassword('');
    setFormError('');
  };

  const back = () => {
    setSelected(null);
    setMode('picker');
    setFormError('');
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setFormError('');
    try {
      const res = await callMemberAuth('verify', selected.id, password);
      if (res.error === 'no_password_set') {
        setMode('create');
        setPassword('');
        setFormError('');
      } else if (res.error) {
        setFormError(res.error);
      } else {
        onAuthenticated(res.member);
      }
    } catch (err) {
      setFormError(err.message || 'Erreur de connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setFormError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (password !== confirmPassword) { setFormError('Les mots de passe ne correspondent pas.'); return; }
    setSubmitting(true);
    setFormError('');
    try {
      const res = await callMemberAuth('set', selected.id, password);
      if (res.error) { setFormError(res.error); }
      else { onAuthenticated(res.member); }
    } catch (err) {
      setFormError(err.message || 'Erreur de connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'login' || mode === 'create') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', zIndex: 1 }}>
        <div className="clx-display" style={{ fontSize: 52, lineHeight: 1, marginBottom: 4 }}>CALYXTER</div>
        <div className="clx-mono" style={{ fontSize: 12, color: '#9A958C', marginBottom: 28 }}>SET MANAGER</div>

        <form onSubmit={mode === 'login' ? submitLogin : submitCreate} className="clx-card" style={{ padding: 24, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="clx-tape" />
          <div className="clx-display" style={{ fontSize: 24 }}>{selected.name}</div>
          <div className="clx-mono" style={{ fontSize: 11, color: '#9A958C', marginTop: -8, marginBottom: 4 }}>{selected.instrument}</div>

          {mode === 'create' && (
            <div className="clx-mono" style={{ fontSize: 11, color: '#E8B04B' }}>
              Aucun mot de passe n'est encore défini pour ce profil — crée-le maintenant.
            </div>
          )}

          <Field label="Mot de passe">
            <input
              type="password"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              className="clx-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
            />
          </Field>

          {mode === 'create' && (
            <Field label="Confirme le mot de passe">
              <input
                type="password"
                autoComplete="new-password"
                className="clx-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
          )}

          {formError && <div style={{ color: '#C1454B', fontSize: 12 }}>{formError}</div>}

          <button type="submit" disabled={submitting} className="clx-btn clx-btn-primary" style={{ padding: '10px 16px', borderRadius: 6, fontSize: 13, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? '…' : mode === 'create' ? 'Créer mon mot de passe' : 'Se connecter'}
          </button>
          <button type="button" onClick={back} className="clx-btn clx-btn-ghost" style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12 }}>
            ← Choisir un autre profil
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', zIndex: 1 }}>
      <div className="clx-display" style={{ fontSize: 52, lineHeight: 1, marginBottom: 4 }}>CALYXTER</div>
      <div className="clx-mono" style={{ fontSize: 12, color: '#9A958C', marginBottom: 36 }}>SET MANAGER</div>

      <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', marginBottom: 14, textAlign: 'center', maxWidth: 380 }}>
        Choisis ton profil pour continuer.
      </div>

      {error && (
        <div style={{ color: '#C1454B', fontSize: 12, marginBottom: 16, textAlign: 'center', maxWidth: 380 }}>{error}</div>
      )}

      {members.length === 0 && !error && (
        <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862' }}>Chargement des membres…</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, width: '100%', maxWidth: 460 }}>
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => selectMember(m)}
            className="clx-card clx-btn"
            style={{ padding: '18px 14px', textAlign: 'left', color: '#F5F1E8' }}
          >
            <div className="clx-tape" />
            <div className="clx-display" style={{ fontSize: 24 }}>{m.name}</div>
            <div className="clx-mono" style={{ fontSize: 11, color: '#9A958C', marginTop: 2 }}>{m.instrument}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TOP BAR                                                             */
/* ------------------------------------------------------------------ */

function TopBar({ currentUser, onSignOut, onOpenSettings, tab, setTab, phaseActive }) {
  return (
    <header style={{ borderBottom: '1px solid #2A2A2E', position: 'sticky', top: 0, zIndex: 10, background: '#0B0B0Cee', backdropFilter: 'blur(6px)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="clx-display" style={{ fontSize: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#F2A93B' }}>●</span> CALYXTER
        </div>

        <nav className="clx-topnav" style={{ display: 'flex', gap: 4 }}>
          <TabButton icon={ListMusic} label="Répertoire" active={tab === 'repertoire'} onClick={() => setTab('repertoire')} />
          <TabButton icon={ListPlus} label="Phase de choix" active={tab === 'phase'} onClick={() => setTab('phase')} pulse={phaseActive} />
          <TabButton icon={Calendar} label="Rendez-vous" active={tab === 'rendezvous'} onClick={() => setTab('rendezvous')} />
          <TabButton icon={Mic2} label="Concerts" active={tab === 'concerts'} onClick={() => setTab('concerts')} />
          <TabButton icon={MessageCircle} label="Historique" active={tab === 'notifications'} onClick={() => setTab('notifications')} />
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onOpenSettings} title="Réglages" className="clx-btn clx-btn-ghost" style={{ padding: 8, borderRadius: 6, display: 'flex' }}>
            <Settings size={15} />
          </button>
          <div className="clx-mono" style={{ fontSize: 12, color: '#9A958C', padding: '0 4px' }}>
            {currentUser.name} · {currentUser.instrument}
          </div>
          <button onClick={onSignOut} title="Changer de compte" className="clx-btn clx-btn-ghost" style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12 }}>
            Changer de compte
          </button>
        </div>
      </div>
    </header>
  );
}

function TabButton({ icon: Icon, label, active, onClick, pulse }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="clx-btn clx-tab-btn"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 6,
        background: active ? '#1B1B1F' : 'transparent',
        color: active ? '#F2A93B' : '#9A958C',
        border: active ? '1px solid #2A2A2E' : '1px solid transparent',
        fontSize: 13, position: 'relative', flexShrink: 0, whiteSpace: 'nowrap',
      }}
    >
      <Icon size={14} style={{ flexShrink: 0 }} />
      <span className="clx-tab-label">{label}</span>
      {pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C1454B', marginLeft: 2, flexShrink: 0 }} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  REPERTOIRE TAB                                                      */
/* ------------------------------------------------------------------ */

function Repertoire({ songs, allSongsCount, totalSeconds, search, setSearch, statusFilter, setStatusFilter, langFilter, setLangFilter, artistFilter, setArtistFilter, artistOptions, members, currentUser, onAddClick, onEditClick }) {
  return (
    <div>
      <div className="clx-counter" style={{ padding: '16px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{songs.length}</span> morceau{songs.length > 1 ? 'x' : ''} affiché{songs.length > 1 ? 's' : ''}
          {songs.length !== allSongsCount && <span style={{ color: '#6B6862' }}> / {allSongsCount}</span>}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Total : {formatTotalDuration(totalSeconds)}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: '#6B6862' }} />
          <input
            className="clx-input"
            style={{ paddingLeft: 32 }}
            placeholder="Rechercher un titre ou un artiste…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button onClick={onAddClick} className="clx-btn clx-btn-primary" style={{ borderRadius: 6, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={15} /> Ajouter un morceau
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <select
          className="clx-input"
          style={{ maxWidth: 260 }}
          value={artistFilter}
          onChange={(e) => setArtistFilter(e.target.value)}
        >
          <option value="all">Tous les artistes</option>
          {artistOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Tous</Chip>
        {Object.entries(STATUS).map(([key, v]) => (
          <Chip key={key} active={statusFilter === key} onClick={() => setStatusFilter(key)}>{v.badge}</Chip>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <Chip active={langFilter === 'all'} onClick={() => setLangFilter('all')}>Toutes langues</Chip>
        <Chip active={langFilter === 'FR'} onClick={() => setLangFilter('FR')}>Francophone</Chip>
        <Chip active={langFilter === 'EN'} onClick={() => setLangFilter('EN')}>Anglophone</Chip>
        <Chip active={langFilter === 'INSTRUMENTAL'} onClick={() => setLangFilter('INSTRUMENTAL')}>Instrumental</Chip>
        <Chip active={langFilter === 'OTHER'} onClick={() => setLangFilter('OTHER')}>Inconnu</Chip>
      </div>

      {songs.length === 0 ? (
        <EmptyState text="Aucun morceau ne correspond à ces filtres." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {songs.map((song) => (
            <SongRow key={song.id} song={song} members={members} currentUser={currentUser} onEdit={onEditClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return <button onClick={onClick} className={`clx-chip ${active ? 'active' : ''}`}>{children}</button>;
}

function EmptyState({ text }) {
  return (
    <div className="clx-card" style={{ padding: '32px 20px', textAlign: 'center', color: '#6B6862' }}>
      <Music2 size={22} style={{ marginBottom: 8, opacity: 0.6 }} />
      <div className="clx-mono" style={{ fontSize: 12 }}>{text}</div>
    </div>
  );
}

function SongRow({ song, members, currentUser, onEdit }) {
  const author = members.find((m) => m.id === song.added_by_user_id);
  const st = STATUS[song.status];
  const missing = !song.duration_seconds || !song.language || song.language === 'OTHER';
  const coverUrl = song.links?.cover_url;
  return (
    <div className="clx-card clx-row" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="clx-song-cover"
          style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0, objectFit: 'cover', border: '1px solid #2A2A2E' }}
        />
      ) : (
        <div className="clx-song-cover" style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0, background: '#101012', border: '1px solid #2A2A2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Music2 size={16} color="#6B6862" />
        </div>
      )}

      <div className="clx-song-info" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{song.title}</div>
        <div style={{ fontSize: 13, color: '#9A958C' }}>{song.artist}{song.album ? ` · ${song.album}` : ''}</div>
        {author && <div className="clx-mono" style={{ fontSize: 10, color: '#6B6862', marginTop: 4 }}>Proposé par {author.name} ({author.instrument})</div>}
      </div>

      <div className="clx-song-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="clx-badge" style={{ background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}>{st.badge}</span>
          {song.language && <span className="clx-badge" style={{ background: `${LANGUAGE_TAG[song.language].color}22`, color: LANGUAGE_TAG[song.language].color, border: `1px solid ${LANGUAGE_TAG[song.language].color}55` }}>{LANGUAGE_TAG[song.language].short}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="clx-mono" style={{ fontSize: 13, color: song.duration_seconds ? '#9A958C' : '#C1454B', width: 46, textAlign: 'right' }}>
            {formatSongDuration(song.duration_seconds)}
          </div>

          {onEdit && (
            <button
              onClick={() => onEdit(song)}
              className="clx-btn clx-btn-ghost"
              style={{ padding: '7px 8px', borderRadius: 6, display: 'flex', color: missing ? '#F2A93B' : '#F5F1E8' }}
              title={missing ? 'Compléter les données manquantes' : 'Modifier le morceau'}
            >
              <Pencil size={13} />
            </button>
          )}

          <a
            href={listenUrl(song, currentUser.preferred_platform)}
            target="_blank"
            rel="noopener noreferrer"
            className="clx-btn clx-btn-ghost"
            style={{ padding: '7px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#F5F1E8', textDecoration: 'none' }}
            title={song.links?.custom_url ? 'Ouvrir le lien' : `Chercher sur ${PLATFORMS[currentUser.preferred_platform] || 'Spotify'}`}
          >
            <Radio size={13} /> <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ADD SONG MODAL (manual entry)                                      */
/* ------------------------------------------------------------------ */

function AddSongModal({ currentUser, onClose, onAdd, onDelete, initialSong, existingSongs }) {
  const isEdit = !!initialSong;
  const [title, setTitle] = useState(initialSong?.title || '');
  const [artist, setArtist] = useState(initialSong?.artist || '');
  const [album, setAlbum] = useState(initialSong?.album || '');
  const [duration, setDuration] = useState(initialSong?.duration_seconds ? formatSongDuration(initialSong.duration_seconds) : '');
  const [language, setLanguage] = useState(initialSong?.language || 'FR');
  const [status, setStatus] = useState(initialSong?.status || 'proposed');
  const [customUrl, setCustomUrl] = useState(initialSong?.links?.custom_url || '');
  const [deezerUrl, setDeezerUrl] = useState(initialSong?.links?.deezer_url || '');
  const [coverUrl, setCoverUrl] = useState(initialSong?.links?.cover_url || '');
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const found = await searchDeezer(query.trim());
        setResults(found);
        setSearchError('');
      } catch (err) {
        setSearchError(err.message || 'Recherche indisponible.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const applyResult = (r) => {
    setTitle(r.title || '');
    setArtist(r.artist || '');
    setAlbum(r.album || '');
    setDuration(r.duration_seconds ? formatSongDuration(r.duration_seconds) : '');
    setDeezerUrl(r.deezer_url || '');
    setCoverUrl(r.cover_url || '');
    setResults([]);
    setQuery('');
  };

  const submit = () => {
    if (!title.trim() || !artist.trim()) { setError('Titre et artiste sont obligatoires.'); return; }
    const seconds = parseDurationInput(duration);
    if (duration && seconds === null) { setError('Format de durée invalide (mm:ss).'); return; }

    const normalizedTitle = title.trim().toLowerCase();
    const normalizedArtist = artist.trim().toLowerCase();
    const duplicate = (existingSongs || []).find((s) =>
      s.id !== initialSong?.id &&
      s.title.trim().toLowerCase() === normalizedTitle &&
      s.artist.trim().toLowerCase() === normalizedArtist
    );
    if (duplicate) {
      setError(`« ${title.trim()} » de ${artist.trim()} est déjà dans le répertoire (statut : ${STATUS[duplicate.status].label}).`);
      return;
    }

    const links = {};
    if (deezerUrl) links.deezer_url = deezerUrl;
    if (coverUrl) links.cover_url = coverUrl;
    if (customUrl.trim()) links.custom_url = customUrl.trim();

    if (isEdit) {
      onAdd({
        ...initialSong,
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        duration_seconds: seconds || 0,
        language,
        status,
        links,
      });
      return;
    }

    onAdd({
      id: uid('sng'),
      title: title.trim(),
      artist: artist.trim(),
      album: album.trim(),
      duration_seconds: seconds || 0,
      language,
      status: 'proposed',
      added_by_user_id: currentUser.id,
      created_at: new Date().toISOString(),
      links,
    });
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Modifier le morceau' : 'Ajouter un morceau'} icon={isEdit ? Pencil : Plus}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Rechercher sur Deezer (auto-complétion)">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: '#6B6862' }} />
            <input
              className="clx-input"
              style={{ paddingLeft: 32 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Titre, artiste…"
            />
            {searching && <Loader2 size={14} className="clx-spin" style={{ position: 'absolute', right: 11, top: 11, color: '#6B6862' }} />}
          </div>
        </Field>

        {searchError && <div style={{ color: '#C1454B', fontSize: 12 }}>{searchError}</div>}

        {results.length > 0 && (
          <div className="clx-card clx-scrollbar" style={{ maxHeight: 220, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyResult(r)}
                className="clx-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 6, background: 'transparent', border: 'none', textAlign: 'left', color: '#F5F1E8' }}
              >
                {r.cover_url ? (
                  <img src={r.cover_url} alt="" style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, background: '#101012', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music2 size={14} color="#6B6862" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: '#9A958C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.artist}{r.album ? ` · ${r.album}` : ''}</div>
                </div>
                <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', flexShrink: 0 }}>{formatSongDuration(r.duration_seconds)}</div>
              </button>
            ))}
          </div>
        )}

        <div className="clx-mono" style={{ fontSize: 10, color: '#6B6862' }}>
          Clique un résultat pour préremplir la fiche — ou complète tout manuellement ci-dessous (compositions, démos…).
        </div>

        <Field label="Titre *"><input className="clx-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Hocus Pocus" /></Field>
        <Field label="Artiste *"><input className="clx-input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Ex. Focus" /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Album" style={{ flex: 1 }}><input className="clx-input" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="Optionnel" /></Field>
          <Field label="Durée (mm:ss)" style={{ width: 120 }}><input className="clx-input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="4:25" /></Field>
        </div>
        <Field label="Langue">
          <select className="clx-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {isEdit && (
          <Field label="Statut">
            <select className="clx-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        )}
        {isEdit && status !== initialSong.status && (
          <div className="clx-mono" style={{ fontSize: 10, color: '#E8B04B' }}>
            Changement manuel de statut, en dehors d'une phase de choix — à utiliser avec discernement.
          </div>
        )}
        <Field label="Lien externe (YouTube, SoundCloud, Drive…)">
          <input className="clx-input" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="Pour une composition ou une démo" />
        </Field>
        {error && <div style={{ color: '#C1454B', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {isEdit ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Supprimer définitivement « ${initialSong.title} » du répertoire ? Cette action est irréversible.`)) {
                  onDelete(initialSong.id);
                }
              }}
              className="clx-btn"
              style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55' }}
            >
              Supprimer
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="clx-btn clx-btn-ghost" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13 }}>Annuler</button>
            <button onClick={submit} className="clx-btn clx-btn-primary" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13 }}>{isEdit ? 'Enregistrer les modifications' : 'Ajouter au répertoire'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#9A958C', ...style }}>
      {label}
      {children}
    </label>
  );
}

function Modal({ onClose, title, icon: Icon, children, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }} onClick={onClose}>
      <div
        className="clx-card clx-scrollbar"
        style={{ width: '100%', maxWidth: wide ? 560 : 420, maxHeight: '88vh', overflowY: 'auto', padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="clx-tape" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="clx-display" style={{ fontSize: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
            {Icon && <Icon size={18} color="#F2A93B" />} {title}
          </div>
          <button onClick={onClose} className="clx-btn clx-btn-ghost" style={{ padding: 6, borderRadius: 6, display: 'flex' }}><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsModal({ currentUser, onClose, onSave }) {
  const [platform, setPlatform] = useState(currentUser.preferred_platform || 'spotify');
  return (
    <Modal onClose={onClose} title="Réglages" icon={Settings}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#9A958C' }}>Connecté en tant que <strong style={{ color: '#F5F1E8' }}>{currentUser.name}</strong> ({currentUser.instrument})</div>
        <Field label="Service d'écoute préféré">
          <select className="clx-input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button onClick={onClose} className="clx-btn clx-btn-ghost" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13 }}>Annuler</button>
          <button onClick={() => onSave(platform)} className="clx-btn clx-btn-primary" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13 }}>Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  NOTIFICATION LOG (historique des événements du groupe)             */
/* ------------------------------------------------------------------ */

function NotificationLog({ notifications }) {
  return (
    <div>
      <div className="clx-display" style={{ fontSize: 22, marginBottom: 4 }}>Historique du groupe</div>
      <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', marginBottom: 18 }}>
        Journal des événements : ajouts, votes, changements de statut, concerts…
      </div>
      {notifications.length === 0 ? (
        <EmptyState text="Aucune notification pour l'instant." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => (
            <div key={n.id} className="clx-card" style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 13 }}>{n.text}</div>
              <div className="clx-mono" style={{ fontSize: 10, color: '#6B6862', marginTop: 3 }}>
                {new Date(n.created_at).toLocaleString('fr-FR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PHASE WORKFLOW TAB                                                  */
/* ------------------------------------------------------------------ */

function PhaseWorkflow({ phase, songs, members, currentUser, updatePhase, updateSongs, deleteSong, pushNotification }) {
  if (!phase) {
    return <NoPhase members={members} currentUser={currentUser} updatePhase={updatePhase} pushNotification={pushNotification} />;
  }

  const initiator = members.find((m) => m.id === phase.initiated_by_user_id);
  const isInitiator = currentUser.id === phase.initiated_by_user_id;
  const stepIndex = STEP_ORDER.indexOf(phase.current_step);

  const advance = async () => {
    const next = STEP_ORDER[stepIndex + 1];
    if (!next) return;
    await updatePhase((p) => ({ ...p, current_step: next }));
    await pushNotification(`➡️ La phase passe à l'étape « ${STEP_LABEL[next]} ».`, 'step');
  };

  return (
    <div>
      <div className="clx-display" style={{ fontSize: 24, marginBottom: 2 }}>Phase de choix en cours</div>
      <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', marginBottom: 18 }}>
        Lancée par {initiator ? initiator.name : '—'} · {new Date(phase.created_at).toLocaleDateString('fr-FR')}
      </div>

      <Stepper
        current={phase.current_step}
        stats={{
          proposal: songs.filter((s) => s.status === 'proposed' && s.created_at && new Date(s.created_at) >= new Date(phase.created_at)).length,
          veto: phase.vetoes.length,
          vote: `${phase.votes.length}/${members.length}`,
        }}
      />

      <div style={{ marginTop: 20 }}>
        {phase.current_step === 'proposal' && (
          <ProposalStep songs={songs} members={members} currentUser={currentUser} updateSongs={updateSongs} deleteSong={deleteSong} pushNotification={pushNotification} />
        )}
        {phase.current_step === 'veto' && (
          <VetoStep songs={songs} members={members} currentUser={currentUser} phase={phase} updateSongs={updateSongs} updatePhase={updatePhase} pushNotification={pushNotification} />
        )}
        {phase.current_step === 'vote' && (
          <VoteStep songs={songs} members={members} currentUser={currentUser} phase={phase} updatePhase={updatePhase} />
        )}
        {phase.current_step === 'result' && (
          <ResultStep songs={songs} members={members} currentUser={currentUser} phase={phase} updatePhase={updatePhase} updateSongs={updateSongs} pushNotification={pushNotification} isInitiator={isInitiator} />
        )}
      </div>

      {phase.current_step !== 'result' && (
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          {isInitiator ? (
            <button onClick={advance} className="clx-btn clx-btn-primary" style={{ padding: '10px 18px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Passer à l'étape suivante <ChevronRight size={15} />
            </button>
          ) : (
            <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862' }}>
              Seul·e {initiator ? initiator.name : "l'initiateur·rice"} peut faire avancer cette phase.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoPhase({ members, currentUser, updatePhase, pushNotification }) {
  const launch = async () => {
    const newPhase = {
      id: uid('phs'),
      initiated_by_user_id: currentUser.id,
      current_step: 'proposal',
      vetoes: [],
      votes: [],
      vote_drafts: {},
      tie_break_votes: [],
      created_at: new Date().toISOString(),
    };
    await updatePhase(newPhase);
    await pushNotification(`🚀 ${currentUser.name} a lancé une nouvelle phase de choix !`, 'launch');
  };

  return (
    <div className="clx-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div className="clx-tape" />
      <ListPlus size={26} color="#F2A93B" style={{ marginBottom: 10 }} />
      <div className="clx-display" style={{ fontSize: 24, marginBottom: 6 }}>Aucune phase en cours</div>
      <div style={{ fontSize: 13, color: '#9A958C', maxWidth: 380, margin: '0 auto 20px' }}>
        Proposition → Veto → Vote → Résultat. N'importe quel membre du groupe peut lancer une phase de choix.
      </div>
      <button onClick={launch} className="clx-btn clx-btn-primary" style={{ padding: '10px 20px', borderRadius: 6, fontSize: 13 }}>
        Lancer une phase de choix
      </button>
    </div>
  );
}

function Stepper({ current, stats }) {
  const idx = STEP_ORDER.indexOf(current);
  const STEP_STAT_TEXT = {
    proposal: (s) => `${s} proposé${s > 1 ? 's' : ''}`,
    veto: (s) => `${s} rejeté${s > 1 ? 's' : ''}`,
    vote: (s) => `${s} voté`,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {STEP_ORDER.map((step, i) => (
        <React.Fragment key={step}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 64 }}>
            <div className="clx-mono" style={{
              width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: i < idx ? '#6FA28733' : i === idx ? '#F2A93B' : '#16161A',
              color: i < idx ? '#6FA287' : i === idx ? '#16130A' : '#6B6862',
              border: i === idx ? 'none' : '1px solid #2A2A2E',
            }}>
              {i < idx ? <Check size={14} /> : i + 1}
            </div>
            <div style={{ fontSize: 11, color: i === idx ? '#F2A93B' : '#6B6862', textAlign: 'center' }}>{STEP_LABEL[step]}</div>
            {stats && stats[step] !== undefined && (
              <div className="clx-mono" style={{ fontSize: 9, color: '#6B6862', textAlign: 'center' }}>
                {STEP_STAT_TEXT[step](stats[step])}
              </div>
            )}
          </div>
          {i < STEP_ORDER.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < idx ? '#6FA28755' : '#2A2A2E', marginTop: 15 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* --- Step 1 : Proposition -------------------------------------------------- */

function ProposalStep({ songs, members, currentUser, updateSongs, deleteSong, pushNotification }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const proposed = songs.filter((s) => s.status === 'proposed');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#9A958C' }}>{proposed.length} morceau{proposed.length > 1 ? 'x' : ''} proposé{proposed.length > 1 ? 's' : ''}</div>
        <button onClick={() => setShowAdd(true)} className="clx-btn clx-btn-primary" style={{ padding: '8px 14px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <Plus size={14} /> Proposer un morceau
        </button>
      </div>
      {proposed.length === 0 ? <EmptyState text="Aucune proposition pour l'instant." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {proposed.map((s) => <SongRow key={s.id} song={s} members={members} currentUser={currentUser} onEdit={setEditingSong} />)}
        </div>
      )}
      {showAdd && (
        <AddSongModal
          currentUser={currentUser}
          existingSongs={songs}
          onClose={() => setShowAdd(false)}
          onAdd={async (song) => {
            await updateSongs((prev) => [...prev, song]);
            await pushNotification(`🎵 ${currentUser.name} propose « ${song.title} » pour cette phase.`, 'info');
            setShowAdd(false);
          }}
        />
      )}
      {editingSong && (
        <AddSongModal
          currentUser={currentUser}
          initialSong={editingSong}
          existingSongs={songs}
          onClose={() => setEditingSong(null)}
          onAdd={async (updatedSong) => {
            const previousStatus = editingSong.status;
            const statusChanged = updatedSong.status !== previousStatus;
            await updateSongs((prev) => prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)));
            if (statusChanged) {
              await pushNotification(`🔧 ${currentUser.name} a changé manuellement le statut de « ${updatedSong.title} » : ${STATUS[previousStatus].label} → ${STATUS[updatedSong.status].label}.`, 'info');
            } else {
              await pushNotification(`✏️ « ${updatedSong.title} » a été mis à jour par ${currentUser.name}.`, 'info');
            }
            setEditingSong(null);
          }}
          onDelete={async (songId) => {
            const title = editingSong.title;
            await deleteSong(songId);
            await pushNotification(`🗑️ « ${title} » a été supprimé du répertoire par ${currentUser.name}.`, 'info');
            setEditingSong(null);
          }}
        />
      )}
    </div>
  );
}

/* --- Step 2 : Veto ---------------------------------------------------------- */

function VetoStep({ songs, members, currentUser, phase, updateSongs, updatePhase, pushNotification }) {
  const proposed = songs.filter((s) => s.status === 'proposed');
  const myVetoes = phase.vetoes.filter((v) => v.user_id === currentUser.id).map((v) => v.song_id);

  const castVeto = async (song) => {
    if (myVetoes.includes(song.id)) return;
    await updatePhase((p) => ({ ...p, vetoes: [...p.vetoes, { id: uid('vto'), song_id: song.id, user_id: currentUser.id, created_at: new Date().toISOString() }] }));
    await updateSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, status: 'rejected' } : s)));
    await pushNotification(`🚫 Veto posé par ${currentUser.name} sur « ${song.title} ». Le morceau passe au statut Sorti.`, 'veto');
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: '#9A958C', marginBottom: 12 }}>
        Un veto d'un seul membre suffit à faire passer un morceau au statut Sorti, immédiatement et sans appel.
      </div>
      {proposed.length === 0 ? <EmptyState text="Plus aucun morceau proposé — tout est passé en Sorti ou a été traité." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {proposed.map((song) => {
            const vetoedByMe = myVetoes.includes(song.id);
            const vetoesOnSong = phase.vetoes.filter((v) => v.song_id === song.id);
            return (
              <div key={song.id} className="clx-card clx-row" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{song.title}</div>
                  <div style={{ fontSize: 13, color: '#9A958C' }}>{song.artist}</div>
                  {vetoesOnSong.length > 0 && (
                    <div className="clx-mono" style={{ fontSize: 10, color: '#C1454B', marginTop: 4 }}>
                      Veto de {vetoesOnSong.map((v) => members.find((m) => m.id === v.user_id)?.name).join(', ')}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => castVeto(song)}
                  disabled={vetoedByMe}
                  className="clx-btn"
                  style={{
                    padding: '8px 14px', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                    background: vetoedByMe ? '#2A2A2E' : '#C1454B22',
                    color: vetoedByMe ? '#6B6862' : '#C1454B',
                    border: `1px solid ${vetoedByMe ? '#2A2A2E' : '#C1454B55'}`,
                    cursor: vetoedByMe ? 'default' : 'pointer',
                  }}
                >
                  <Ban size={13} /> {vetoedByMe ? 'Veto posé' : 'Poser un veto'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --- Step 3 : Vote ----------------------------------------------------------- */

function VoteStep({ songs, members, currentUser, phase, updatePhase }) {
  const eligible = songs.filter((s) => s.status === 'proposed');
  const N = Math.min(10, eligible.length);
  const existingVote = phase.votes.find((v) => v.user_id === currentUser.id);
  const voteDrafts = phase.vote_drafts || {};
  const myDraft = voteDrafts[currentUser.id];

  const deriveInitialState = () => {
    const eligibleIds = eligible.map((s) => s.id);
    if (existingVote) {
      const rankedIds = [...existingVote.rankings].sort((a, b) => b.points - a.points).map((r) => r.song_id).filter((id) => eligibleIds.includes(id));
      const rest = eligibleIds.filter((id) => !rankedIds.includes(id));
      return { order: [...rankedIds, ...rest], rankedUpTo: rankedIds.length };
    }
    if (myDraft && Array.isArray(myDraft.order)) {
      const validIds = myDraft.order.filter((id) => eligibleIds.includes(id));
      const missing = eligibleIds.filter((id) => !validIds.includes(id));
      return { order: [...validIds, ...missing], rankedUpTo: Math.min(myDraft.rankedUpTo || 0, N) };
    }
    return { order: eligibleIds, rankedUpTo: 0 };
  };

  const initial = deriveInitialState();
  const [order, setOrder] = useState(initial.order);
  const [rankedUpTo, setRankedUpTo] = useState(initial.rankedUpTo);
  const [submitted, setSubmitted] = useState(!!existingVote);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const listRef = useRef(null);
  const scrollTimer = useRef(null);

  const songById = (id) => eligible.find((s) => s.id === id);
  const pointsFor = (index) => (index < Math.min(rankedUpTo, N) ? N - index : null);

  const persist = async (newOrder, newRankedUpTo) => {
    await updatePhase((p) => ({
      ...p,
      vote_drafts: { ...(p.vote_drafts || {}), [currentUser.id]: { order: newOrder, rankedUpTo: newRankedUpTo } },
    }));
  };

  // Move a song from one position to another. A song entering the ranked zone
  // (top of list, or just below an already-noted song) is promoted and takes
  // the note just below the one above it; whatever was there — and everything
  // below — shifts down by one (its note decreases accordingly).
  const moveSong = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const wasRanked = fromIndex < rankedUpTo;
    const next = [...order];
    const [moved] = next.splice(fromIndex, 1);
    let insertAt = toIndex;
    if (fromIndex < toIndex) insertAt -= 1;
    insertAt = Math.max(0, Math.min(insertAt, next.length));
    next.splice(insertAt, 0, moved);

    let newRankedUpTo = rankedUpTo;
    if (!wasRanked && insertAt <= rankedUpTo) {
      newRankedUpTo = Math.min(N, rankedUpTo + 1);
    }

    setOrder(next);
    setRankedUpTo(newRankedUpTo);
    setSubmitted(false);
    persist(next, newRankedUpTo);
  };

  const moveUp = (index) => { if (index > 0) moveSong(index, index - 1); };
  const moveDown = (index) => { if (index < order.length - 1) moveSong(index, index + 1); };

  const stopAutoScroll = () => {
    if (scrollTimer.current) { clearInterval(scrollTimer.current); scrollTimer.current = null; }
  };

  const handleContainerDragOver = (e) => {
    e.preventDefault();
    const el = listRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const threshold = 56;
    stopAutoScroll();
    if (e.clientY < rect.top + threshold) {
      scrollTimer.current = setInterval(() => { el.scrollTop -= 16; }, 30);
    } else if (e.clientY > rect.bottom - threshold) {
      scrollTimer.current = setInterval(() => { el.scrollTop += 16; }, 30);
    }
  };

  const handleDrop = (index) => {
    stopAutoScroll();
    const from = dragIndex.current;
    setDragOverIndex(null);
    dragIndex.current = null;
    if (from === null) return;
    moveSong(from, index);
  };

  const submit = async () => {
    if (rankedUpTo < N) return;
    const rankings = order.slice(0, N).map((id, i) => ({ song_id: id, points: N - i }));
    await updatePhase((p) => ({
      ...p,
      votes: [...p.votes.filter((v) => v.user_id !== currentUser.id), { id: uid('vte'), user_id: currentUser.id, rankings, created_at: new Date().toISOString() }],
    }));
    setSubmitted(true);
  };

  const votedCount = phase.votes.length;
  const remaining = Math.max(0, N - rankedUpTo);

  if (eligible.length === 0) {
    return <EmptyState text="Aucun morceau éligible au vote (tous sont passés en Sorti)." />;
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#9A958C', marginBottom: 4 }}>
        Les morceaux n'ont pas de note au départ. Glisse un morceau en haut de la liste pour lui donner la meilleure note ({N}), ou insère-le juste sous un morceau déjà noté pour qu'il prenne la note juste en dessous — celui-ci et tous ceux en dessous rétrogradent d'un cran.
      </div>
      <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', marginBottom: 14 }}>{votedCount}/{members.length} membres ont validé leur bulletin</div>

      {submitted && (
        <div className="clx-card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, borderColor: '#6FA28755' }}>
          <Check size={15} color="#6FA287" />
          <span style={{ fontSize: 13 }}>Ton bulletin est validé et compte dans le résultat. Tu peux encore le modifier tant que le vote est ouvert.</span>
        </div>
      )}
      {!submitted && (
        <div className="clx-card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, borderColor: '#E8B04B55' }}>
          <Pencil size={14} color="#E8B04B" />
          <span style={{ fontSize: 13 }}>
            Classement en brouillon — conservé automatiquement, même sans validation.
            {remaining > 0 ? ` Encore ${remaining} morceau${remaining > 1 ? 'x' : ''} à classer parmi les ${N} premiers pour pouvoir valider.` : ' Bulletin complet, prêt à valider.'}
          </span>
        </div>
      )}

      <div
        ref={listRef}
        onDragOver={handleContainerDragOver}
        className="clx-scrollbar"
        style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}
      >
        {order.map((songId, index) => {
          const song = songById(songId);
          if (!song) return null;
          const points = pointsFor(index);
          return (
            <div
              key={songId}
              draggable
              onDragStart={() => { dragIndex.current = index; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
              onDragLeave={() => setDragOverIndex((cur) => (cur === index ? null : cur))}
              onDrop={() => handleDrop(index)}
              onDragEnd={stopAutoScroll}
              className="clx-card"
              style={{
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                borderColor: dragOverIndex === index ? '#F2A93B' : undefined,
                cursor: 'grab',
              }}
            >
              <GripVertical size={15} color="#6B6862" style={{ flexShrink: 0 }} />
              <div className="clx-mono" style={{
                width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: points ? '#F2A93B' : '#16161A',
                color: points ? '#16130A' : '#6B6862',
                border: points ? 'none' : '1px solid #2A2A2E',
              }}>
                {points ?? '—'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{song.title}</div>
                <div style={{ fontSize: 12, color: '#9A958C' }}>{song.artist}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="clx-btn clx-btn-ghost"
                  style={{ padding: 4, borderRadius: 4, display: 'flex', opacity: index === 0 ? 0.3 : 1, cursor: index === 0 ? 'default' : 'pointer' }}
                  title="Monter"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === order.length - 1}
                  className="clx-btn clx-btn-ghost"
                  style={{ padding: 4, borderRadius: 4, display: 'flex', opacity: index === order.length - 1 ? 0.3 : 1, cursor: index === order.length - 1 ? 'default' : 'pointer' }}
                  title="Descendre"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={submit}
        disabled={remaining > 0}
        className="clx-btn clx-btn-primary"
        style={{ padding: '10px 18px', borderRadius: 6, fontSize: 13, opacity: remaining > 0 ? 0.4 : 1, cursor: remaining > 0 ? 'default' : 'pointer' }}
      >
        {existingVote ? 'Mettre à jour mon bulletin validé' : 'Valider mon bulletin'}
      </button>
    </div>
  );
}


/* --- Step 4 : Résultat -------------------------------------------------------- */

function ResultStep({ songs, members, currentUser, phase, updatePhase, updateSongs, pushNotification, isInitiator }) {
  const { scored, tieGroup, slotsForTie } = useMemo(() => computeRanking(songs, phase.votes), [songs, phase.votes]);
  const resolution = useMemo(
    () => resolveWithTieBreak(scored, tieGroup, slotsForTie, phase.tie_break_votes || []),
    [scored, tieGroup, slotsForTie, phase.tie_break_votes]
  );

  const quota = resolution.top3 ? applyFrQuota(resolution.top3, scored) : { finalTop3: null };

  const myTieVote = (phase.tie_break_votes || []).find((v) => v.user_id === currentUser.id);

  const castTieVote = async (songId) => {
    await updatePhase((p) => ({
      ...p,
      tie_break_votes: [...(p.tie_break_votes || []).filter((v) => v.user_id !== currentUser.id), { user_id: currentUser.id, song_id: songId }],
    }));
  };

  const finalize = async () => {
    if (!quota.finalTop3) return;
    const winnerIds = quota.finalTop3.map((s) => s.id);
    await updateSongs((prev) => prev.map((s) => (winnerIds.includes(s.id) ? { ...s, status: 'to_prepare' } : s)));
    const names = quota.finalTop3.map((s) => `« ${s.title} »`).join(', ');
    await pushNotification(`🏆 Résultat de la phase : ${names} passent en préparation !${quota.quotaApplied ? ' (quota francophone appliqué)' : ''}`, 'result');
    await updatePhase(null);
  };

  return (
    <div>
      {scored.length === 0 && <EmptyState text="Aucun morceau éligible pour le résultat." />}

      {scored.length > 0 && !resolution.tieResolved && (
        <div className="clx-card" style={{ padding: '16px 18px', marginBottom: 16, borderColor: '#E8B04B55' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color="#E8B04B" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Égalité pour la dernière place qualificative</span>
          </div>
          {!resolution.needsManual ? (
            <>
              <div style={{ fontSize: 13, color: '#9A958C', marginBottom: 10 }}>
                Note individuelle maximale identique — vote de départage express : chaque membre choisit un morceau parmi les ex-æquo.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tieGroup.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => castTieVote(s.id)}
                    className="clx-btn"
                    style={{
                      padding: '9px 14px', borderRadius: 6, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: myTieVote?.song_id === s.id ? '#F2A93B22' : '#101012',
                      border: `1px solid ${myTieVote?.song_id === s.id ? '#F2A93B' : '#2A2A2E'}`,
                      color: '#F5F1E8', fontSize: 13,
                    }}
                  >
                    {s.title} — {s.artist}
                    {myTieVote?.song_id === s.id && <Check size={14} color="#F2A93B" />}
                  </button>
                ))}
              </div>
              <div className="clx-mono" style={{ fontSize: 10, color: '#6B6862', marginTop: 8 }}>
                {(phase.tie_break_votes || []).length}/{members.length} votes de départage enregistrés
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#9A958C' }}>
              L'égalité persiste après le vote de départage express. Comme prévu au règlement, c'est à trancher à l'oral en répétition — l'administrateur·rice peut ensuite ajuster manuellement le statut des morceaux concernés dans le répertoire.
            </div>
          )}
        </div>
      )}

      {scored.length > 0 && resolution.tieResolved && quota.finalTop3 && (
        <>
          <div className="clx-display" style={{ fontSize: 20, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown size={18} color="#F2A93B" /> Top 3 provisoire
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {quota.finalTop3.map((s, i) => (
              <div key={s.id} className="clx-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="clx-display" style={{ fontSize: 22, color: '#F2A93B', width: 28 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.title} {s.language && <span className="clx-badge" style={{ background: `${LANGUAGE_TAG[s.language].color}22`, color: LANGUAGE_TAG[s.language].color, border: `1px solid ${LANGUAGE_TAG[s.language].color}55`, marginLeft: 6 }}>{LANGUAGE_TAG[s.language].short}</span>}</div>
                  <div style={{ fontSize: 12, color: '#9A958C' }}>{s.artist}</div>
                </div>
                <div className="clx-mono" style={{ fontSize: 12, color: '#9A958C' }}>{s.points} pts</div>
              </div>
            ))}
          </div>

          {quota.quotaApplied && (
            <div className="clx-card" style={{ padding: '12px 16px', marginBottom: 16, borderColor: '#F2A93B55', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Flag size={15} color="#F2A93B" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: '#9A958C' }}>
                Quota francophone appliqué : <strong style={{ color: '#F5F1E8' }}>« {quota.bumped?.title} »</strong> cède sa place à <strong style={{ color: '#F5F1E8' }}>« {quota.promoted?.title} »</strong> pour garantir au moins un morceau francophone dans le Top 3.
              </div>
            </div>
          )}

          {isInitiator ? (
            <button onClick={finalize} className="clx-btn clx-btn-primary" style={{ padding: '10px 20px', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={15} /> Finaliser et clôturer la phase
            </button>
          ) : (
            <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862' }}>En attente que l'administrateur·rice de la phase finalise le résultat.</div>
          )}
        </>
      )}

      <details style={{ marginTop: 22 }}>
        <summary className="clx-mono" style={{ fontSize: 11, color: '#6B6862', cursor: 'pointer' }}>Voir le classement complet</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {scored.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 10px', background: '#101012', borderRadius: 4 }}>
              <span>{i + 1}. {s.title} — {s.artist}</span>
              <span className="clx-mono" style={{ color: '#9A958C' }}>{s.points} pts · max {s.maxNote}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CONCERTS TAB — création et gestion des sets de concert             */
/* ------------------------------------------------------------------ */

// event_date est stocké en 'YYYY-MM-DD' : on le parse à la main pour éviter
// tout décalage de fuseau horaire lié à un parsing UTC de new Date(string).
function parseISODate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatConcertDate(dateStr, opts) {
  const d = parseISODate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', opts || { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatConcertTime(timeStr) {
  if (!timeStr) return null;
  return timeStr.slice(0, 5); // 'HH:MM:SS' -> 'HH:MM'
}

function isPastConcert(concert) {
  const d = parseISODate(concert.event_date);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Ajoute `interval` unités (jour/semaine/mois/an) à une date 'YYYY-MM-DD'
// et renvoie la nouvelle date au même format.
function addRecurrenceUnit(dateStr, unit, interval) {
  const d = parseISODate(dateStr);
  if (!d) return null;
  const next = new Date(d);
  if (unit === 'day') next.setDate(next.getDate() + interval);
  else if (unit === 'week') next.setDate(next.getDate() + interval * 7);
  else if (unit === 'month') next.setMonth(next.getMonth() + interval);
  else if (unit === 'year') next.setFullYear(next.getFullYear() + interval);
  return toISODate(next);
}

// Calcule toutes les occurrences d'un rendez-vous (récurrent ou non) entre
// sa date de début et sa date limite (recurrence_until), en excluant les
// occurrences individuellement supprimées (excluded_dates). Un rendez-vous
// non récurrent renvoie une unique occurrence, sur son event_date/end_date.
function generateOccurrences(event) {
  const excluded = new Set(event.excluded_dates || []);

  if (!event.recurrence_unit || !event.recurrence_interval || !event.recurrence_until) {
    if (excluded.has(event.event_date)) return [];
    return [{ occurrenceDate: event.event_date, event_date: event.event_date, end_date: event.end_date || event.event_date }];
  }

  const interval = Math.max(1, parseInt(event.recurrence_interval, 10) || 1);
  const start = parseISODate(event.event_date);
  const end = parseISODate(event.end_date || event.event_date);
  const dayOffset = start && end ? Math.round((end - start) / 86400000) : 0;

  const occurrences = [];
  let cursor = event.event_date;
  let guard = 0;
  while (cursor && cursor <= event.recurrence_until && guard < MAX_RECURRENCE_OCCURRENCES) {
    if (!excluded.has(cursor)) {
      const occEnd = dayOffset > 0 ? addRecurrenceUnit(cursor, 'day', dayOffset) : cursor;
      occurrences.push({ occurrenceDate: cursor, event_date: cursor, end_date: occEnd });
    }
    cursor = addRecurrenceUnit(cursor, event.recurrence_unit, interval);
    guard++;
  }
  return occurrences;
}

const SETLIST_STATUSES = ['ready', 'to_prepare', 'rejected'];

function ConcertsTab({ concerts, songs, members, currentUser, saveConcert, deleteConcert, pushNotification, initialConcertId, onInitialConcertConsumed }) {
  const [editingConcert, setEditingConcert] = useState(undefined); // undefined = liste, null = nouveau, objet = édition

  // Arrivée depuis l'onglet Rendez-vous sur un concert précis : on l'ouvre
  // directement en édition, puis on "consomme" la demande côté App pour ne
  // pas la rejouer si l'utilisateur navigue ensuite librement dans l'onglet.
  useEffect(() => {
    if (!initialConcertId) return;
    const found = concerts.find((c) => c.id === initialConcertId);
    if (found) setEditingConcert(found);
    if (onInitialConcertConsumed) onInitialConcertConsumed();
  }, [initialConcertId, concerts, onInitialConcertConsumed]);

  const sortedConcerts = [...concerts].sort((a, b) => {
    const da = a.event_date || '';
    const db = b.event_date || '';
    if (da !== db) return da < db ? 1 : -1; // descendant par date
    return (b.event_time || '').localeCompare(a.event_time || '');
  });

  if (editingConcert !== undefined) {
    return (
      <ConcertEditor
        concert={editingConcert}
        songs={songs}
        members={members}
        currentUser={currentUser}
        onCancel={() => setEditingConcert(undefined)}
        onSave={async (concert, isNew) => {
          await saveConcert(concert);
          await pushNotification(
            isNew
              ? `🎤 ${currentUser.name} a créé le concert « ${concert.name} » (${formatConcertDate(concert.event_date, { day: 'numeric', month: 'long', year: 'numeric' })}).`
              : `🛠️ ${currentUser.name} a mis à jour le set du concert « ${concert.name} ».`,
            'info'
          );
          setEditingConcert(undefined);
        }}
        onDelete={async (concertId, name) => {
          await deleteConcert(concertId);
          await pushNotification(`🗑️ ${currentUser.name} a supprimé le concert « ${name} ».`, 'info');
          setEditingConcert(undefined);
        }}
      />
    );
  }

  return (
    <div>
      <div className="clx-counter" style={{ padding: '16px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{concerts.length}</span> concert{concerts.length > 1 ? 's' : ''} programmé{concerts.length > 1 ? 's' : ''}
        </div>
        <button onClick={() => setEditingConcert(null)} className="clx-btn clx-btn-primary" style={{ borderRadius: 6, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={15} /> Nouveau concert
        </button>
      </div>

      {sortedConcerts.length === 0 ? (
        <EmptyState text="Aucun concert programmé pour le moment." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedConcerts.map((concert) => (
            <ConcertCard key={concert.id} concert={concert} songs={songs} onOpen={() => setEditingConcert(concert)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConcertCard({ concert, songs, onOpen }) {
  const setSongs = (concert.song_ids || []).map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  const totalSeconds = setSongs.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const past = isPastConcert(concert);
  const time = formatConcertTime(concert.event_time);

  return (
    <button
      onClick={onOpen}
      className="clx-card clx-row"
      style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        width: '100%', textAlign: 'left', color: '#F5F1E8', cursor: 'pointer', opacity: past ? 0.6 : 1,
      }}
    >
      <div
        className="clx-mono"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: 54, height: 54, borderRadius: 6, flexShrink: 0,
          background: past ? '#101012' : '#F2A93B22', border: `1px solid ${past ? '#2A2A2E' : '#F2A93B55'}`,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: past ? '#9A958C' : '#F2A93B' }}>
          {formatConcertDate(concert.event_date, { day: 'numeric' })}
        </div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#6B6862', marginTop: 2 }}>
          {formatConcertDate(concert.event_date, { month: 'short' })}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{concert.name}</div>
        <div style={{ fontSize: 12, color: '#9A958C', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={11} /> {formatConcertDate(concert.event_date)}
          </span>
          {time && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {time}</span>}
          {concert.venue && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {concert.venue}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ textAlign: 'right' }}>
          <div className="clx-mono" style={{ fontSize: 13 }}>{setSongs.length} morceau{setSongs.length > 1 ? 'x' : ''}</div>
          <div className="clx-mono" style={{ fontSize: 11, color: '#9A958C' }}>{formatTotalDuration(totalSeconds)}</div>
        </div>
        <Pencil size={14} color="#6B6862" />
      </div>
    </button>
  );
}

function ConcertEditor({ concert, songs, members, currentUser, onCancel, onSave, onDelete }) {
  const isEdit = !!concert;
  const [name, setName] = useState(concert?.name || '');
  const [eventDate, setEventDate] = useState(concert?.event_date || '');
  const [eventTime, setEventTime] = useState(formatConcertTime(concert?.event_time) || '');
  const [venue, setVenue] = useState(concert?.venue || '');
  const [selectedIds, setSelectedIds] = useState((concert?.song_ids || []).filter((id) => songs.some((s) => s.id === id)));
  const [showRejected, setShowRejected] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const listRef = useRef(null);
  const scrollTimer = useRef(null);

  const selectedSongs = selectedIds.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  const totalSeconds = selectedSongs.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  const eligibleStatuses = showRejected ? SETLIST_STATUSES : ['ready', 'to_prepare'];
  const candidateSongs = songs
    .filter((s) => !selectedIds.includes(s.id) && eligibleStatuses.includes(s.status))
    .filter((s) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  const addSong = (songId) => {
    setSelectedIds((prev) => (prev.includes(songId) ? prev : [...prev, songId]));
  };

  const removeSong = (songId) => {
    setSelectedIds((prev) => prev.filter((id) => id !== songId));
  };

  const moveSong = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      let insertAt = toIndex;
      if (fromIndex < toIndex) insertAt -= 1;
      insertAt = Math.max(0, Math.min(insertAt, next.length));
      next.splice(insertAt, 0, moved);
      return next;
    });
  };

  const moveUp = (index) => { if (index > 0) moveSong(index, index - 1); };
  const moveDown = (index) => { if (index < selectedIds.length - 1) moveSong(index, index + 1); };

  const stopAutoScroll = () => {
    if (scrollTimer.current) { clearInterval(scrollTimer.current); scrollTimer.current = null; }
  };

  const handleContainerDragOver = (e) => {
    e.preventDefault();
    const el = listRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const threshold = 56;
    stopAutoScroll();
    if (e.clientY < rect.top + threshold) {
      scrollTimer.current = setInterval(() => { el.scrollTop -= 16; }, 30);
    } else if (e.clientY > rect.bottom - threshold) {
      scrollTimer.current = setInterval(() => { el.scrollTop += 16; }, 30);
    }
  };

  const handleDrop = (index) => {
    stopAutoScroll();
    const from = dragIndex.current;
    setDragOverIndex(null);
    dragIndex.current = null;
    if (from === null || from === undefined) return;
    moveSong(from, index);
  };

  const submit = async () => {
    if (!name.trim()) { setError('Le nom du concert est obligatoire.'); return; }
    if (!eventDate) { setError('La date du concert est obligatoire.'); return; }
    setError('');
    setSaving(true);
    const built = {
      id: concert?.id || uid(),
      name: name.trim(),
      event_date: eventDate,
      event_time: eventTime || null,
      venue: venue.trim() || null,
      song_ids: selectedIds,
      created_by_user_id: concert?.created_by_user_id || currentUser.id,
      created_at: concert?.created_at || new Date().toISOString(),
    };
    try {
      await onSave(built, !isEdit);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Supprimer définitivement le concert « ${concert.name} » ? Cette action est irréversible.`)) {
      onDelete(concert.id, concert.name);
    }
  };

  return (
    <div>
      <button
        onClick={onCancel}
        className="clx-btn clx-btn-ghost"
        style={{ padding: '7px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 16 }}
      >
        <ArrowLeft size={14} /> Retour aux concerts
      </button>

      <div className="clx-display" style={{ fontSize: 24, marginBottom: 18 }}>
        {isEdit ? `Modifier « ${concert.name} »` : 'Nouveau concert'}
      </div>

      <div className="clx-card" style={{ padding: 18, marginBottom: 20 }}>
        <div className="clx-tape" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Field label="Nom du concert *" style={{ flex: '2 1 220px' }}>
            <input className="clx-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Festival des Docks" />
          </Field>
          <Field label="Date *" style={{ flex: '1 1 140px' }}>
            <input type="date" className="clx-input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
          <Field label="Heure" style={{ flex: '1 1 110px' }}>
            <input type="time" className="clx-input" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Lieu">
          <input className="clx-input" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ex. Salle Vasse, Nantes" />
        </Field>
        {error && <div style={{ color: '#C1454B', fontSize: 12, marginTop: 10 }}>{error}</div>}
      </div>

      <div className="clx-counter" style={{ padding: '14px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{selectedSongs.length}</span> morceau{selectedSongs.length > 1 ? 'x' : ''} dans le set
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Durée du set : {formatTotalDuration(totalSeconds)}</div>
      </div>

      {selectedSongs.length === 0 ? (
        <EmptyState text="Aucun morceau sélectionné pour ce concert — ajoute-en depuis la liste ci-dessous." />
      ) : (
        <div
          ref={listRef}
          onDragOver={handleContainerDragOver}
          className="clx-scrollbar"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}
        >
          {selectedIds.map((songId, index) => {
            const song = selectedSongs.find((s) => s.id === songId);
            if (!song) return null;
            return (
              <div
                key={songId}
                draggable
                onDragStart={() => { dragIndex.current = index; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                onDragLeave={() => setDragOverIndex((cur) => (cur === index ? null : cur))}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => { stopAutoScroll(); dragIndex.current = null; setDragOverIndex(null); }}
                className="clx-card"
                style={{
                  padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                  borderColor: dragOverIndex === index ? '#F2A93B' : undefined,
                  cursor: 'grab',
                }}
              >
                <GripVertical size={15} color="#6B6862" style={{ flexShrink: 0 }} />
                <div className="clx-mono" style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0, background: '#16161A', color: '#F2A93B', border: '1px solid #2A2A2E',
                }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                  <div style={{ fontSize: 12, color: '#9A958C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>
                </div>
                <span
                  className="clx-badge"
                  style={{ background: `${STATUS[song.status].color}22`, color: STATUS[song.status].color, border: `1px solid ${STATUS[song.status].color}55`, flexShrink: 0 }}
                >
                  {STATUS[song.status].badge}
                </span>
                <div className="clx-mono" style={{ fontSize: 12, color: '#9A958C', width: 40, textAlign: 'right', flexShrink: 0 }}>
                  {formatSongDuration(song.duration_seconds)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="clx-btn clx-btn-ghost"
                    style={{ padding: 3, borderRadius: 4, display: 'flex', opacity: index === 0 ? 0.3 : 1, cursor: index === 0 ? 'default' : 'pointer' }}
                    title="Monter"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === selectedIds.length - 1}
                    className="clx-btn clx-btn-ghost"
                    style={{ padding: 3, borderRadius: 4, display: 'flex', opacity: index === selectedIds.length - 1 ? 0.3 : 1, cursor: index === selectedIds.length - 1 ? 'default' : 'pointer' }}
                    title="Descendre"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
                <button
                  onClick={() => removeSong(songId)}
                  className="clx-btn clx-btn-ghost"
                  style={{ padding: '6px 7px', borderRadius: 4, display: 'flex', flexShrink: 0, color: '#C1454B' }}
                  title="Retirer du set"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="clx-display" style={{ fontSize: 18, marginBottom: 10 }}>Ajouter des morceaux</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: '#6B6862' }} />
          <input
            className="clx-input"
            style={{ paddingLeft: 32 }}
            placeholder="Rechercher un titre ou un artiste…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <Chip active={!showRejected} onClick={() => setShowRejected(false)}>Prêt + En préparation</Chip>
        <Chip active={showRejected} onClick={() => setShowRejected(true)}>+ Inclure les morceaux sortis</Chip>
      </div>

      {candidateSongs.length === 0 ? (
        <EmptyState text="Aucun morceau disponible avec ces critères." />
      ) : (
        <div className="clx-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '40vh', overflowY: 'auto', paddingRight: 4, marginBottom: 24 }}>
          {candidateSongs.map((song) => (
            <div key={song.id} className="clx-card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                <div style={{ fontSize: 12, color: '#9A958C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>
              </div>
              <span
                className="clx-badge"
                style={{ background: `${STATUS[song.status].color}22`, color: STATUS[song.status].color, border: `1px solid ${STATUS[song.status].color}55`, flexShrink: 0 }}
              >
                {STATUS[song.status].badge}
              </span>
              <div className="clx-mono" style={{ fontSize: 12, color: '#9A958C', width: 40, textAlign: 'right', flexShrink: 0 }}>
                {formatSongDuration(song.duration_seconds)}
              </div>
              <button
                onClick={() => addSong(song.id)}
                className="clx-btn clx-btn-ghost"
                style={{ padding: '6px 8px', borderRadius: 6, display: 'flex', flexShrink: 0 }}
                title="Ajouter au set"
              >
                <Plus size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {isEdit ? (
          <button
            onClick={handleDelete}
            className="clx-btn"
            style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={14} /> Supprimer le concert
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="clx-btn clx-btn-ghost" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13 }}>Annuler</button>
          <button
            onClick={submit}
            disabled={saving}
            className="clx-btn clx-btn-primary"
            style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Enregistrement…' : (isEdit ? 'Enregistrer les modifications' : 'Créer le concert')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RENDEZ-VOUS TAB — agenda unifié (événements + concerts en lecture) */
/* ------------------------------------------------------------------ */

function mergeEventsAndConcerts(events, concerts) {
  const fromEvents = events.flatMap((e) => {
    const isRecurring = !!(e.recurrence_unit && e.recurrence_interval && e.recurrence_until);
    return generateOccurrences(e).map((occ) => ({
      id: e.id,
      occurrenceKey: `${e.id}::${occ.occurrenceDate}`,
      occurrenceDate: occ.occurrenceDate,
      source: 'event',
      isRecurring,
      kind: e.kind || 'autre',
      subject: e.subject,
      event_date: occ.event_date,
      end_date: occ.end_date,
      all_day: !!e.all_day,
      start_time: e.start_time,
      end_time: e.end_time,
      venue: e.venue,
      participant_ids: e.participant_ids || [],
      raw: e,
    }));
  });
  const fromConcerts = concerts.map((c) => ({
    id: c.id,
    occurrenceKey: `concert::${c.id}`,
    occurrenceDate: c.event_date,
    source: 'concert',
    isRecurring: false,
    kind: 'concert',
    subject: c.name,
    event_date: c.event_date,
    end_date: c.event_date, // un concert reste ponctuel, sur un seul jour
    all_day: false,
    start_time: c.event_time,
    end_time: null,
    venue: c.venue,
    participant_ids: null, // un concert engage tout le groupe
    raw: c,
  }));
  return [...fromEvents, ...fromConcerts].sort((a, b) => {
    const da = a.event_date || '';
    const db = b.event_date || '';
    if (da !== db) return da < db ? 1 : -1; // décroissant par date
    return (b.start_time || '').localeCompare(a.start_time || '');
  });
}

function RendezVousTab({ events, concerts, members, currentUser, saveEvent, deleteEvent, pushNotification, onViewConcert }) {
  const [editingEvent, setEditingEvent] = useState(undefined); // undefined = liste, null = nouveau, objet = édition

  const merged = mergeEventsAndConcerts(events, concerts);

  if (editingEvent !== undefined) {
    return (
      <RendezVousEditor
        event={editingEvent}
        members={members}
        currentUser={currentUser}
        onCancel={() => setEditingEvent(undefined)}
        onSave={async (event, isNew) => {
          await saveEvent(event);
          await pushNotification(
            isNew
              ? `🗓️ ${currentUser.name} a ajouté un rendez-vous : « ${event.subject} » (${formatConcertDate(event.event_date, { day: 'numeric', month: 'long', year: 'numeric' })}).`
              : `🛠️ ${currentUser.name} a modifié le rendez-vous « ${event.subject} ».`,
            'info'
          );
          setEditingEvent(undefined);
        }}
        onDelete={async (eventId, subject) => {
          await deleteEvent(eventId);
          await pushNotification(`🗑️ ${currentUser.name} a supprimé le rendez-vous « ${subject} ».`, 'info');
          setEditingEvent(undefined);
        }}
      />
    );
  }

  return (
    <div>
      <div className="clx-counter" style={{ padding: '16px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{merged.length}</span> rendez-vous
        </div>
        <button onClick={() => setEditingEvent(null)} className="clx-btn clx-btn-primary" style={{ borderRadius: 6, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={15} /> Nouveau rendez-vous
        </button>
      </div>

      {merged.length === 0 ? (
        <EmptyState text="Aucun rendez-vous programmé pour le moment." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {merged.map((item) => (
            <RendezVousCard
              key={item.occurrenceKey}
              item={item}
              members={members}
              onOpen={() => {
                if (item.source === 'concert') {
                  onViewConcert(item.id);
                } else {
                  setEditingEvent(item.raw);
                }
              }}
              onQuickDelete={item.source === 'concert' ? undefined : async () => {
                if (item.isRecurring) {
                  if (!window.confirm(`Supprimer uniquement l'occurrence du ${formatConcertDate(item.occurrenceDate, { day: 'numeric', month: 'long', year: 'numeric' })} pour « ${item.subject} » ? Les autres dates de la série ne seront pas affectées.`)) return;
                  const updated = { ...item.raw, excluded_dates: [...new Set([...(item.raw.excluded_dates || []), item.occurrenceDate])] };
                  await saveEvent(updated);
                  await pushNotification(`🗑️ ${currentUser.name} a supprimé une occurrence du rendez-vous récurrent « ${item.subject} » (${formatConcertDate(item.occurrenceDate, { day: 'numeric', month: 'long', year: 'numeric' })}).`, 'info');
                } else {
                  if (!window.confirm(`Supprimer définitivement le rendez-vous « ${item.subject} » ? Cette action est irréversible.`)) return;
                  await deleteEvent(item.raw.id);
                  await pushNotification(`🗑️ ${currentUser.name} a supprimé le rendez-vous « ${item.subject} ».`, 'info');
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RendezVousCard({ item, members, onOpen, onQuickDelete }) {
  const kindInfo = item.source === 'concert' ? CONCERT_EVENT_KIND : (EVENT_KIND[item.kind] || EVENT_KIND.autre);
  const past = isPastConcert({ event_date: item.end_date || item.event_date });
  const isMultiDay = item.end_date && item.end_date !== item.event_date;
  const dateLabel = isMultiDay
    ? `Du ${formatConcertDate(item.event_date, { day: 'numeric', month: 'short' })} au ${formatConcertDate(item.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : formatConcertDate(item.event_date);
  const start = formatConcertTime(item.start_time);
  const end = formatConcertTime(item.end_time);
  const timeLabel = item.all_day ? 'Toute la journée' : (start ? (end ? `${start} – ${end}` : start) : null);

  const recurrenceLabel = item.isRecurring
    ? (() => {
        const unit = RECURRENCE_UNIT_LABEL[item.raw.recurrence_unit];
        const interval = item.raw.recurrence_interval;
        const unitLabel = interval > 1 ? unit.plural : unit.singular;
        return `Tous les ${interval} ${unitLabel} jusqu'au ${formatConcertDate(item.raw.recurrence_until, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      })()
    : null;

  const participantNames = item.participant_ids === null
    ? 'Tout le groupe'
    : (item.participant_ids.length === 0
      ? 'Aucun participant renseigné'
      : item.participant_ids.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(', '));

  return (
    <div
      className="clx-card clx-row"
      style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        opacity: past ? 0.6 : 1,
      }}
    >
      <button
        onClick={onOpen}
        className="clx-btn"
        style={{
          flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          background: 'transparent', border: 'none', padding: 0, textAlign: 'left', color: '#F5F1E8', cursor: 'pointer',
        }}
      >
        <div
          className="clx-mono"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            width: 54, height: 54, borderRadius: 6, flexShrink: 0,
            background: past ? '#101012' : `${kindInfo.color}22`, border: `1px solid ${past ? '#2A2A2E' : `${kindInfo.color}55`}`,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: past ? '#9A958C' : kindInfo.color }}>
            {formatConcertDate(item.event_date, { day: 'numeric' })}
          </div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#6B6862', marginTop: 2 }}>
            {formatConcertDate(item.event_date, { month: 'short' })}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="clx-badge" style={{ background: `${kindInfo.color}22`, color: kindInfo.color, border: `1px solid ${kindInfo.color}55` }}>{kindInfo.badge}</span>
            {item.isRecurring && (
              <span className="clx-mono" style={{ fontSize: 10, color: '#F2A93B', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Repeat size={10} /> récurrent
              </span>
            )}
            {item.source === 'concert' && (
              <span className="clx-mono" style={{ fontSize: 10, color: '#6B6862', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Mic2 size={10} /> non modifiable ici
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{item.subject}</div>
          <div style={{ fontSize: 12, color: '#9A958C', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={11} /> {dateLabel}
            </span>
            {timeLabel && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {timeLabel}</span>}
            {item.venue && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {item.venue}</span>}
          </div>
          <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
            <Users size={11} /> {participantNames}
          </div>
          {recurrenceLabel && (
            <div className="clx-mono" style={{ fontSize: 10, color: '#6B6862', marginTop: 3 }}>{recurrenceLabel}</div>
          )}
        </div>

        <Pencil size={14} color="#6B6862" style={{ flexShrink: 0 }} />
      </button>

      {onQuickDelete && (
        <button
          onClick={onQuickDelete}
          className="clx-btn clx-btn-ghost"
          style={{ padding: '7px 8px', borderRadius: 6, display: 'flex', flexShrink: 0, color: '#C1454B' }}
          title={item.isRecurring ? 'Supprimer cette occurrence' : 'Supprimer ce rendez-vous'}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function RendezVousEditor({ event, members, currentUser, onCancel, onSave, onDelete }) {
  const isEdit = !!event;
  const [kind, setKind] = useState(event?.kind || 'repetition');
  const [subject, setSubject] = useState(event?.subject || '');
  const [eventDate, setEventDate] = useState(event?.event_date || '');
  const [endDate, setEndDate] = useState(event?.end_date || event?.event_date || '');
  const [allDay, setAllDay] = useState(!!event?.all_day);
  const [startTime, setStartTime] = useState(formatConcertTime(event?.start_time) || '');
  const [endTime, setEndTime] = useState(formatConcertTime(event?.end_time) || '');
  const [venue, setVenue] = useState(event?.venue || '');
  const [participantIds, setParticipantIds] = useState(event?.participant_ids || []);
  const [isRecurring, setIsRecurring] = useState(!!(event?.recurrence_unit && event?.recurrence_interval && event?.recurrence_until));
  const [recurrenceInterval, setRecurrenceInterval] = useState(event?.recurrence_interval || 1);
  const [recurrenceUnit, setRecurrenceUnit] = useState(event?.recurrence_unit || 'week');
  const [recurrenceUntil, setRecurrenceUntil] = useState(event?.recurrence_until || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // La date de fin suit automatiquement la date de début tant que
  // l'utilisateur ne l'a pas modifiée à la main (utile pour une résidence
  // ou tout rendez-vous sur plusieurs jours). En édition, on respecte la
  // date de fin déjà enregistrée sans la réécraser.
  const endDateTouched = useRef(isEdit);
  useEffect(() => {
    if (!endDateTouched.current) setEndDate(eventDate);
  }, [eventDate]);
  const handleEndDateChange = (v) => {
    endDateTouched.current = true;
    setEndDate(v);
  };

  const toggleParticipant = (memberId) => {
    setParticipantIds((prev) => (prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]));
  };

  const allSelected = members.length > 0 && members.every((m) => participantIds.includes(m.id));
  const toggleAll = () => setParticipantIds(allSelected ? [] : members.map((m) => m.id));

  const submit = async () => {
    if (!subject.trim()) { setError("L'objet du rendez-vous est obligatoire."); return; }
    if (!eventDate) { setError('La date est obligatoire.'); return; }
    if (isRecurring) {
      if (!recurrenceInterval || recurrenceInterval < 1) { setError('La fréquence de récurrence doit être supérieure ou égale à 1.'); return; }
      if (!recurrenceUntil) { setError('La date limite de récurrence est obligatoire.'); return; }
      if (recurrenceUntil < eventDate) { setError('La date limite doit être postérieure à la date de début.'); return; }
    }
    setError('');
    setSaving(true);
    const built = {
      id: event?.id || uid(),
      kind,
      subject: subject.trim(),
      event_date: eventDate,
      end_date: endDate || eventDate,
      all_day: allDay,
      start_time: allDay ? null : (startTime || null),
      end_time: allDay ? null : (endTime || null),
      venue: venue.trim() || null,
      participant_ids: participantIds,
      recurrence_unit: isRecurring ? recurrenceUnit : null,
      recurrence_interval: isRecurring ? Math.max(1, parseInt(recurrenceInterval, 10) || 1) : null,
      recurrence_until: isRecurring ? recurrenceUntil : null,
      excluded_dates: event?.excluded_dates || [],
      created_by_user_id: event?.created_by_user_id || currentUser.id,
      created_at: event?.created_at || new Date().toISOString(),
    };
    try {
      await onSave(built, !isEdit);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const isRecurringSeries = !!(event.recurrence_unit && event.recurrence_interval && event.recurrence_until);
    const message = isRecurringSeries
      ? `Supprimer définitivement TOUTE la série « ${event.subject} » (toutes ses occurrences) ? Pour ne retirer qu'une seule date, utilise plutôt le bouton de suppression sur cette occurrence dans la liste. Cette action est irréversible.`
      : `Supprimer définitivement le rendez-vous « ${event.subject} » ? Cette action est irréversible.`;
    if (window.confirm(message)) {
      onDelete(event.id, event.subject);
    }
  };

  return (
    <div>
      <button
        onClick={onCancel}
        className="clx-btn clx-btn-ghost"
        style={{ padding: '7px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 16 }}
      >
        <ArrowLeft size={14} /> Retour aux rendez-vous
      </button>

      <div className="clx-display" style={{ fontSize: 24, marginBottom: 18 }}>
        {isEdit ? `Modifier « ${event.subject} »` : 'Nouveau rendez-vous'}
      </div>

      <div className="clx-card" style={{ padding: 18, marginBottom: 20 }}>
        <div className="clx-tape" />

        <div style={{ marginBottom: 10 }}>
          <Field label="Type de rendez-vous">
            <select className="clx-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(EVENT_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ marginBottom: 10 }}>
          <Field label="Objet *">
            <input className="clx-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. Répétition avant le festival" />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Field label="Date de début *" style={{ flex: '1 1 140px' }}>
            <input type="date" className="clx-input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
          <Field label="Date de fin" style={{ flex: '1 1 140px' }}>
            <input type="date" className="clx-input" value={endDate} min={eventDate || undefined} onChange={(e) => handleEndDateChange(e.target.value)} />
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#F5F1E8', marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: '#F2A93B', cursor: 'pointer' }}
          />
          Toute la journée
        </label>

        {!allDay && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Field label="Début" style={{ flex: '1 1 110px' }}>
              <input type="time" className="clx-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="Fin" style={{ flex: '1 1 110px' }}>
              <input type="time" className="clx-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#F5F1E8', marginBottom: isRecurring ? 10 : 0, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: '#F2A93B', cursor: 'pointer' }}
          />
          <Repeat size={13} /> Rendez-vous récurrent
        </label>

        {isRecurring && (
          <div style={{ background: '#101012', border: '1px solid #2A2A2E', borderRadius: 6, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#9A958C' }}>Tous les</span>
              <input
                type="number"
                min={1}
                className="clx-input"
                style={{ width: 64 }}
                value={recurrenceInterval}
                onChange={(e) => setRecurrenceInterval(e.target.value)}
              />
              <select className="clx-input" style={{ width: 130 }} value={recurrenceUnit} onChange={(e) => setRecurrenceUnit(e.target.value)}>
                <option value="day">{recurrenceInterval > 1 ? RECURRENCE_UNIT_LABEL.day.plural : RECURRENCE_UNIT_LABEL.day.singular}</option>
                <option value="week">{recurrenceInterval > 1 ? RECURRENCE_UNIT_LABEL.week.plural : RECURRENCE_UNIT_LABEL.week.singular}</option>
                <option value="month">{recurrenceInterval > 1 ? RECURRENCE_UNIT_LABEL.month.plural : RECURRENCE_UNIT_LABEL.month.singular}</option>
                <option value="year">{recurrenceInterval > 1 ? RECURRENCE_UNIT_LABEL.year.plural : RECURRENCE_UNIT_LABEL.year.singular}</option>
              </select>
            </div>
            <Field label="Jusqu'au *">
              <input type="date" className="clx-input" value={recurrenceUntil} min={eventDate || undefined} onChange={(e) => setRecurrenceUntil(e.target.value)} />
            </Field>
            {isEdit && (
              <div className="clx-mono" style={{ fontSize: 10, color: '#6B6862', marginTop: 8 }}>
                Toute modification de ce rendez-vous s'applique à l'ensemble des occurrences de la série (sauf celles supprimées individuellement).
              </div>
            )}
          </div>
        )}

        <Field label="Lieu">
          <input className="clx-input" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ex. Local de répétition" />
        </Field>

        {error && <div style={{ color: '#C1454B', fontSize: 12, marginTop: 10 }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="clx-display" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={16} color="#F2A93B" /> Participants
        </div>
        <button onClick={toggleAll} className="clx-btn clx-btn-ghost" style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11 }}>
          {allSelected ? 'Tout désélectionner' : 'Tout le monde'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {members.map((m) => (
          <Chip key={m.id} active={participantIds.includes(m.id)} onClick={() => toggleParticipant(m.id)}>
            {m.name}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {isEdit ? (
          <button
            onClick={handleDelete}
            className="clx-btn"
            style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={14} /> {isRecurring ? 'Supprimer toute la série' : 'Supprimer le rendez-vous'}
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="clx-btn clx-btn-ghost" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13 }}>Annuler</button>
          <button
            onClick={submit}
            disabled={saving}
            className="clx-btn clx-btn-primary"
            style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Enregistrement…' : (isEdit ? 'Enregistrer les modifications' : 'Créer le rendez-vous')}
          </button>
        </div>
      </div>
    </div>
  );
}
