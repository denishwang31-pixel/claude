/* 광고 배너 — 등록된 용품 광고를 순환 노출. 누르면 판매 링크로 이동.
   이미지는 URL 방식(별도 스토리지 불필요). 이미지가 없으면 텍스트 배너로 표시. */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, Linking } from 'react-native';
import { C } from '../lib/theme';

export function AdBanner({ ads, interval = 5000, compact = false }) {
  const list = (ads || []).filter((a) => a.active !== false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (list.length < 2) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), interval);
    return () => clearInterval(t);
  }, [list.length, interval]);

  if (!list.length) return null;
  const ad = list[i % list.length];

  const open = () => { if (ad.link) Linking.openURL(ad.link).catch(() => {}); };

  return (
    <Pressable onPress={open}
      style={{
        borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff',
        borderWidth: 1, borderColor: C.border, marginTop: 12,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {ad.image ? (
          <Image source={{ uri: ad.image }} style={{ width: compact ? 64 : 84, height: compact ? 64 : 84 }} resizeMode="cover" />
        ) : (
          <View style={{ width: compact ? 64 : 84, height: compact ? 64 : 84, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24 }}>🎾</Text>
          </View>
        )}
        <View style={{ flex: 1, padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: '#f5f5f4', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, color: C.faint, fontWeight: '700' }}>AD</Text>
            </View>
            {!!ad.category && <Text style={{ fontSize: 10, color: C.green2, fontWeight: '700' }}>{ad.category}</Text>}
          </View>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', marginTop: 3 }}>{ad.title}</Text>
          {!!ad.desc && <Text numberOfLines={1} style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{ad.desc}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            {!!ad.price && <Text style={{ fontSize: 12, fontWeight: '900', color: C.green }}>{Number(ad.price).toLocaleString()}원</Text>}
            {!!ad.link && <Text style={{ fontSize: 11, color: C.green2, fontWeight: '700' }}>보러가기 →</Text>}
          </View>
        </View>
      </View>

      {list.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, paddingBottom: 6 }}>
          {list.map((_, idx) => (
            <View key={idx} style={{
              width: idx === i % list.length ? 12 : 5, height: 5, borderRadius: 3,
              backgroundColor: idx === i % list.length ? C.green : '#e7e5e4',
            }} />
          ))}
        </View>
      )}
    </Pressable>
  );
}
