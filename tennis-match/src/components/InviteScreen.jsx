/* ============================================================
   클럽 초대 — 초대코드가 무엇인지 설명하고, 링크로 바로 보낸다.

   초대코드의 쓰임새 (자주 묻는 질문)
     · 코드를 아는 사람은 운영진 승인 없이 곧바로 회원이 된다
     · 그래서 단톡방·공개 게시판에 올리지 말고 초대할 사람에게만 보낸다
     · 코드를 모르는 사람은 [클럽 검색 → 가입 신청 → 운영진 승인] 경로를 쓴다
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  shareInvite, copyInviteUrl, copyInviteMessage, copyCode, inviteUrl,
} from '../lib/invite';
import { publishClubDirectory, getClubDirectory } from '../lib/firestore';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';

export function Invite({ clubId, club, members, isAdmin, flash }) {
  const code = club?.inviteCode || '';
  const [searchable, setSearchable] = useState(true);
  const synced = useRef(false);

  /* 이 화면에 들어오면 공개 목록을 클럽 현재 정보로 맞춰둔다.
     (예전 버전에서 만든 클럽은 공개 목록 문서가 없어 검색되지 않으므로
      운영진이 초대 화면을 한 번 열면 자동으로 등록된다) */
  useEffect(() => {
    if (!clubId || !club || !isAdmin || synced.current) return;
    synced.current = true;
    (async () => {
      try {
        const dir = await getClubDirectory(clubId);
        const keep = dir?.searchable !== false;
        setSearchable(keep);
        await publishClubDirectory(clubId, {
          name: club.name || '',
          region: club.settings?.region || '',
          memberCount: members?.length || 0,
          searchable: keep,
        });
      } catch (e) { /* 권한·네트워크 문제면 조용히 넘어간다 */ }
    })();
  }, [clubId, club, isAdmin, members?.length]);

  if (!code) {
    return (
      <Card>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          이 클럽에는 아직 초대코드가 없습니다.{'\n'}
          예전 버전에서 만든 클럽일 수 있어요. 운영진에게 문의하거나 클럽을 다시 만들어 주세요.
        </Text>
      </Card>
    );
  }

  const toggleSearchable = async (next) => {
    setSearchable(next);
    try {
      await publishClubDirectory(clubId, {
        name: club?.name || '',
        region: club?.settings?.region || '',
        memberCount: members?.length || 0,
        searchable: next,
      });
      flash(next ? '이제 검색으로 찾을 수 있습니다' : '검색 목록에서 숨겼습니다 (초대코드로만 가입)');
    } catch (e) {
      setSearchable(!next);
      flash('설정 변경에 실패했습니다');
    }
  };

  return (
    <View>
      {/* 코드 카드 */}
      <Card style={{ backgroundColor: C.ink, borderColor: C.green, alignItems: 'center', paddingVertical: 22 }}>
        <Text style={{ color: '#BFE3D3', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>초대코드</Text>
        <Pressable onPress={() => { copyCode(code); flash('코드를 복사했습니다'); }} hitSlop={10}>
          <Text style={{ color: C.lime, fontSize: 34, fontWeight: '700', letterSpacing: 8, marginTop: 8 }}>
            {code}
          </Text>
        </Pressable>
        <Text style={{ color: '#8FD6B8', fontSize: 10, marginTop: 6 }}>코드를 누르면 복사됩니다</Text>
      </Card>

      {/* 보내기 */}
      <View style={{ marginTop: 12, gap: 8 }}>
        <Btn full onPress={async () => {
          const ok = await shareInvite(club?.name, code);
          if (ok) flash('초대를 보냈습니다');
        }}>📤 카톡·문자로 초대 보내기</Btn>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Btn full tone="ghost" onPress={() => { copyInviteUrl(code); flash('초대 링크를 복사했습니다'); }}>
              🔗 링크 복사
            </Btn>
          </View>
          <View style={{ flex: 1 }}>
            <Btn full tone="ghost" onPress={() => { copyInviteMessage(club?.name, code); flash('초대 문구를 복사했습니다'); }}>
              📋 문구 복사
            </Btn>
          </View>
        </View>
      </View>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 10, color: C.faint, marginBottom: 4 }}>보내지는 링크</Text>
        <Text selectable style={{ fontSize: 11, color: C.green2, fontWeight: '600' }}>{inviteUrl(code)}</Text>
      </Card>

      {/* 설명 */}
      <SectionTitle>초대코드는 어디에 쓰나요?</SectionTitle>
      <Card>
        {[
          ['🎟', '초대장 그 자체입니다', '코드를 아는 사람은 운영진 승인 없이 바로 우리 클럽 회원이 됩니다.'],
          ['🔗', '링크를 누르면 자동 입력', '앱이 깔려 있으면 링크를 누르는 것만으로 코드가 채워져 가입까지 이어집니다.'],
          ['🙈', '아무 데나 올리지 마세요', '단톡방·공개 게시판에 올리면 모르는 사람도 들어올 수 있습니다. 초대할 분에게만 보내세요.'],
          ['🔎', '코드가 없는 사람은', '클럽 이름으로 검색해 [가입 신청] → 운영진이 [가입 신청] 메뉴에서 승인하면 입장합니다.'],
        ].map(([icon, title, body], i) => (
          <View key={title} style={{
            flexDirection: 'row', gap: 10, paddingVertical: 9,
            borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4',
          }}>
            <Text style={{ fontSize: 16 }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700' }}>{title}</Text>
              <Text style={{ fontSize: 11, color: C.sub, marginTop: 2, lineHeight: 16 }}>{body}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* 검색 노출 */}
      {isAdmin && (
        <>
          <SectionTitle>공개 목록 노출</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700' }}>클럽 검색에 노출</Text>
                <Text style={{ fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 16 }}>
                  켜두면 다른 사람이 클럽 이름·지역으로 찾아 가입 신청할 수 있습니다.
                  끄면 초대코드를 아는 사람만 들어올 수 있습니다.
                </Text>
              </View>
              <Chip tone={searchable ? 'green' : 'outline'} onPress={() => toggleSearchable(!searchable)}>
                {searchable ? '노출 중' : '숨김'}
              </Chip>
            </View>
            <Text style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>
              공개되는 정보는 클럽 이름·지역·회원 수뿐입니다. 일정·회원 명단은 회원만 볼 수 있습니다.
            </Text>
          </Card>
        </>
      )}
    </View>
  );
}

export default Invite;
