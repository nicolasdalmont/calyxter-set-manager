import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Plus, X, Check, ExternalLink, ListPlus, Users, Pencil, ChevronUp, ChevronDown, GripVertical,
  ChevronRight, Radio, ListMusic, Ban, Sparkles, Music2,
  MessageCircle, Flag, AlertTriangle, Crown, Loader2,
  Calendar, MapPin, Clock, Trash2, ArrowLeft, Mic2, Repeat, Copy, Lightbulb,
  Home, ClipboardList, Drum, Guitar, Piano
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

const IDEA_STATUS = {
  created: { label: 'Créée', badge: 'CRÉÉE', color: '#7C8BA8' },
  processed: { label: 'Traitée', badge: 'TRAITÉE', color: '#E8B04B' },
  done: { label: 'Terminée', badge: 'TERMINÉE', color: '#6FA287' },
};
const IDEA_STATUS_ORDER = ['created', 'processed', 'done'];

// Les listes DEFAULT_MEMBERS et DEFAULT_SONGS (catalogue de démonstration et
// membres par défaut) ont été retirées : elles n'ont plus d'utilité une fois
// les vraies données alimentées dans Supabase (table "members" pour les
// membres, table "songs" pour le répertoire). On ne réensemence donc plus
// jamais ces tables et on ne propose plus de contenu de secours si elles
// sont vides — voir fetchMembersFromSupabase() et loadSongs() ci-dessous.

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

function listenUrl(song) {
  if (song.links && song.links.custom_url) return song.links.custom_url;
  if (song.links && song.links.deezer_url) return song.links.deezer_url;
  const q = encodeURIComponent(`${song.title} ${song.artist}`);
  return `https://www.deezer.com/search/${q}`;
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
  return supabaseTable('members?select=id,name,instrument,created_at,last_activity_at&order=name.asc');
}

