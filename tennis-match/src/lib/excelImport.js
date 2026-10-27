/* ============================================================
   엑셀 불러오기 — 대회 방식에 따라 양식·검사를 고른다 (2026-10-27)
     · 팀 대항(청백전 2·3팀 · 팀 리그 · 교류전)  lib/tourneyImport.js
     · 조별리그 · 토너먼트(stage 'draw')          lib/bracketImport.js
   ============================================================ */
import { buildTemplate, parseImport } from './tourneyImport.js';
import { buildBracketTemplate, parseBracketImport, bracketSupport } from './bracketImport.js';

/** 'team' | 'bracket' | { reason } */
export function importKind(t) {
  if (t?.stage === 'team' || t?.stage === 'league') return 'team';
  if (t?.stage === 'draw') {
    const s = bracketSupport(t);
    return s.ok ? 'bracket' : { reason: s.reason };
  }
  return { reason: '이 대회 방식은 아직 엑셀 불러오기를 지원하지 않습니다.' };
}

export function templateFor(t) {
  return importKind(t) === 'bracket' ? buildBracketTemplate(t) : buildTemplate(t);
}

/** opts: { t, members, personOf: { team, bracket } } */
export function parseFor(sheets, { t, members, personOf = {} } = {}) {
  return importKind(t) === 'bracket'
    ? parseBracketImport(sheets, { t, members, ...(personOf.bracket ? { personOf: personOf.bracket } : {}) })
    : parseImport(sheets, { t, members, ...(personOf.team ? { personOf: personOf.team } : {}) });
}

export default { importKind, templateFor, parseFor };
