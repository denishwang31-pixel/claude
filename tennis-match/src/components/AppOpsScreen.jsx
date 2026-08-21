/* ============================================================
   앱 운영 — 앱 운영자 명단 · 공개 클럽 목록

   여기 있는 두 가지는 원래 Firebase 콘솔에서만 할 수 있었다.
   그래서 두 가지 문제가 있었다.

     인수인계가 불가능했다
       앱 운영자를 세우려면 콘솔에 들어가야 했다. 내가 사라지면 아무도
       용품·코치를 관리할 수 없다. 이제 앱 운영자가 앱 안에서 다음 사람을
       세울 수 있다. (처음 한 명만 콘솔에서 만든다 — 그래야 시작한다)

     시험 클럽을 지우려면 클럽마다 계정을 갈아타야 했다
       테스트하며 만든 클럽이 검색에 그대로 뜬다. 여기서 한 화면에 모아
       놓고 노출만 끄면 된다.

   ⚠️ 스스로를 내리는 것은 규칙이 막는다. 마지막 운영자가 자기를 내리면
      아무도 안 남아서 콘솔로 들어가는 수밖에 없다.
   ============================================================ */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  subAppAdmins, addAppAdmin, removeAppAdmin,
  subAllClubDirectory, setClubSearchable,
} from '../lib/firestore';
import { Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, Field, EmptyState } from './ui';
import { C, F } from '../lib/theme';

export function AppOps({ me, flash }) {
  const [admins, setAdmins] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [tab, setTab] = useState('clubs');    // clubs | admins
  const [uid, setUid] = useState('');
  const [note, setNote] = useState('');
  const [kw, setKw] = useState('');

  useEffect(() => subAppAdmins(setAdmins), []);
  useEffect(() => subAllClubDirectory(setClubs), []);

  const list = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return [...clubs]
      .filter((c) => !q || String(c.name || '').toLowerCase().includes(q))
      /* 숨긴 것을 아래로 — 정리해야 할 것이 위에 오도록 */
      .sort((a, b) => (a.searchable === false ? 1 : 0) - (b.searchable === false ? 1 : 0)
        || String(a.name || '').localeCompare(String(b.name || '')));
  }, [clubs, kw]);

  const shown = clubs.filter((c) => c.searchable !== false).length;

  const add = async () => {
    const id = uid.trim();
    if (!id) return flash('uid 를 넣어 주세요');
    if (admins.some((a) => a.id === id)) return flash('이미 앱 운영자입니다');
    try {
      await addAppAdmin(id, note.trim());
      setUid(''); setNote('');
      return flash('앱 운영자로 등록했습니다');
    } catch (e) {
      return flash(e?.message || '등록하지 못했습니다');
    }
  };

  const remove = (a) => {
    if (a.id === me) {
      flash('스스로는 내릴 수 없습니다 — 아무도 안 남으면 콘솔로만 복구됩니다');
      return;
    }
    Alert.alert('앱 운영자 내리기', `${a.note || a.id} 을(를) 내릴까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '내리기',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAppAdmin(a.id);
            flash('내렸습니다');
          } catch (e) { flash(e?.message || '내리지 못했습니다'); }
        },
      },
    ]);
  };

  const toggle = async (c) => {
    try {
      await setClubSearchable(c.id, c.searchable === false);
      flash(c.searchable === false ? '검색에 다시 노출합니다' : '검색에서 숨겼습니다');
    } catch (e) { flash(e?.message || '바꾸지 못했습니다'); }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        <Chip tone={tab === 'clubs' ? 'green' : 'outline'} onPress={() => setTab('clubs')}>
          공개 클럽 {shown}/{clubs.length}
        </Chip>
        <Chip tone={tab === 'admins' ? 'green' : 'outline'} onPress={() => setTab('admins')}>
          앱 운영자 {admins.length}
        </Chip>
      </View>

      {tab === 'clubs' ? (
        <View>
          <Card>
            <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
              여기서 끄면 <Text style={{ fontWeight: '700' }}>클럽 검색에 안 나옵니다.</Text>
              {'\n'}클럽 자체가 지워지지는 않고, 그 클럽 회원은 그대로 씁니다.
              시험 삼아 만든 클럽을 정리할 때 쓰세요.
            </Text>
          </Card>

          <View style={{ marginTop: 10 }}>
            <Field placeholder="클럽 이름으로 찾기" value={kw} onChangeText={setKw} />
          </View>

          {list.length === 0 ? (
            <EmptyState icon="🎾" title="공개된 클럽이 없습니다"
              body="클럽이 만들어지면 여기에 나타납니다." />
          ) : list.map((c) => {
            const on = c.searchable !== false;
            return (
              <Card key={c.id} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={F.bodyBold}>{c.name || '(이름 없음)'}</Text>
                    <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                      {c.region || '지역 미등록'} · 회원 {c.memberCount ?? 0}명
                    </Text>
                    <Pressable onPress={async () => {
                      await Clipboard.setStringAsync(c.id);
                      flash('클럽 id 를 복사했습니다');
                    }}>
                      <Text style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
                        {c.id}
                      </Text>
                    </Pressable>
                  </View>
                  <Chip tone={on ? 'green' : 'outline'} onPress={() => toggle(c)}>
                    {on ? '검색 노출' : '숨김'}
                  </Chip>
                </View>
              </Card>
            );
          })}
        </View>
      ) : (
        <View>
          <Card>
            <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
              앱 운영자는 용품 등록, 코치 승인, 광고비 청구를 할 수 있습니다.
              클럽 운영진과는 다른 권한입니다.
              {'\n\n'}
              <Text style={{ fontWeight: '700' }}>스스로는 내릴 수 없습니다.</Text>
              {' '}마지막 한 명이 자기를 내리면 아무도 안 남아서 Firebase 콘솔로만
              되돌릴 수 있기 때문입니다.
            </Text>
          </Card>

          {admins.map((a) => (
            <Card key={a.id} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={F.bodyBold}>{a.note || '(메모 없음)'}</Text>
                  <Text style={{ fontSize: 10, color: C.faint, marginTop: 3 }} selectable>
                    {a.id}
                  </Text>
                </View>
                {a.id === me
                  ? <Chip tone="soft">나</Chip>
                  : <Chip tone="red" onPress={() => remove(a)}>내리기</Chip>}
              </View>
            </Card>
          ))}

          <SectionTitle hint="uid 를 정확히 알아야 합니다">앱 운영자 추가</SectionTitle>
          <Card>
            <Label hint="Firebase 콘솔 → Authentication 에서 그 사람의 uid 를 복사하세요">
              uid
            </Label>
            <Field placeholder="예: m3wwejlGnXaCUZY8ObTTuBkSXie2" autoCapitalize="none"
              value={uid} onChangeText={setUid} />

            <Label hint="누구인지 알아보기 위한 메모">이름·메모</Label>
            <Field placeholder="예: 홍길동 (부운영자)" value={note} onChangeText={setNote} />

            <View style={{ marginTop: 10 }}>
              <Btn full disabled={!uid.trim()} onPress={add}>앱 운영자로 등록</Btn>
            </View>
            <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 15 }}>
              이름이 아니라 uid 로 등록합니다. 사람 이름은 클럽마다 다를 수 있고
              중복될 수 있어서, 계정을 정확히 가리키는 값이어야 합니다.
            </Text>
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

export default AppOps;
