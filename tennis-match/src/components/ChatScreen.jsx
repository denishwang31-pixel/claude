/* ============================================================
   클럽 채팅 — 공지·게시판보다 가벼운 실시간 대화

   최근 200개만 구독한다. 오래된 클럽일수록 전체를 받으면 앱이 무거워지고
   읽기 비용도 그만큼 나가기 때문이다. 그 위쪽 기록은 게시판에 남긴다.

   말풍선은 플랫폼 관례를 따른다 — 내 메시지는 오른쪽 채움, 상대는 왼쪽 회색.
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { subMessages, sendMessage, deleteMessage } from '../lib/firestore';
import { Touchable, isAndroid, HIT } from './native';
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

export function Chat({ clubId, me, meVal, members, isAdmin, flash }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!clubId) return undefined;
    const unsub = subMessages(clubId, setMessages);
    return () => unsub && unsub();
  }, [clubId]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    sendMessage(clubId, { body, authorId: me, author: meVal?.name || '', gender: meVal?.gender || '' });
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
            <Text style={[F.h3, { marginTop: S.md }]}>아직 대화가 없습니다</Text>
            <Text style={{ fontSize: 12.5, color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
              첫 메시지를 남겨보세요.{'\n'}
              최근 200개까지 보관되고, 길게 눌러 삭제할 수 있습니다.
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
