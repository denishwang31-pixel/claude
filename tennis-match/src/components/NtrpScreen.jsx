/* NTRP 관리 — 기준 안내 / 셀프 평가 / 운영진 인증 / 회원 투표 */
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { setNtrpSelf, setNtrpCertified, setNtrpVote, clearNtrpCertified } from '../lib/firestore';
import { NTRP_LEVELS, effectiveNtrp, levelInfo, voteMedian, careerText } from '../lib/ntrp';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';

const Scale = ({ value, onPick, disabledValues = [] }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
    {NTRP_LEVELS.map((l) => {
      const on = Math.abs((value ?? -1) - l.v) < 0.001;
      const off = disabledValues.includes(l.v);
      return (
        <Pressable key={l.v} onPress={() => !off && onPick(l.v)}
          style={{
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
            backgroundColor: on ? C.green : '#f5f5f4', opacity: off ? 0.4 : 1,
          }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: on ? C.lime : C.sub }}>{l.v.toFixed(1)}</Text>
        </Pressable>
      );
    })}
  </View>
);

export function Ntrp({ clubId, members, me, meVal, isAdmin, flash }) {
  const [tab, setTab] = useState('me');       // me | guide | club
  const [openLevel, setOpenLevel] = useState(null);
  const [target, setTarget] = useState(null); // 투표/인증 대상 회원

  const myEff = effectiveNtrp(meVal);

  const Tab = ({ v, label }) => (
    <Pressable onPress={() => setTab(v)}
      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: tab === v ? C.green : '#fff', borderWidth: tab === v ? 0 : 1, borderColor: C.border }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: tab === v ? C.lime : C.sub }}>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Tab v="me" label="내 등급" />
        <Tab v="guide" label="기준 안내" />
        <Tab v="club" label="클럽 등급표" />
      </View>

      {/* ---------------- 내 등급 ---------------- */}
      {tab === 'me' && (
        <View>
          <Card style={{ backgroundColor: C.ink, borderColor: C.green }}>
            <Text style={{ color: C.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>MY NTRP</Text>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 4 }}>
              {myEff.value != null ? myEff.value.toFixed(1) : '—'}
              {myEff.value != null && <Text style={{ fontSize: 13, color: '#6ee7b7' }}>  {levelInfo(myEff.value)?.short || ''}</Text>}
            </Text>
            <Text style={{ color: '#6ee7b7', fontSize: 11, marginTop: 4 }}>
              산정 근거: {myEff.label}
              {meVal?.startedAt ? ` · 구력 ${careerText(meVal.startedAt)}` : ''}
            </Text>
            <Text style={{ color: '#34d399', fontSize: 10, marginTop: 8 }}>
              우선순위: 운영진 인증 &gt; 회원 투표(중앙값) &gt; 셀프 평가
            </Text>
          </Card>

          <SectionTitle>셀프 평가</SectionTitle>
          <Card>
            <Text style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>
              아래 "기준 안내" 탭의 체크리스트를 보고 본인 수준을 선택하세요. 언제든 수정할 수 있습니다.
            </Text>
            <Scale value={meVal?.ntrpSelf} onPick={(v) => { setNtrpSelf(clubId, me, v); flash(`셀프 평가 ${v.toFixed(1)} 저장`); }} />
            {meVal?.ntrpCertified != null && (
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>
                ※ 운영진 인증({meVal.ntrpCertified.toFixed(1)})이 있어 표시 등급은 인증값이 우선합니다.
              </Text>
            )}
          </Card>

          <SectionTitle>나에 대한 회원 투표</SectionTitle>
          <Card>
            {Object.keys(meVal?.ntrpVotes || {}).length ? (
              <>
                <Text style={{ fontSize: 22, fontWeight: '900', color: C.green }}>
                  {voteMedian(meVal.ntrpVotes)?.toFixed(1)}
                  <Text style={{ fontSize: 12, color: C.sub, fontWeight: '600' }}>  (중앙값 · {Object.keys(meVal.ntrpVotes).length}명 참여)</Text>
                </Text>
                <Text style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>누가 몇 점을 줬는지는 공개되지 않습니다.</Text>
              </>
            ) : (
              <Text style={{ fontSize: 12, color: C.faint }}>아직 투표가 없습니다. 함께 운동한 회원들이 평가하면 표시됩니다.</Text>
            )}
          </Card>
        </View>
      )}

      {/* ---------------- 기준 안내 ---------------- */}
      {tab === 'guide' && (
        <View>
          <Card>
            <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 6 }}>NTRP란?</Text>
            <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
              미국테니스협회(USTA)의 실력 지표로, 2.0~7.0을 0.5 단위로 나눕니다. 국내 동호회는 대부분 2.0~5.0 구간에
              분포합니다. 정답이 있는 시험이 아니라 "이 정도는 안정적으로 된다"를 기준으로 보수적으로 잡는 것이 관행입니다.
              아래 항목을 읽고 <Text style={{ fontWeight: '700' }}>대부분 해당되는 가장 낮은 등급</Text>을 고르세요.
            </Text>
          </Card>
          {NTRP_LEVELS.map((l) => {
            const open = openLevel === l.v;
            return (
              <Card key={l.v} style={{ marginTop: 8 }}>
                <Pressable onPress={() => setOpenLevel(open ? null : l.v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Chip tone="lime">{l.v.toFixed(1)}</Chip>
                    <Text style={{ fontSize: 14, fontWeight: '700' }}>{l.label.split(' ')[1]}</Text>
                    <Text style={{ fontSize: 11, color: C.faint }}>{l.short}</Text>
                  </View>
                  <Text style={{ color: C.faint }}>{open ? '▾' : '▸'}</Text>
                </Pressable>
                {open && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: '#44403c', lineHeight: 18 }}>{l.desc}</Text>
                    <View style={{ marginTop: 8, gap: 4 }}>
                      {l.checks.map((c) => (
                        <Text key={c} style={{ fontSize: 12, color: C.sub }}>· {c}</Text>
                      ))}
                    </View>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {/* ---------------- 클럽 등급표 (투표/인증) ---------------- */}
      {tab === 'club' && (
        <View>
          <Text style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
            회원을 눌러 등급을 투표하세요{isAdmin ? ' (운영진은 인증 등급을 확정할 수 있습니다)' : ''}. 투표는 익명 집계됩니다.
          </Text>
          {members.map((m) => {
            const eff = effectiveNtrp(m);
            const myVote = m.ntrpVotes?.[me];
            const open = target === m.id;
            return (
              <Card key={m.id} style={{ marginBottom: 8 }}>
                <Pressable onPress={() => setTarget(open ? null : m.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: m.gender === 'F' ? C.femaleBg : C.maleBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: m.gender === 'F' ? C.female : C.male }}>{m.name?.[0]}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
                      <Text style={{ fontSize: 10, color: C.faint }}>
                        {eff.label}{m.startedAt ? ` · 구력 ${careerText(m.startedAt)}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: eff.value != null ? C.green : C.faint }}>
                      {eff.value != null ? eff.value.toFixed(1) : '—'}
                    </Text>
                    {eff.source === 'certified' && <Text style={{ fontSize: 9, color: C.green2 }}>✓인증</Text>}
                  </View>
                </Pressable>

                {open && (
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#f5f5f4', paddingTop: 10 }}>
                    {m.id !== me ? (
                      <>
                        <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                          내 투표 {myVote != null ? `(현재 ${myVote.toFixed(1)})` : ''}
                        </Text>
                        <Scale value={myVote} onPick={(v) => { setNtrpVote(clubId, m.id, me, v); flash(`${m.name} 등급 ${v.toFixed(1)} 투표 완료`); }} />
                      </>
                    ) : (
                      <Text style={{ fontSize: 12, color: C.faint }}>본인에게는 투표할 수 없습니다. (셀프 평가는 "내 등급" 탭)</Text>
                    )}

                    {isAdmin && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                          운영진 인증 등급 {m.ntrpCertified != null ? `(현재 ${m.ntrpCertified.toFixed(1)})` : ''}
                        </Text>
                        <Scale value={m.ntrpCertified} onPick={(v) => { setNtrpCertified(clubId, m.id, v); flash(`${m.name} 인증 등급 ${v.toFixed(1)} 확정`); }} />
                        {m.ntrpCertified != null && (
                          <View style={{ marginTop: 8 }}>
                            <Btn small tone="ghost" onPress={() => { clearNtrpCertified(clubId, m.id); flash('인증 해제됨'); }}>인증 해제</Btn>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}
