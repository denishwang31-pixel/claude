/* ============================================================
   클럽 채팅 — 공지·게시판보다 가벼운 실시간 대화

   누구에게 가는 대화인가 (채널)
     전체    클럽 회원 모두. 기본 채널이다.
     코트장  그 코트장에서 운동하는 사람들끼리. 코트를 여러 곳 운영하면
             "이번 주 화요일 몇 명?" 같은 이야기는 그 코트 사람들에게만
             가야 한다. 전체 방에 올리면 상관없는 회원까지 알림을 받는다.

     운영진은 여러 코트를 담당할 수 있으므로 채널을 골라 가며 본다.
     회원은 자기가 속한 코트장 채널과 전체 채널을 본다.
     (읽기 권한은 클럽 회원 전체로 같다 — 칸막이가 아니라 정리용이다)

   최근 200개만 구독한다. 오래된 클럽일수록 전체를 받으면 앱이 무거워지고
   읽기 비용도 그만큼 나가기 때문이다. 그 위쪽 기록은 게시판에 남긴다.

   말풍선은 플랫폼 관례를 따른다 — 내 메시지는 오른쪽 채움, 상대는 왼쪽 회색.
   ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { subMessages, sendMessage, deleteMessage } from '../lib/firestore';
import { Touchable, isAndroid, HIT } from './native';
import { Chip } from './ui';
import { C, S, R, F } from '../lib/theme';

const dayLabel = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return '';
  const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
};
const timeLabel = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return '';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
};

export function Chat({ clubId, me, meVal, members, venues = [], isAdmin, flash }) {
  const [all, setAll] = useState([]);
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('');   // '' = 전체
  const listRef = useRef(null);

  useEffect(() => {
    if (!clubId) return undefined;
    const unsub = subMessages(clubId, setAll, 300);
    return () => unsub && unsub();
  }, [clubId]);

  /* 채널별로 갈라서 본다.

     서버에서 채널로 걸러 오지 않고 최근 300개를 받아 여기서 나눈다.
     채널 조건을 붙이면 복합 색인이 필요한데, 동호회 채팅 분량에서는
     그만한 값어치가 없다. 대신 받는 개수를 넉넉히 잡았다. */
  const messages = useMemo(
    () => all.filter((m) => (m.channel || '') === channel),
    [all, channel],
  );

  /* 안 읽은 채널 표시용 — 채널마다 최근 메시지가 있는지 */
  const hasMsg = (ch) => all.some((m) => (m.channel || '') === ch);

  const channelName = channel
    ? (venues.find((v) => v.id === channel)?.name || '코트장')
    : '전체';

  const send = () => {
    const body = text.trim();
    if (!body) return;
    sendMessage(clubId, {
      body, channel, authorId: me,
      author: meVal?.name || '', gender: meVal?.gender || '',
    });
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const longPress = (m) => {
    const mine = m.authorId === me;
    if (!mine && !isAdmin) return;
    Alert.alert('메시지', m.body, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => { deleteMessage(clubId, m.id); flash('삭제했습니다'); },
      },
    ]);
  };

  const render = ({ item, index }) => {
    const mine = item.authorId === me;
    const prev = messages[index - 1];
    const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(item.createdAt);
    // 같은 사람이 연달아 보내면 이름을 반복하지 않는다
    const sameSender = prev && prev.authorId === item.authorId && !newDay;
    const name = members.find((x) => x.id === item.authorId)?.name || item.author || '알 수 없음';

    return (
      <View>
        {newDay && !!dayLabel(item.createdAt) && (
          <View style={{ alignItems: 'center', marginVertical: S.md }}>
            <View style={{
              backgroundColor: C.fill, borderRadius: R.pill,
              paddingHorizontal: 12, paddingVertical: 4,
            }}>
              <Text style={{ fontSize: 11, color: C.sub, fontWeight: '600' }}>{dayLabel(item.createdAt)}</Text>
            </View>
          </View>
        )}

        <View style={{
          flexDirection: 'row',
          justifyContent: mine ? 'flex-end' : 'flex-start',
          marginTop: sameSender ? 3 : 10,
          paddingHorizontal: S.lg,
        }}>
          {!mine && (
            <View style={{ width: 34, marginRight: 8 }}>
              {!sameSender && (
                <View style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: item.gender === 'F' ? C.femaleBg : C.maleBg,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontSize: 13, fontWeight: '800',
                    color: item.gender === 'F' ? C.female : C.male,
                  }}>
                    {name.slice(0, 1)}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={{ maxWidth: '74%' }}>
            {!mine && !sameSender && (
              <Text style={{ fontSize: 11.5, color: C.sub, marginBottom: 3, fontWeight: '600' }}>{name}</Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
              {mine && (
                <Text style={{ fontSize: 10, color: C.faint }}>{timeLabel(item.createdAt)}</Text>
              )}
              <Touchable onLongPress={() => longPress(item)}
                style={{
                  backgroundColor: mine ? C.green : C.surface,
                  borderRadius: 18,
                  borderTopRightRadius: mine && !sameSender ? 4 : 18,
                  borderTopLeftRadius: !mine && !sameSender ? 4 : 18,
                  paddingHorizontal: 14, paddingVertical: 9,
                  borderWidth: mine ? 0 : 1, borderColor: C.border,
                }}>
                <Text style={{ fontSize: 14.5, lineHeight: 20, color: mine ? '#fff' : C.text }}>
                  {item.body}
                </Text>
              </Touchable>
              {!mine && (
                <Text style={{ fontSize: 10, color: C.faint }}>{timeLabel(item.createdAt)}</Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>

      {/* 채널 — 코트장을 여러 곳 운영할 때만 보인다.
         한 곳이면 고를 것이 없으므로 전체 방 하나로 둔다. */}
      {venues.length > 1 && (
        <View style={{
          flexDirection: 'row', gap: 6, paddingHorizontal: S.lg, paddingVertical: 8,
          borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface,
        }}>
          <Chip tone={channel === '' ? 'green' : 'outline'} onPress={() => setChannel('')}>
            전체
          </Chip>
          {venues.map((v) => (
            <Chip
              key={v.id}
              tone={channel === v.id ? 'green' : 'outline'}
              onPress={() => setChannel(v.id)}
            >
              {v.name}
            </Chip>
          ))}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={render}
        contentContainerStyle={{ paddingVertical: S.md, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={(
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xxl }}>
            <Text style={{ fontSize: 34 }}>💬</Text>
            <Text style={[F.h3, { marginTop: S.md }]}>
              {venues.length > 1 ? `${channelName} 대화가 아직 없습니다` : '아직 대화가 없습니다'}
            </Text>
            <Text style={{ fontSize: 12.5, color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
              {/* 이 방이 누구에게 가는지 먼저 알려 준다.
                 코트장을 여러 곳 운영하면 "전체에 올릴 말인가"가 매번 헷갈린다. */}
              {venues.length > 1
                ? (channel
                  ? `${channelName}에서 운동하는 사람들에게 갑니다.`
                  : '클럽 회원 모두에게 갑니다.')
                : '첫 메시지를 남겨보세요.'}{'\n'}
              최근 300개까지 보관되고, 길게 눌러 삭제할 수 있습니다.
            </Text>
          </View>
        )}
      />

      <View style={{
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
        paddingHorizontal: S.md, paddingVertical: S.sm,
        backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
      }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="메시지 입력"
          placeholderTextColor={C.faint}
          multiline
          style={{
            flex: 1, maxHeight: 110, minHeight: HIT - 8,
            backgroundColor: C.fill, borderRadius: 22,
            paddingHorizontal: 16, paddingTop: isAndroid ? 10 : 12, paddingBottom: 10,
            fontSize: 15, color: C.text,
          }}
        />
        <Touchable onPress={send} disabled={!text.trim()}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: text.trim() ? C.green : C.fill,
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 17, color: text.trim() ? '#fff' : C.faint }}>↑</Text>
        </Touchable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default Chat;
