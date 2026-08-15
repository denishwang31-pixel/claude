/* 광고 배너 — 등록된 용품을 순환 노출. 누르면 판매처로 이동.

   옐로우홀처럼 목록 위에 얇게 얹히는 형태(strip)와, 카드형(card) 두 가지를 쓴다.
   이동 링크는 src/lib/ads.js 가 만든다 — 나중에 제휴 코드를 붙일 때
   이 파일은 손대지 않아도 된다. */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { adsForSlot, openAd, logImpression, sellerName, AD_SLOTS } from '../lib/ads';
import { C, R, SHADOW } from '../lib/theme';

export function AdBanner({ ads, slot = AD_SLOTS.HOME, interval = 5000, variant = 'card', style }) {
  const list = adsForSlot(ads, slot);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (list.length < 2) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), interval);
    return () => clearInterval(t);
  }, [list.length, interval]);

  const ad = list.length ? list[i % list.length] : null;

  useEffect(() => { if (ad?.id) logImpression(ad.id); }, [ad?.id]);

  if (!ad) return null;
  const press = () => openAd(ad, slot);
  const seller = sellerName(ad.link);

  /* 얇은 띠 — 목록 맨 위에 얹는 형태 */
  if (variant === 'strip') {
    return (
      <Pressable onPress={press}
        style={({ pressed }) => ([{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: C.infoBg, borderRadius: R.md, overflow: 'hidden',
          opacity: pressed ? 0.85 : 1,
        }, style])}>
        {ad.image ? (
          <Image source={{ uri: ad.image }} style={{ width: 56, height: 56 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 56, height: 56, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>🎾</Text>
          </View>
        )}
        <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{ad.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {!!ad.price && (
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.info }}>
                {Number(ad.price).toLocaleString()}원
              </Text>
            )}
            {!!seller && <Text style={{ fontSize: 10, color: C.sub }}>{seller}</Text>}
          </View>
        </View>
        <Text style={{ fontSize: 9, color: C.faint, paddingRight: 10 }}>AD</Text>
      </Pressable>
    );
  }

  /* 카드형 — 홈 등에서 쓰는 기본 */
  return (
    <Pressable onPress={press}
      style={({ pressed }) => ([{
        borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.surface,
        marginTop: 12, opacity: pressed ? 0.9 : 1,
      }, SHADOW.sm, style])}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {ad.image ? (
          <Image source={{ uri: ad.image }} style={{ width: 88, height: 88 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 88, height: 88, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 26 }}>🎾</Text>
          </View>
        )}
        <View style={{ flex: 1, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: C.fill, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, color: C.faint, fontWeight: '800' }}>AD</Text>
            </View>
            {!!ad.category && <Text style={{ fontSize: 10, color: C.green2, fontWeight: '700' }}>{ad.category}</Text>}
          </View>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', marginTop: 4, color: C.text }}>{ad.title}</Text>
          {!!ad.desc && <Text numberOfLines={1} style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{ad.desc}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            {!!ad.price && (
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.green }}>
                {Number(ad.price).toLocaleString()}원
              </Text>
            )}
            {!!ad.link && (
              <Text style={{ fontSize: 11, color: C.green2, fontWeight: '700' }}>
                {seller ? `${seller}에서 보기 →` : '보러가기 →'}
              </Text>
            )}
          </View>
        </View>
      </View>

      {list.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, paddingBottom: 8 }}>
          {list.map((_, idx) => (
            <View key={idx} style={{
              width: idx === i % list.length ? 14 : 5, height: 5, borderRadius: 3,
              backgroundColor: idx === i % list.length ? C.green : C.border,
            }} />
          ))}
        </View>
      )}
    </Pressable>
  );
}
