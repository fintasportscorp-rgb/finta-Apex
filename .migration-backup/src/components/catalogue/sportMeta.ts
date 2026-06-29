// Sport metadata — display names, accent palette, icon key.
// Discipline keys match the strings stored in script JSON files.

export type SportAccent = 'violet' | 'cyan' | 'mint' | 'pink' | 'amber'

export interface SportMeta {
  key: string
  name: { fr: string; en: string }
  accent: SportAccent
  icon: SportIconName
}

export type SportIconName =
  | 'bow' | 'runner' | 'shuttle' | 'hoop' | 'glove' | 'bike'
  | 'ball-seam' | 'club' | 'rings' | 'spine' | 'racket' | 'oar'
  | 'ski' | 'wave' | 'barbell' | 'default'

const META: Record<string, SportMeta> = {
  tir_arc:       { key: 'tir_arc',       name: { fr: 'Arc',           en: 'Archery' },        accent: 'mint',   icon: 'bow' },
  athletics:     { key: 'athletics',     name: { fr: 'Athlétisme',    en: 'Athletics' },      accent: 'cyan',   icon: 'runner' },
  badminton:     { key: 'badminton',     name: { fr: 'Badminton',     en: 'Badminton' },      accent: 'mint',   icon: 'shuttle' },
  basketball:    { key: 'basketball',    name: { fr: 'Basketball',    en: 'Basketball' },     accent: 'amber',  icon: 'hoop' },
  boxe:          { key: 'boxe',          name: { fr: 'Boxe',          en: 'Boxing' },         accent: 'pink',   icon: 'glove' },
  cycling:       { key: 'cycling',       name: { fr: 'Cyclisme',      en: 'Cycling' },        accent: 'violet', icon: 'bike' },
  football:      { key: 'football',      name: { fr: 'Football',      en: 'Soccer' },         accent: 'mint',   icon: 'ball-seam' },
  golf:          { key: 'golf',          name: { fr: 'Golf',          en: 'Golf' },           accent: 'amber',  icon: 'club' },
  gymnastics:    { key: 'gymnastics',    name: { fr: 'Gymnastique',   en: 'Gymnastics' },     accent: 'pink',   icon: 'rings' },
  handball:      { key: 'handball',      name: { fr: 'Handball',      en: 'Handball' },       accent: 'cyan',   icon: 'ball-seam' },
  kinesiology:   { key: 'kinesiology',   name: { fr: 'Kinésiologie',  en: 'Kinesiology' },    accent: 'violet', icon: 'spine' },
  padel:         { key: 'padel',         name: { fr: 'Padel',         en: 'Padel' },          accent: 'cyan',   icon: 'racket' },
  rowing:        { key: 'rowing',        name: { fr: 'Aviron',        en: 'Rowing' },         accent: 'cyan',   icon: 'oar' },
  ski_alpin:     { key: 'ski_alpin',     name: { fr: 'Ski alpin',     en: 'Alpine Ski' },     accent: 'mint',   icon: 'ski' },
  swimming:      { key: 'swimming',      name: { fr: 'Natation',      en: 'Swimming' },       accent: 'cyan',   icon: 'wave' },
  tennis:        { key: 'tennis',        name: { fr: 'Tennis',        en: 'Tennis' },         accent: 'violet', icon: 'racket' },
  volleyball:    { key: 'volleyball',    name: { fr: 'Volleyball',    en: 'Volleyball' },     accent: 'amber',  icon: 'ball-seam' },
  weightlifting: { key: 'weightlifting', name: { fr: 'Haltérophilie', en: 'Weightlifting' },  accent: 'pink',   icon: 'barbell' },
}

const FALLBACK: SportMeta = {
  key: '__fallback',
  name: { fr: 'Autre', en: 'Other' },
  accent: 'violet',
  icon: 'default',
}

export function getSportMeta(discipline: string): SportMeta {
  return META[discipline] ?? {
    ...FALLBACK,
    key: discipline,
    name: { fr: titleCase(discipline), en: titleCase(discipline) },
  }
}

export function getAllSportKeys(): string[] {
  return Object.keys(META)
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export const ACCENT_COLORS: Record<SportAccent, { stroke: string; glow: string; tint: string }> = {
  violet: { stroke: '#7cf1f9', glow: 'rgba(124,241,249,0.45)', tint: 'rgba(124,241,249,0.12)' },
  cyan:   { stroke: '#61ced6', glow: 'rgba(97,206,214,0.45)',  tint: 'rgba(97,206,214,0.12)' },
  mint:   { stroke: '#46acb3', glow: 'rgba(70,172,179,0.45)',  tint: 'rgba(70,172,179,0.12)' },
  pink:   { stroke: '#2a8b92', glow: 'rgba(42,139,146,0.45)',  tint: 'rgba(42,139,146,0.12)' },
  amber:  { stroke: '#076b72', glow: 'rgba(7,107,114,0.45)',   tint: 'rgba(7,107,114,0.12)' },
}