// Signale une activité de l'utilisateur·rice courant·e (tamponnage serveur
// de last_activity_at, via member-auth — cf. onglet Accueil). Volontairement
// silencieux en cas d'échec : un raté ne doit jamais empêcher l'usage normal
// de l'appli, ce n'est qu'un indicateur de confort.
async function touchMemberActivity(memberId) {
  try {
    await callMemberAuth('touch', memberId);
  } catch (e) {
    console.error("Erreur en signalant l'activité", e);
  }
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

// Le catalogue de démonstration (DEFAULT_SONGS) a été retiré : il n'a plus
// d'utilité une fois le répertoire réel alimenté dans Supabase. On se
// contente donc de charger les morceaux existants, sans jamais réensemencer
// la table ni proposer de contenu de secours si elle est vide.
async function loadSongs() {
  const existing = await supabaseTable('songs?select=*');
  return existing || [];
}

async function fetchActivePhase() {
  const rows = await supabaseTable('phases?closed_at=is.null&select=*&order=created_at.desc&limit=1');
  return rows && rows[0] ? rows[0] : null;
}

async function fetchPhaseHistory() {
  const rows = await supabaseTable('phases?closed_at=not.is.null&select=*&order=closed_at.desc');
  return rows || [];
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

async function fetchIdeas() {
  const rows = await supabaseTable('ideas?select=*&order=created_at.desc');
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
  const [phaseHistory, setPhaseHistory] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [concertToOpen, setConcertToOpen] = useState(null);
  const [openPhaseHistory, setOpenPhaseHistory] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [membersError, setMembersError] = useState('');

  const [tab, setTab] = useState('accueil');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const [artistFilter, setArtistFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [showNotifLog, setShowNotifLog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [supaMembers, s, p, n, c, ev, ph, id] = await Promise.all([
          withTimeout(fetchMembersFromSupabase(), 8000, null),
          withTimeout(loadSongs(), 8000, []),
          withTimeout(fetchActivePhase(), 8000, null),
          withTimeout(fetchNotifications(), 8000, []),
          withTimeout(fetchConcerts(), 8000, []),
          withTimeout(fetchEvents(), 8000, []),
          withTimeout(fetchPhaseHistory(), 8000, []),
          withTimeout(fetchIdeas(), 8000, []),
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
        setPhaseHistory(ph);
        setIdeas(id);
        setCurrentUserId(loadPersonal('current-member-id'));
      } catch (e) {
        console.error('Failed to load app data', e);
        if (cancelled) return;
        setMembersError("Impossible de charger les données depuis Supabase — vérifie la connexion.");
        setSongs([]);
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

  // "Dernière activité" (écran Accueil, section Dernières connexions) : le
  // mot de passe n'est demandé qu'à la toute première connexion — ensuite,
  // l'identité reste mémorisée localement (voir loadPersonal ci-dessus) et
  // l'appli ne redemande jamais de se reconnecter. Se contenter de tamponner
  // l'activité au moment de l'authentification (member-auth) sous-estimerait
  // donc très largement la fréquence d'usage réelle. On la retamponne ici,
  // à chaque ouverture de l'application avec un·e utilisateur·rice connu·e —
  // connexion fraîche ou session mémorisée confondues, puisque les deux
  // passent par un changement de currentUserId.
  useEffect(() => {
    if (!currentUserId) return;
    const nowIso = new Date().toISOString();
    setMembers((prev) => prev.map((m) => (m.id === currentUserId ? { ...m, last_activity_at: nowIso } : m)));
    touchMemberActivity(currentUserId);
  }, [currentUserId]);

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

  const saveIdea = useCallback(async (idea) => {
    setIdeas((prev) => {
      const exists = prev.some((i) => i.id === idea.id);
      return exists ? prev.map((i) => (i.id === idea.id ? idea : i)) : [idea, ...prev];
    });
    try {
      await upsertRows('ideas', [idea]);
    } catch (e) {
      console.error("Erreur en enregistrant l'idée", e);
    }
  }, []);

  const deleteIdea = useCallback(async (ideaId) => {
    setIdeas((prev) => prev.filter((i) => i.id !== ideaId));
    try {
      await supabaseTable(`ideas?id=eq.${ideaId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch (e) {
      console.error("Erreur en supprimant l'idée", e);
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
        const closedAt = new Date().toISOString();
        await supabaseTable(`phases?id=eq.${prevPhase.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ current_step: 'closed', closed_at: closedAt }),
        });
        // La phase clôturée normalement (résultat validé) rejoint
        // l'historique consultable dans l'onglet Phase de choix.
        setPhaseHistory((prev) => [{ ...prevPhase, current_step: 'closed', closed_at: closedAt }, ...prev]);
      }
    } catch (e) {
      console.error('Erreur en enregistrant la phase', e);
    }
  }, []);

  // Annulation d'une phase en cours, à tout moment, par n'importe quel
  // membre : contrairement à une clôture normale (updatePhase(null)), la
  // ligne est purement et simplement supprimée — elle ne rejoint donc
  // jamais l'historique. Les morceaux vetotés durant cette phase précise
  // réintègrent le statut "Proposé" ; les propositions elles-mêmes ne sont
  // pas touchées ; les votes disparaissent avec la phase (ils n'étaient
  // enregistrés que dans son JSON embarqué).
  const cancelPhase = useCallback(async (currentPhase) => {
    if (!currentPhase) return;
    const vetoedSongIds = [...new Set((currentPhase.vetoes || []).map((v) => v.song_id))];
    setPhase(null);
    if (vetoedSongIds.length > 0) {
      await updateSongs((prev) => prev.map((s) => (
        vetoedSongIds.includes(s.id) && s.status === 'rejected' ? { ...s, status: 'proposed' } : s
      )));
    }
    try {
      await supabaseTable(`phases?id=eq.${currentPhase.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch (e) {
      console.error('Erreur en annulant la phase', e);
    }
  }, [updateSongs]);

  // Lancement d'une phase de choix — déclenchable depuis le Répertoire par
  // n'importe quel membre. Bascule automatiquement vers l'onglet Phase de
  // choix pour enchaîner directement sur le workflow.
  const launchPhase = useCallback(async () => {
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
    setTab('phase');
  }, [currentUser, updatePhase, pushNotification]);

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
        tab={tab}
        setTab={setTab}
        phaseActive={!!phase}
      />

      {phase && tab !== 'phase' && (
        <ActivePhaseBanner phase={phase} onOpen={() => setTab('phase')} />
      )}

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px 64px', position: 'relative', zIndex: 1 }}>
        {tab === 'accueil' && (
          <AccueilTab
            currentUser={currentUser}
            members={members}
            songs={songs}
            phase={phase}
            phaseHistory={phaseHistory}
            events={events}
            concerts={concerts}
            setTab={setTab}
          />
        )}

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
            phase={phase}
            launchPhase={launchPhase}
            onAddClick={() => setShowAdd(true)}
            onEditClick={(song) => setEditingSong(song)}
            onShowPhaseHistory={() => { setOpenPhaseHistory(true); setTab('phase'); }}
          />
        )}

        {tab === 'phase' && (
          <PhaseWorkflow
            phase={phase}
            phaseHistory={phaseHistory}
            songs={songs}
            members={members}
            currentUser={currentUser}
            updatePhase={updatePhase}
            cancelPhase={cancelPhase}
            updateSongs={updateSongs}
            deleteSong={deleteSong}
            pushNotification={pushNotification}
            forceShowHistory={openPhaseHistory}
            onHistoryConsumed={() => setOpenPhaseHistory(false)}
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

        {tab === 'ideas' && (
          <IdeasTab
            ideas={ideas}
            members={members}
            currentUser={currentUser}
            saveIdea={saveIdea}
            deleteIdea={deleteIdea}
            pushNotification={pushNotification}
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
        /* 1px de bordure transparente par défaut (plutôt que "none") : les
           variantes qui n'affichent pas de bordure visible (primary,
           danger…) réservent quand même le même espace que celles qui en
           ont une (ghost, boutons de suppression à bordure inline…), pour
           que des boutons contigus dans une même rangée aient toujours
           exactement la même hauteur, quelle que soit leur variante. */
        border: 1px solid transparent;
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

      .clx-home-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      @media (max-width: 640px) {
        .clx-home-grid { grid-template-columns: 1fr; }
      }

      .section-label {
        font-family: 'Space Mono', monospace;
        font-size: 11px;
        letter-spacing: 0.08em;
        color: #9A958C;
        text-transform: uppercase;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
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

function TopBar({ currentUser, onSignOut, tab, setTab, phaseActive }) {
  return (
    <header style={{ borderBottom: '1px solid #2A2A2E', position: 'sticky', top: 0, zIndex: 10, background: '#0B0B0Cee', backdropFilter: 'blur(6px)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="clx-display" style={{ fontSize: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#F2A93B' }}>●</span> CALYXTER
        </div>

        <nav className="clx-topnav" style={{ display: 'flex', gap: 4 }}>
          <TabButton icon={Home} label="Accueil" active={tab === 'accueil'} onClick={() => setTab('accueil')} />
          <TabButton icon={ListMusic} label="Répertoire" active={tab === 'repertoire'} onClick={() => setTab('repertoire')} pulse={phaseActive} />
          <TabButton icon={Calendar} label="Rendez-vous" active={tab === 'rendezvous'} onClick={() => setTab('rendezvous')} />
          <TabButton icon={Mic2} label="Concerts" active={tab === 'concerts'} onClick={() => setTab('concerts')} />
          <TabButton icon={Lightbulb} label="Boîte à idées" active={tab === 'ideas'} onClick={() => setTab('ideas')} />
          <TabButton icon={MessageCircle} label="Journal d'activité" active={tab === 'notifications'} onClick={() => setTab('notifications')} />
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

function ActivePhaseBanner({ phase, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: '#F2A93B18', borderBottom: '1px solid #F2A93B55', color: '#F5F1E8',
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <ListPlus size={15} color="#F2A93B" style={{ flexShrink: 0 }} />
          Phase de choix en cours — étape « {STEP_LABEL[phase.current_step]} »
        </div>
        <div className="clx-mono" style={{ fontSize: 11, color: '#F2A93B', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          Voir <ChevronRight size={13} />
        </div>
      </div>
    </button>
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
/*  ACCUEIL TAB                                                         */
/* ------------------------------------------------------------------ */

// Palette des cercles d'avatar (icône par membre, § 11.5) : une couleur
// pastel dédiée par membre, choisie sans logique genrée (pas de rose/mauve
// réservés à certains prénoms), et suffisamment distincte des couleurs de
// statut utilisées ailleurs (veto rouge, prêt vert, etc.). Aucune couleur
// n'est stockée en base : associée par prénom exact, comme MEMBER_ICON_BY_NAME.
const AVATAR_COLOR_BY_NAME = {
  Do: '#F0C987',
  Dave: '#A9CDB9',
  Alex: '#A7C7DE',
  Véro: '#8FC9C4',
  Gawel: '#E3B08F',
  Niko: '#D6CC8C',
};
// Filet de sécurité pour un membre non listé ci-dessus (ex. nouvel arrivant) :
// une couleur est tirée de façon stable dans cette petite palette de secours,
// dérivée du prénom, en attendant qu'on lui attribue une teinte dédiée.
const AVATAR_FALLBACK_PALETTE = ['#E8B04B', '#9A958C'];
function avatarColorFor(name) {
  if (name && AVATAR_COLOR_BY_NAME[name]) return AVATAR_COLOR_BY_NAME[name];
  const str = name || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_FALLBACK_PALETTE[hash % AVATAR_FALLBACK_PALETTE.length];
}

// Horodatage relatif pour "Dernières connexions" : granularité décroissante
// (minutes puis heures puis jours), avec un repère "hier" explicite au-delà
// de 24 h passées minuit, comme dans la maquette validée.
//
// NB : la donnée sous-jacente (last_activity_at) est une dernière ACTIVITÉ,
// pas une dernière authentification — le mot de passe n'est demandé qu'à la
// toute première connexion, l'identité restant mémorisée ensuite (voir
// touchMemberActivity), donc s'appuyer sur les seuls événements de connexion
// sous-estimerait très largement la fréquence d'usage réelle.
function formatRelativeTime(iso) {
  if (!iso) return 'Aucune activité';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Aucune activité';
  const now = new Date();
  const diffMin = Math.floor((now - date) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);
  if (dayDiff === 1) {
    return `hier, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  if (dayDiff > 1 && dayDiff < 7) return `il y a ${dayDiff} jours`;
  return formatConcertDate(toISODate(date), { day: 'numeric', month: 'short', year: 'numeric' });
}

// Vert (<1h), ambre (<24h), gris au-delà ou si aucune activité enregistrée.
function lastSeenDotColor(iso) {
  if (!iso) return '#6B6862';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '#6B6862';
  const diffH = (Date.now() - date.getTime()) / 3600000;
  if (diffH < 1) return '#6FA287';
  if (diffH < 24) return '#E8B04B';
  return '#6B6862';
}

// Icône par membre, en lien avec son instrument (couleur de fond = avatar
// habituel, dérivé du nom via avatarColorFor). Basée sur des icônes lucide
// déjà utilisées ailleurs dans l'appli — aucune nouvelle dépendance — sauf
// pour Niko (basse) : lucide n'a pas d'icône dédiée, donc BassIcon reprend
// l'icône guitare réelle et l'étire/réduit par transformation SVG plutôt
// que de redessiner les tracés à la main (voir BassIcon ci-dessous).
//
// Associé par prénom exact (colonne `name` en base) car deux membres
// partagent le même instrument (Véro et Gawel, chant) mais doivent avoir
// des icônes visuellement différentes (micro retourné) : un simple mappage
// par instrument ne suffirait pas à les distinguer.
const MEMBER_ICON_BY_NAME = {
  Do: { Icon: Drum },
  Dave: { Icon: Piano },
  Alex: { Icon: Guitar },
  Véro: { Icon: Mic2, mirror: true },
  Gawel: { Icon: Mic2, mirror: false },
};
const AVATAR_INK = '#16130A';

// Icône "basse" : aucune icône dédiée dans lucide (manque connu de la
// bibliothèque) — on repart donc de la vraie icône guitare et on l'étire
// après coup par transformation SVG (translate/scale), plutôt que de
// recopier à la main les tracés de la guitare (risque d'erreur sur des
// courbes de Bézier complexes). Le manche s'allonge du côté de la tête,
// qui reste à son extrémité ; le corps est légèrement réduit pour que
// l'icône garde le même encombrement global.
function BassIcon({ size, color }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    const svg = wrapRef.current && wrapRef.current.querySelector('svg');
    if (!svg || svg.dataset.bassStretched) return;
    const [neck, headstock, tick, body] = svg.querySelectorAll('path');
    if (!neck || !headstock || !tick || !body) return;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const wrap = (el, transform) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', transform);
      el.replaceWith(g);
      g.appendChild(el);
    };

    // Point où le manche rejoint le corps sur l'icône guitare d'origine :
    // reste fixe, c'est le pivot des transformations.
    const pivot = { x: 11.9, y: 12.1 };
    // Extrémité du manche côté tête, avant allongement.
    const neckEnd = { x: 16.414, y: 7.586 };
    const stretch = 1.2;
    const bodyShrink = 0.87;

    wrap(neck, `translate(${pivot.x} ${pivot.y}) scale(${stretch}) translate(${-pivot.x} ${-pivot.y})`);

    const neckEndStretched = {
      x: pivot.x + (neckEnd.x - pivot.x) * stretch,
      y: pivot.y + (neckEnd.y - pivot.y) * stretch,
    };
    wrap(headstock, `translate(${neckEndStretched.x - neckEnd.x} ${neckEndStretched.y - neckEnd.y})`);

    const bodyGroup = document.createElementNS(SVG_NS, 'g');
    bodyGroup.setAttribute('transform', `translate(${pivot.x} ${pivot.y}) scale(${bodyShrink}) translate(${-pivot.x} ${-pivot.y})`);
    tick.replaceWith(bodyGroup);
    bodyGroup.appendChild(tick);
    bodyGroup.appendChild(body);

    svg.dataset.bassStretched = 'true';
  }, []);

  return (
    <span ref={wrapRef} style={{ display: 'inline-flex' }}>
      <Guitar size={size} color={color} />
    </span>
  );
}

// Icône d'un membre pour les avatars (écran Accueil). À défaut de
// correspondance (membre non listé dans MEMBER_ICON_BY_NAME), on retombe
// sur l'initiale du prénom — le comportement d'origine — plutôt que
// d'afficher une icône générique qui ne représenterait rien.
function MemberAvatarIcon({ member, size }) {
  if (member.name === 'Niko') {
    return <BassIcon size={size} color={AVATAR_INK} />;
  }
  const entry = MEMBER_ICON_BY_NAME[member.name];
  if (!entry) {
    return (
      <span className="clx-display" style={{ fontSize: size, color: AVATAR_INK }}>
        {(member.name || '?').charAt(0).toUpperCase()}
      </span>
    );
  }
  const { Icon, mirror } = entry;
  return <Icon size={size} color={AVATAR_INK} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
}

// Petite carte compacte pour "Prochain rendez-vous" / "Prochain concert" —
// reprend la forme des occurrences fusionnées par mergeEventsAndConcerts
// (mêmes champs que RendezVousCard) mais dans une présentation resserrée,
// sans bouton d'action (clic = navigation vers l'onglet correspondant).
function HomeAgendaCard({ item, onOpen, members }) {
  const kindInfo = item.source === 'concert' ? CONCERT_EVENT_KIND : (EVENT_KIND[item.kind] || EVENT_KIND.autre);
  const start = formatConcertTime(item.start_time);
  const end = formatConcertTime(item.end_time);
  const timeLabel = item.all_day ? 'Toute la journée' : (start ? (end ? `${start} – ${end}` : start) : null);

  const participantNames = item.participant_ids === null
    ? 'Tout le groupe'
    : (item.participant_ids.length === 0
      ? 'Aucun participant renseigné'
      : item.participant_ids.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(', '));

  return (
    <button
      onClick={onOpen}
      className="clx-card"
      style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', color: '#F5F1E8', cursor: 'pointer' }}
    >
      <div className="clx-tape" style={item.source === 'concert' ? { background: 'rgba(193,69,75,0.85)' } : undefined} />
      <div
        className="clx-mono"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: 54, height: 54, borderRadius: 6, flexShrink: 0,
          background: `${kindInfo.color}22`, border: `1px solid ${kindInfo.color}55`,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: kindInfo.color }}>
          {formatConcertDate(item.event_date, { day: 'numeric' })}
        </div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#6B6862', marginTop: 2 }}>
          {formatConcertDate(item.event_date, { month: 'short' })}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="clx-badge" style={{ background: `${kindInfo.color}22`, color: kindInfo.color, border: `1px solid ${kindInfo.color}55` }}>{kindInfo.badge}</span>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 5 }}>{item.subject}</div>
        {(timeLabel || item.venue) && (
          <div style={{ fontSize: 12, color: '#9A958C', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Clock size={11} style={{ flexShrink: 0 }} />
            {[timeLabel, item.venue].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Users size={11} style={{ flexShrink: 0 }} /> {participantNames}
        </div>
      </div>
    </button>
  );
}

function AccueilTab({ currentUser, members, songs, phase, phaseHistory, events, concerts, setTab }) {
  const todayStr = toISODate(new Date());

  const nextEvent = mergeEventsAndConcerts(events, [])
    .find((item) => (item.end_date || item.event_date) >= todayStr) || null;
  const nextConcert = mergeEventsAndConcerts([], concerts)
    .find((item) => (item.end_date || item.event_date) >= todayStr) || null;

  const readySongs = songs.filter((s) => s.status === 'ready');
  const toPrepareSongs = songs.filter((s) => s.status === 'to_prepare');
  const readyCount = readySongs.length;
  const toPrepareCount = toPrepareSongs.length;
  const readySeconds = readySongs.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const toPrepareSeconds = toPrepareSongs.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  // Propositions "depuis la fin de la dernière phase clôturée" : phaseHistory
  // est trié du plus récent au plus ancien (voir fetchPhaseHistory), donc
  // phaseHistory[0].closed_at borne la fenêtre. À défaut d'historique, on
  // compte toutes les propositions encore au statut "Proposé".
  const sinceLastClosed = phaseHistory[0]?.closed_at || null;
  const proposalsSinceLastClosed = songs.filter((s) => s.status === 'proposed' && (!sinceLastClosed || s.created_at >= sinceLastClosed)).length;

  const hasVoted = !!(phase && phase.votes || []).some((v) => v.user_id === currentUser.id);

  const lastSeenSorted = [...members].sort((a, b) => {
    if (!a.last_activity_at && !b.last_activity_at) return a.name.localeCompare(b.name, 'fr');
    if (!a.last_activity_at) return 1;
    if (!b.last_activity_at) return -1;
    return b.last_activity_at.localeCompare(a.last_activity_at);
  });

  const NUDGE = {
    proposal: { color: '#7C8BA8', text: "Pense à partager tes propositions si tu ne l'as pas encore fait." },
    veto: { color: '#C1454B', text: "Pense à écouter les propositions pour te faire une idée, tu as le droit de mettre un veto sur les morceaux que tu ne veux pas jouer." },
    vote: hasVoted
      ? { color: '#6FA287', text: "On attend les derniers votes avant d'annoncer les résultats." }
      : { color: '#E8B04B', text: "Pense à valider ton vote que l'on puisse annoncer les résultats." },
  };
  const nudge = phase ? NUDGE[phase.current_step] : null;

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, background: avatarColorFor(currentUser.name),
          }}
        >
          <MemberAvatarIcon member={currentUser} size={22} />
        </div>
        <div>
          <div className="clx-display" style={{ fontSize: 36, lineHeight: 1 }}>Bonjour, {currentUser.name}</div>
          <div className="clx-mono" style={{ fontSize: 12, color: '#9A958C', marginTop: 6 }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Voici où en est le groupe.
          </div>
        </div>
      </div>

      <div className="clx-home-grid" style={{ marginBottom: 20 }}>
        <div>
          <div className="section-label">
            <Calendar size={12} /> Prochain rendez-vous
          </div>
          {nextEvent ? (
            <HomeAgendaCard item={nextEvent} onOpen={() => setTab('rendezvous')} members={members} />
          ) : (
            <EmptyState text="Aucun rendez-vous à venir." />
          )}
        </div>
        <div>
          <div className="section-label">
            <Mic2 size={12} /> Prochain concert
          </div>
          {nextConcert ? (
            <HomeAgendaCard item={nextConcert} onOpen={() => setTab('concerts')} members={members} />
          ) : (
            <EmptyState text="Aucun concert à venir." />
          )}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="section-label">
          <ClipboardList size={12} /> Phase de choix
        </div>
        {phase ? (
          <div className="clx-card" style={{ padding: 18 }}>
            <div className="clx-tape" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <div className="clx-display" style={{ fontSize: 20 }}>Phase de choix en cours</div>
              <span className="clx-badge" style={{ background: '#F2A93B22', color: '#F2A93B', border: '1px solid #F2A93B55' }}>
                ÉTAPE : {STEP_LABEL[phase.current_step].toUpperCase()}
              </span>
            </div>

            <div style={{ marginBottom: nudge ? 16 : 20 }}>
              <Stepper current={phase.current_step} />
            </div>

            {nudge && (
              <div className="clx-card" style={{ padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, borderColor: `${nudge.color}55` }}>
                <AlertTriangle size={14} color={nudge.color} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>{nudge.text}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#101012', border: '1px solid #2A2A2E', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9A958C' }}>
                <ListPlus size={13} color="#7C8BA8" style={{ flexShrink: 0 }} />
                <span><strong style={{ color: '#F5F1E8' }}>{proposalsSinceLastClosed}</strong> morceau{proposalsSinceLastClosed > 1 ? 'x' : ''} proposé{proposalsSinceLastClosed > 1 ? 's' : ''} depuis la dernière phase clôturée</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9A958C' }}>
                <Ban size={13} color="#C1454B" style={{ flexShrink: 0 }} />
                <span><strong style={{ color: '#F5F1E8' }}>{phase.vetoes.length}</strong> rejeté{phase.vetoes.length > 1 ? 's' : ''} par veto</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9A958C' }}>
                <Users size={13} color="#F2A93B" style={{ flexShrink: 0 }} />
                <span><strong style={{ color: '#F5F1E8' }}>{phase.votes.length}/{members.length}</strong> membres ont voté</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setTab('phase')} className="clx-mono" style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#F2A93B', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                Voir la phase de choix <ChevronRight size={13} />
              </button>
            </div>
          </div>
        ) : (
          <div className="clx-card" style={{ padding: '28px 20px', textAlign: 'center' }}>
            <div className="clx-tape" />
            <div className="clx-display" style={{ fontSize: 18, marginBottom: 4 }}>Aucune phase de choix en cours</div>
            <div style={{ fontSize: 12, color: '#9A958C' }}>Lance-en une depuis le Répertoire quand le groupe est prêt.</div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="section-label">
          <ListMusic size={12} /> Répertoire
        </div>
        <div className="clx-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="clx-tape" />
          <div style={{ flex: '1 1 160px', background: '#101012', border: '1px solid #2A2A2E', borderRadius: 6, padding: '14px 16px' }}>
            <div className="clx-mono" style={{ fontSize: 30, fontWeight: 700, color: '#6FA287', textShadow: '0 0 14px rgba(111,162,135,0.35)' }}>{readyCount}</div>
            <div style={{ fontSize: 12, color: '#9A958C', marginTop: 2 }}>morceau{readyCount > 1 ? 'x' : ''} prêt{readyCount > 1 ? 's' : ''}</div>
            <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', marginTop: 6 }}>Durée théorique : {formatTotalDuration(readySeconds)}</div>
          </div>
          <div style={{ flex: '1 1 160px', background: '#101012', border: '1px solid #2A2A2E', borderRadius: 6, padding: '14px 16px' }}>
            <div className="clx-mono" style={{ fontSize: 30, fontWeight: 700, color: '#E8B04B', textShadow: '0 0 14px rgba(232,176,75,0.35)' }}>{toPrepareCount}</div>
            <div style={{ fontSize: 12, color: '#9A958C', marginTop: 2 }}>en préparation</div>
            <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862', marginTop: 6 }}>Durée théorique : {formatTotalDuration(toPrepareSeconds)}</div>
          </div>
          <button onClick={() => setTab('repertoire')} className="clx-mono" style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#F2A93B', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 'auto' }}>
            Voir le répertoire <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div>
        <div className="section-label">
          <Users size={12} /> Dernières connexions
        </div>
        <div className="clx-card" style={{ padding: '6px 16px' }}>
          <div className="clx-tape" />
          {lastSeenSorted.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid #201F22' }}>
              <div
                style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: avatarColorFor(m.name) }}
              >
                <MemberAvatarIcon member={m} size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {m.name} {m.id === currentUser.id && <span style={{ color: '#6B6862', fontWeight: 400 }}>— toi</span>}
                </div>
                <div className="clx-mono" style={{ fontSize: 10, color: '#6B6862' }}>{m.instrument}</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: lastSeenDotColor(m.last_activity_at) }} />
              <div className="clx-mono" style={{ fontSize: 11, color: '#9A958C', width: 90, textAlign: 'right', flexShrink: 0 }}>{formatRelativeTime(m.last_activity_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  REPERTOIRE TAB                                                      */
/* ------------------------------------------------------------------ */

function Repertoire({ songs, allSongsCount, totalSeconds, search, setSearch, statusFilter, setStatusFilter, langFilter, setLangFilter, artistFilter, setArtistFilter, artistOptions, members, currentUser, phase, launchPhase, onAddClick, onEditClick, onShowPhaseHistory }) {
  const [launching, setLaunching] = useState(false);

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      await launchPhase();
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div>
      {!phase ? (
        <div className="clx-card" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div className="clx-tape" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ListPlus size={18} color="#F2A93B" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: '#9A958C' }}>
              Prêt·e à choisir les prochains morceaux à travailler ?
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onShowPhaseHistory} className="clx-btn clx-btn-ghost" style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13 }}>
              Historique des phases
            </button>
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="clx-btn clx-btn-primary"
              style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, opacity: launching ? 0.6 : 1 }}
            >
              {launching ? 'Lancement…' : 'Lancer une phase de choix'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={onShowPhaseHistory} className="clx-btn clx-btn-ghost" style={{ padding: '7px 12px', borderRadius: 6, fontSize: 12 }}>
            Historique des phases
          </button>
        </div>
      )}

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
            <SongRow key={song.id} song={song} members={members} onEdit={onEditClick} />
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

function SongRow({ song, members, onEdit }) {
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
            href={listenUrl(song)}
            target="_blank"
            rel="noopener noreferrer"
            className="clx-btn clx-btn-ghost"
            style={{ padding: '7px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#F5F1E8', textDecoration: 'none' }}
            title={song.links?.custom_url ? 'Ouvrir le lien' : 'Chercher sur Deezer'}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {isEdit ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Supprimer définitivement « ${initialSong.title} » du répertoire ? Cette action est irréversible.`)) {
                  onDelete(initialSong.id);
                }
              }}
              className="clx-btn"
              style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55', display: 'flex', alignItems: 'center' }}
            >
              Supprimer
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onClose} className="clx-btn clx-btn-ghost" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center' }}>Annuler</button>
            <button onClick={submit} className="clx-btn clx-btn-primary" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center' }}>{isEdit ? 'Enregistrer les modifications' : 'Ajouter au répertoire'}</button>
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

/* ------------------------------------------------------------------ */
/*  NOTIFICATION LOG (historique des événements du groupe)             */
/* ------------------------------------------------------------------ */

function NotificationLog({ notifications }) {
  return (
    <div>
      <div className="clx-display" style={{ fontSize: 22, marginBottom: 4 }}>Journal d'activité</div>
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

function PhaseWorkflow({ phase, phaseHistory, songs, members, currentUser, updatePhase, cancelPhase, updateSongs, deleteSong, pushNotification, forceShowHistory, onHistoryConsumed }) {
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (forceShowHistory) {
      setShowHistory(true);
      if (onHistoryConsumed) onHistoryConsumed();
    }
  }, [forceShowHistory, onHistoryConsumed]);

  if (showHistory) {
    return <PhaseHistoryView phaseHistory={phaseHistory} members={members} onBack={() => setShowHistory(false)} />;
  }

  if (!phase) {
    return <NoPhase onShowHistory={() => setShowHistory(true)} />;
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

  const handleCancel = async () => {
    const vetoedCount = new Set((phase.vetoes || []).map((v) => v.song_id)).size;
    const warning = [
      'Annuler cette phase de choix maintenant ?',
      '',
      '- Les propositions sont conservées.',
      vetoedCount > 0
        ? `- Les ${vetoedCount} morceau${vetoedCount > 1 ? 'x' : ''} rejeté${vetoedCount > 1 ? 's' : ''} par veto durant cette phase réintègre${vetoedCount > 1 ? 'nt' : ''} le statut Proposé.`
        : '- Aucun veto n\'a encore été posé.',
      '- Les votes en cours sont définitivement perdus.',
      '- Cette phase annulée ne figurera pas dans l\'historique.',
    ].join('\n');
    if (!window.confirm(warning)) return;
    await cancelPhase(phase);
    await pushNotification(`❌ ${currentUser.name} a annulé la phase de choix en cours.`, 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
        <div className="clx-display" style={{ fontSize: 24 }}>Phase de choix en cours</div>
        <button onClick={() => setShowHistory(true)} className="clx-btn clx-btn-ghost" style={{ padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          Historique des phases
        </button>
      </div>
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
          <ProposalStep songs={songs} members={members} currentUser={currentUser} phase={phase} updateSongs={updateSongs} deleteSong={deleteSong} pushNotification={pushNotification} />
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

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={handleCancel}
          className="clx-btn"
          style={{ padding: '10px 14px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Ban size={14} /> Annuler la phase en cours
        </button>

        {phase.current_step !== 'result' && (
          isInitiator ? (
            <button onClick={advance} className="clx-btn clx-btn-primary" style={{ padding: '10px 18px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Passer à l'étape suivante <ChevronRight size={15} />
            </button>
          ) : (
            <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862' }}>
              Seul·e {initiator ? initiator.name : "l'initiateur·rice"} peut faire avancer cette phase.
            </div>
          )
        )}
      </div>
    </div>
  );
}

function NoPhase({ onShowHistory }) {
  return (
    <div className="clx-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div className="clx-tape" />
      <ListPlus size={26} color="#F2A93B" style={{ marginBottom: 10 }} />
      <div className="clx-display" style={{ fontSize: 24, marginBottom: 6 }}>Aucune phase en cours</div>
      <div style={{ fontSize: 13, color: '#9A958C', maxWidth: 380, margin: '0 auto 20px' }}>
        Proposition → Veto → Vote → Résultat. Lance une nouvelle phase de choix depuis l'onglet Répertoire, où que tu sois — n'importe quel membre du groupe peut le faire.
      </div>
      <button onClick={onShowHistory} className="clx-btn clx-btn-ghost" style={{ padding: '7px 12px', borderRadius: 6, fontSize: 12 }}>
        Voir l'historique des phases
      </button>
    </div>
  );
}

function PhaseHistoryView({ phaseHistory, members, onBack }) {
  return (
    <div>
      <button
        onClick={onBack}
        className="clx-btn clx-btn-ghost"
        style={{ padding: '7px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 16 }}
      >
        <ArrowLeft size={14} /> Retour
      </button>

      <div className="clx-display" style={{ fontSize: 24, marginBottom: 18 }}>Historique des phases</div>

      {phaseHistory.length === 0 ? (
        <EmptyState text="Aucune phase clôturée pour l'instant." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {phaseHistory.map((p) => {
            const initiator = members.find((m) => m.id === p.initiated_by_user_id);
            const durationMs = p.closed_at && p.created_at ? new Date(p.closed_at) - new Date(p.created_at) : null;
            const durationDays = durationMs !== null ? Math.round(durationMs / (1000 * 60 * 60 * 24)) : null;
            return (
              <div key={p.id} className="clx-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Phase lancée par {initiator ? initiator.name : 'membre inconnu'}</div>
                  <span className="clx-badge" style={{ background: '#6FA28722', color: '#6FA287', border: '1px solid #6FA28755' }}>CLÔTURÉE</span>
                </div>
                <div className="clx-mono" style={{ fontSize: 11, color: '#9A958C', marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>Début : {new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <span>Fin : {p.closed_at ? new Date(p.closed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span>
                  {durationDays !== null && <span>({durationDays === 0 ? 'même jour' : `${durationDays} jour${durationDays > 1 ? 's' : ''}`})</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
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

function ProposalStep({ songs, members, currentUser, phase, updateSongs, deleteSong, pushNotification }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [copied, setCopied] = useState(false);
  const proposed = songs.filter((s) => s.status === 'proposed');
  // Propositions faites depuis le lancement de cette phase précisément (même
  // filtre que l'indicateur affiché sous l'étape "Proposition" du Stepper).
  const proposedSincePhase = songs.filter((s) => s.status === 'proposed' && s.created_at && new Date(s.created_at) >= new Date(phase.created_at));

  const handleCopy = async () => {
    const lines = proposedSincePhase.length > 0
      ? proposedSincePhase.map((s, i) => {
          const proposer = members.find((m) => m.id === s.added_by_user_id);
          return `${i + 1}. ${s.title} — ${s.artist} (proposé par ${proposer ? proposer.name : 'membre inconnu'})`;
        }).join('\n')
      : '(aucune proposition depuis le lancement de cette phase)';
    const text = ['Propositions de cette phase de choix', '', lines].join('\n');
    try {
      await copyTextToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Erreur lors de la copie dans le presse-papier', e);
      window.alert("La copie dans le presse-papier a échoué. Ton navigateur bloque peut-être l'accès au presse-papier.");
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: '#9A958C' }}>{proposed.length} morceau{proposed.length > 1 ? 'x' : ''} proposé{proposed.length > 1 ? 's' : ''}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            className="clx-btn clx-btn-ghost"
            style={{ padding: '8px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: copied ? '#6FA287' : undefined }}
            title="Copier la liste des propositions de cette phase dans le presse-papier"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié !' : 'Copier les propositions'}
          </button>
          <button onClick={() => setShowAdd(true)} className="clx-btn clx-btn-primary" style={{ padding: '8px 14px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Plus size={14} /> Proposer un morceau
          </button>
        </div>
      </div>
      {proposed.length === 0 ? <EmptyState text="Aucune proposition pour l'instant." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {proposed.map((s) => <SongRow key={s.id} song={s} members={members} onEdit={setEditingSong} />)}
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
  const [copied, setCopied] = useState(false);

  const castVeto = async (song) => {
    if (myVetoes.includes(song.id)) return;
    await updatePhase((p) => ({ ...p, vetoes: [...p.vetoes, { id: uid('vto'), song_id: song.id, user_id: currentUser.id, created_at: new Date().toISOString() }] }));
    await updateSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, status: 'rejected' } : s)));
    await pushNotification(`🚫 Veto posé par ${currentUser.name} sur « ${song.title} ». Le morceau passe au statut Sorti.`, 'veto');
  };

  const rejectedSongIds = [...new Set(phase.vetoes.map((v) => v.song_id))];

  const handleCopy = async () => {
    const lines = rejectedSongIds.length > 0
      ? rejectedSongIds.map((songId, i) => {
          const song = songs.find((s) => s.id === songId);
          const vetoers = phase.vetoes.filter((v) => v.song_id === songId).map((v) => members.find((m) => m.id === v.user_id)?.name).filter(Boolean).join(', ');
          return `${i + 1}. ${song ? `${song.title} — ${song.artist}` : 'Morceau supprimé depuis'} (veto de ${vetoers || 'membre inconnu'})`;
        }).join('\n')
      : '(aucun veto posé durant cette phase)';
    const text = ['Morceaux rejetés par veto', '', lines].join('\n');
    try {
      await copyTextToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Erreur lors de la copie dans le presse-papier', e);
      window.alert("La copie dans le presse-papier a échoué. Ton navigateur bloque peut-être l'accès au presse-papier.");
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#9A958C', flex: '1 1 260px' }}>
          Un veto d'un seul membre suffit à faire passer un morceau au statut Sorti, immédiatement et sans appel.
        </div>
        <button
          onClick={handleCopy}
          className="clx-btn clx-btn-ghost"
          style={{ padding: '8px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: copied ? '#6FA287' : undefined, flexShrink: 0 }}
          title="Copier la liste des morceaux rejetés par veto dans le presse-papier"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié !' : 'Copier les rejets'}
        </button>
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
  const [copied, setCopied] = useState(false);

  const castTieVote = async (songId) => {
    await updatePhase((p) => ({
      ...p,
      tie_break_votes: [...(p.tie_break_votes || []).filter((v) => v.user_id !== currentUser.id), { user_id: currentUser.id, song_id: songId }],
    }));
  };

  const handleCopy = async () => {
    if (!quota.finalTop3) return;
    const lines = quota.finalTop3.map((s, i) => `${i + 1}. ${s.title} — ${s.artist} (${s.points} pts)`).join('\n');
    const quotaNote = quota.quotaApplied
      ? `\n\nQuota francophone appliqué : « ${quota.bumped?.title} » cède sa place à « ${quota.promoted?.title} ».`
      : '';
    const text = ['Résultat du vote', '', lines].join('\n') + quotaNote;
    try {
      await copyTextToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Erreur lors de la copie dans le presse-papier', e);
      window.alert("La copie dans le presse-papier a échoué. Ton navigateur bloque peut-être l'accès au presse-papier.");
    }
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="clx-display" style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Crown size={18} color="#F2A93B" /> Top 3 provisoire
            </div>
            <button
              onClick={handleCopy}
              className="clx-btn clx-btn-ghost"
              style={{ padding: '8px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: copied ? '#6FA287' : undefined }}
              title="Copier le résultat du vote dans le presse-papier"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié !' : 'Copier le résultat'}
            </button>
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

// Texte formaté pour partage (WhatsApp, SMS, e-mail…) : ligne d'en-tête
// (nom - date heure - lieu), le set complet un morceau par ligne, puis la
// durée théorique totale.
function buildConcertShareText(concert, setSongs, totalSeconds) {
  const dateLabel = formatConcertDate(concert.event_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = formatConcertTime(concert.event_time);
  const header = `${concert.name} - ${dateLabel}${time ? ' ' + time : ''} - ${concert.venue || 'Lieu à confirmer'}`;
  const setLines = setSongs.length > 0
    ? setSongs.map((s, i) => `${i + 1}. ${s.title} — ${s.artist} (${formatSongDuration(s.duration_seconds)})`).join('\n')
    : '(set vide)';
  const durationLine = `Durée totale du set : ${formatTotalDuration(totalSeconds)}`;
  return [header, '', setLines, '', durationLine].join('\n');
}

// Copie dans le presse-papier avec repli si l'API Clipboard n'est pas
// disponible (contexte non sécurisé, ancien navigateur…).
async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
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
    if (da !== db) return da < db ? -1 : 1; // croissant par date
    return (a.event_time || '').localeCompare(b.event_time || '');
  });

  // Focus automatique sur le prochain concert à venir : la liste défile
  // jusqu'à lui dès l'ouverture de l'onglet, en restant cantonnée à son
  // propre conteneur (jamais la page entière — voir le même correctif dans
  // RendezVousTab pour le détail du problème que cela évite sur mobile).
  const todayStr = toISODate(new Date());
  const nextIndex = sortedConcerts.findIndex((c) => (c.event_date || '') >= todayStr);
  const listRef = useRef(null);
  const nextConcertRef = useRef(null);
  useEffect(() => {
    if (nextConcertRef.current && listRef.current) {
      const container = listRef.current;
      const item = nextConcertRef.current;
      const offset = item.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTop = Math.max(offset - 4, 0);
    }
  }, [editingConcert]);

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
        <div ref={listRef} className="clx-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
          {sortedConcerts.map((concert, index) => (
            <div key={concert.id} ref={index === nextIndex ? nextConcertRef : null}>
              <ConcertCard concert={concert} songs={songs} isNext={index === nextIndex} onOpen={() => setEditingConcert(concert)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConcertCard({ concert, songs, onOpen, isNext }) {
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
        borderColor: isNext ? '#F2A93B' : undefined,
        boxShadow: isNext ? '0 0 0 1px #F2A93B55' : undefined,
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
        <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {concert.name}
          {isNext && (
            <span className="clx-badge" style={{ background: '#F2A93B22', color: '#F2A93B', border: '1px solid #F2A93B55' }}>PROCHAIN</span>
          )}
        </div>
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
  const [statusFilter, setStatusFilter] = useState(new Set(['ready'])); // Prêt sélectionné par défaut ; multi-sélection libre
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const listRef = useRef(null);
  const scrollTimer = useRef(null);

  const selectedSongs = selectedIds.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  const totalSeconds = selectedSongs.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  const handleCopy = async () => {
    const text = buildConcertShareText(
      { name: name.trim() || 'Concert', event_date: eventDate, event_time: eventTime || null, venue: venue.trim() },
      selectedSongs,
      totalSeconds
    );
    try {
      await copyTextToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Erreur lors de la copie dans le presse-papier', e);
      window.alert("La copie dans le presse-papier a échoué. Ton navigateur bloque peut-être l'accès au presse-papier.");
    }
  };

  const toggleStatusFilter = (status) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  const candidateSongs = songs
    .filter((s) => !selectedIds.includes(s.id) && statusFilter.has(s.status))
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          onClick={onCancel}
          className="clx-btn clx-btn-ghost"
          style={{ padding: '7px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
        >
          <ArrowLeft size={14} /> Retour aux concerts
        </button>

        {isEdit && (
          <button
            onClick={handleCopy}
            className="clx-btn clx-btn-ghost"
            style={{ padding: '7px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: copied ? '#6FA287' : undefined }}
            title="Copier le nom, la date, le lieu, le set complet et sa durée dans le presse-papier"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié !' : 'Copier le concert'}
          </button>
        )}
      </div>

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
        <Chip active={statusFilter.has('ready')} onClick={() => toggleStatusFilter('ready')}>Prêt</Chip>
        <Chip active={statusFilter.has('to_prepare')} onClick={() => toggleStatusFilter('to_prepare')}>À préparer</Chip>
        <Chip active={statusFilter.has('rejected')} onClick={() => toggleStatusFilter('rejected')}>Sorti</Chip>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isEdit ? (
          <button
            onClick={handleDelete}
            className="clx-btn"
            style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={14} /> Supprimer le concert
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onCancel} className="clx-btn clx-btn-ghost" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center' }}>Annuler</button>
          <button
            onClick={submit}
            disabled={saving}
            className="clx-btn clx-btn-primary"
            style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center' }}
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
    if (da !== db) return da < db ? -1 : 1; // croissant par date
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
}

const RENDEZVOUS_KIND_INFO = { ...EVENT_KIND, concert: CONCERT_EVENT_KIND };
const RENDEZVOUS_KIND_ORDER = ['repetition', 'atelier', 'residence', 'autre', 'concert'];

function RendezVousTab({ events, concerts, members, currentUser, saveEvent, deleteEvent, pushNotification, onViewConcert }) {
  const [editingEvent, setEditingEvent] = useState(undefined); // undefined = liste, null = nouveau, objet = édition
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState(null); // occurrence précise cliquée dans la liste (pour une série récurrente)
  const [kindFilter, setKindFilter] = useState('all'); // 'all' ou une valeur de RENDEZVOUS_KIND_ORDER — choix unique, comme le Répertoire

  const allMerged = mergeEventsAndConcerts(events, concerts);
  const merged = kindFilter === 'all' ? allMerged : allMerged.filter((item) => item.kind === kindFilter);

  // Focus automatique sur le prochain événement à venir : la liste défile
  // jusqu'à lui dès l'ouverture de l'onglet, pour éviter d'avoir à
  // parcourir manuellement les rendez-vous passés (désormais en tête,
  // la liste étant triée par date croissante).
  //
  // Le défilement est calculé manuellement (position de l'élément dans son
  // propre conteneur, via listRef) plutôt qu'avec scrollIntoView : celui-ci
  // fait défiler TOUS les ancêtres scrollables, y compris la page entière —
  // sur mobile, la page s'ouvrait donc au milieu, avec la barre d'onglets
  // (sticky en haut) hors champ. En restreignant le défilement au seul
  // conteneur de la liste, la page reste calée en haut au chargement.
  const todayStr = toISODate(new Date());
  const nextIndex = merged.findIndex((item) => (item.end_date || item.event_date) >= todayStr);
  const listRef = useRef(null);
  const nextItemRef = useRef(null);
  useEffect(() => {
    if (nextItemRef.current && listRef.current) {
      const container = listRef.current;
      const item = nextItemRef.current;
      const offset = item.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTop = Math.max(offset - 4, 0);
    }
  }, [editingEvent, kindFilter]);

  if (editingEvent !== undefined) {
    return (
      <RendezVousEditor
        event={editingEvent}
        occurrenceDate={editingOccurrenceDate}
        members={members}
        currentUser={currentUser}
        onCancel={() => { setEditingEvent(undefined); setEditingOccurrenceDate(null); }}
        onSave={async (event, isNew) => {
          await saveEvent(event);
          await pushNotification(
            isNew
              ? `🗓️ ${currentUser.name} a ajouté un rendez-vous : « ${event.subject} » (${formatConcertDate(event.event_date, { day: 'numeric', month: 'long', year: 'numeric' })}).`
              : `🛠️ ${currentUser.name} a modifié le rendez-vous « ${event.subject} ».`,
            'info'
          );
          setEditingEvent(undefined);
          setEditingOccurrenceDate(null);
        }}
        onDelete={async (eventId, subject) => {
          await deleteEvent(eventId);
          await pushNotification(`🗑️ ${currentUser.name} a supprimé le rendez-vous « ${subject} ».`, 'info');
          setEditingEvent(undefined);
          setEditingOccurrenceDate(null);
        }}
        onDeleteOccurrence={async (rawEvent, occurrenceDate) => {
          const updated = { ...rawEvent, excluded_dates: [...new Set([...(rawEvent.excluded_dates || []), occurrenceDate])] };
          await saveEvent(updated);
          await pushNotification(`🗑️ ${currentUser.name} a supprimé une occurrence du rendez-vous récurrent « ${rawEvent.subject} » (${formatConcertDate(occurrenceDate, { day: 'numeric', month: 'long', year: 'numeric' })}).`, 'info');
          setEditingEvent(undefined);
          setEditingOccurrenceDate(null);
        }}
      />
    );
  }

  return (
    <div>
      <div className="clx-counter" style={{ padding: '16px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{merged.length}</span> rendez-vous
        </div>
        <button onClick={() => { setEditingEvent(null); setEditingOccurrenceDate(null); }} className="clx-btn clx-btn-primary" style={{ borderRadius: 6, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={15} /> Nouveau rendez-vous
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>Tous</Chip>
        {RENDEZVOUS_KIND_ORDER.map((k) => (
          <Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>{RENDEZVOUS_KIND_INFO[k].label}</Chip>
        ))}
      </div>

      {merged.length === 0 ? (
        <EmptyState text={allMerged.length === 0 ? 'Aucun rendez-vous programmé pour le moment.' : 'Aucun rendez-vous ne correspond à ce filtre.'} />
      ) : (
        <div ref={listRef} className="clx-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
          {merged.map((item, index) => (
            <div key={item.occurrenceKey} ref={index === nextIndex ? nextItemRef : null}>
              <RendezVousCard
                item={item}
                members={members}
                isNext={index === nextIndex}
                onOpen={() => {
                  if (item.source === 'concert') {
                    onViewConcert(item.id);
                  } else {
                    setEditingEvent(item.raw);
                    setEditingOccurrenceDate(item.occurrenceDate);
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RendezVousCard({ item, members, onOpen, isNext }) {
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
    <button
      onClick={onOpen}
      className="clx-card clx-row"
      style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        width: '100%', textAlign: 'left', color: '#F5F1E8', cursor: 'pointer', opacity: past ? 0.6 : 1,
        borderColor: isNext ? '#F2A93B' : undefined,
        boxShadow: isNext ? '0 0 0 1px #F2A93B55' : undefined,
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

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="clx-badge" style={{ background: `${kindInfo.color}22`, color: kindInfo.color, border: `1px solid ${kindInfo.color}55` }}>{kindInfo.badge}</span>
          {isNext && (
            <span className="clx-badge" style={{ background: '#F2A93B22', color: '#F2A93B', border: '1px solid #F2A93B55' }}>PROCHAIN</span>
          )}
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
  );
}

function RendezVousEditor({ event, occurrenceDate, members, currentUser, onCancel, onSave, onDelete, onDeleteOccurrence }) {
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

  // Règles de saisie assistée :
  // - la date de fin recopie la date de début à chaque saisie de celle-ci ;
  // - l'horaire de fin recopie l'horaire de début à chaque saisie de
  //   celui-ci, SAUF : (a) sur un rendez-vous multi-jours, où début/fin
  //   représentent des horaires quotidiens indépendants, ou (b) si la
  //   nouvelle heure de début reste antérieure à l'heure de fin déjà
  //   saisie (la plage reste valide, on ne touche donc pas à la fin) ;
  // - à l'activation de la récurrence (et à chaque changement de date de
  //   début tant qu'elle est active), la date "Jusqu'au" est recalculée à
  //   date de début + 1 an.
  // Dans les trois cas, le champ concerné reste modifiable manuellement par
  // la suite ; il n'est réécrasé que lorsque son champ déclencheur change.
  const isMultiDay = !!(eventDate && endDate && endDate !== eventDate);

  const handleEventDateChange = (v) => {
    setEventDate(v);
    setEndDate(v);
    if (isRecurring) setRecurrenceUntil(v ? addRecurrenceUnit(v, 'year', 1) : '');
  };

  const handleStartTimeChange = (v) => {
    setStartTime(v);
    if (isMultiDay) return; // règle multi-jours : pas de recopie automatique
    if (endTime && v < endTime) return; // la plage reste valide, on laisse la fin telle quelle
    setEndTime(v);
  };

  const handleRecurringToggle = (checked) => {
    setIsRecurring(checked);
    if (checked) setRecurrenceUntil(eventDate ? addRecurrenceUnit(eventDate, 'year', 1) : '');
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

  const isRecurringSeries = !!(event?.recurrence_unit && event?.recurrence_interval && event?.recurrence_until);
  const canDeleteOccurrence = isEdit && isRecurringSeries && !!occurrenceDate;

  const handleDelete = () => {
    const message = isRecurringSeries
      ? `Supprimer définitivement TOUTE la série « ${event.subject} » (toutes ses occurrences) ? Pour ne retirer qu'une seule date, utilise plutôt "Supprimer cette occurrence" ci-dessous. Cette action est irréversible.`
      : `Supprimer définitivement le rendez-vous « ${event.subject} » ? Cette action est irréversible.`;
    if (window.confirm(message)) {
      onDelete(event.id, event.subject);
    }
  };

  const handleDeleteOccurrence = () => {
    if (window.confirm(`Supprimer uniquement l'occurrence du ${formatConcertDate(occurrenceDate, { day: 'numeric', month: 'long', year: 'numeric' })} pour « ${event.subject} » ? Les autres dates de la série ne seront pas affectées.`)) {
      onDeleteOccurrence(event, occurrenceDate);
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
            <input type="date" className="clx-input" value={eventDate} onChange={(e) => handleEventDateChange(e.target.value)} />
          </Field>
          <Field label="Date de fin" style={{ flex: '1 1 140px' }}>
            <input type="date" className="clx-input" value={endDate} min={eventDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
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
              <input type="time" className="clx-input" value={startTime} onChange={(e) => handleStartTimeChange(e.target.value)} />
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
            onChange={(e) => handleRecurringToggle(e.target.checked)}
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isEdit ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canDeleteOccurrence && (
              <button
                onClick={handleDeleteOccurrence}
                className="clx-btn"
                style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={14} /> Supprimer cette occurrence
              </button>
            )}
            <button
              onClick={handleDelete}
              className="clx-btn"
              style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, background: 'transparent', color: '#C1454B', border: '1px solid #C1454B55', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> {isRecurringSeries ? 'Supprimer toute la série' : 'Supprimer le rendez-vous'}
            </button>
          </div>
        ) : <span />}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onCancel} className="clx-btn clx-btn-ghost" style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center' }}>Annuler</button>
          <button
            onClick={submit}
            disabled={saving}
            className="clx-btn clx-btn-primary"
            style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center' }}
          >
            {saving ? 'Enregistrement…' : (isEdit ? 'Enregistrer les modifications' : 'Créer le rendez-vous')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BOÎTE À IDÉES — suggestions d'amélioration de l'application        */
/* ------------------------------------------------------------------ */

function IdeasTab({ ideas, members, currentUser, saveIdea, deleteIdea, pushNotification }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = statusFilter === 'all' ? ideas : ideas.filter((i) => i.status === statusFilter);

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    const idea = {
      id: uid('idea'),
      content: content.trim(),
      created_by_user_id: currentUser.id,
      status: 'created',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await saveIdea(idea);
      await pushNotification(`💡 ${currentUser.name} a ajouté une idée : « ${idea.content.slice(0, 90)}${idea.content.length > 90 ? '…' : ''} ».`, 'info');
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (idea, newStatus) => {
    if (newStatus === idea.status) return;
    await saveIdea({ ...idea, status: newStatus, updated_at: new Date().toISOString() });
    if (newStatus === 'done') {
      await pushNotification(`✅ Idée marquée comme terminée : « ${idea.content.slice(0, 90)}${idea.content.length > 90 ? '…' : ''} ».`, 'info');
    }
  };

  const handleDelete = async (idea) => {
    if (!window.confirm('Supprimer définitivement cette idée ? Cette action est irréversible.')) return;
    await deleteIdea(idea.id);
  };

  return (
    <div>
      <div className="clx-counter" style={{ padding: '16px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{filtered.length}</span> idée{filtered.length > 1 ? 's' : ''}
        </div>
      </div>

      <div className="clx-card" style={{ padding: 16, marginBottom: 18 }}>
        <div className="clx-tape" />
        <Field label="Nouvelle idée">
          <textarea
            className="clx-input"
            style={{ minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Décris ton idée d'amélioration pour l'application…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={submit}
            disabled={!content.trim() || submitting}
            className="clx-btn clx-btn-primary"
            style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: (!content.trim() || submitting) ? 0.5 : 1 }}
          >
            <Plus size={15} /> Ajouter l'idée
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Tous</Chip>
        {IDEA_STATUS_ORDER.map((k) => (
          <Chip key={k} active={statusFilter === k} onClick={() => setStatusFilter(k)}>{IDEA_STATUS[k].label}</Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={ideas.length === 0 ? 'Aucune idée pour le moment — sois le premier à en proposer une !' : 'Aucune idée ne correspond à ce filtre.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} members={members} onChangeStatus={changeStatus} onDelete={() => handleDelete(idea)} />
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea, members, onChangeStatus, onDelete }) {
  const creator = members.find((m) => m.id === idea.created_by_user_id);
  const statusInfo = IDEA_STATUS[idea.status] || IDEA_STATUS.created;
  const when = new Date(idea.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="clx-card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{idea.content}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="clx-mono" style={{ fontSize: 11, color: '#6B6862' }}>
          Par {creator ? creator.name : 'membre inconnu'} · {when}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="clx-input"
            style={{ fontSize: 11, padding: '5px 8px', width: 'auto', color: statusInfo.color, borderColor: `${statusInfo.color}55` }}
            value={idea.status}
            onChange={(e) => onChangeStatus(idea, e.target.value)}
          >
            {IDEA_STATUS_ORDER.map((k) => <option key={k} value={k}>{IDEA_STATUS[k].label}</option>)}
          </select>
          <button
            onClick={onDelete}
            className="clx-btn clx-btn-ghost"
            style={{ padding: '6px 7px', borderRadius: 6, display: 'flex', color: '#C1454B' }}
            title="Supprimer cette idée"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
