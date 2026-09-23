/* ============================================================
   앱 안 유튜브 재생 — WebView 에 유튜브 IFrame API 를 직접 띄운다

   왜 패키지(react-native-youtube-iframe)를 안 쓰나
     그것도 결국 WebView 위에서 이 일을 한다. 새 패키지를 넣으면 잠금
     파일이 바뀌고 빌드 설정을 다시 봐야 한다. WebView 는 코트 지도에서
     이미 쓰고 있어 설치된 앱 안에 들어 있다 — 업데이트만으로 켜진다.

   왜 baseUrl 을 주나
     출처(origin)가 없으면 유튜브가 재생 오류를 내는 경우가 있다.
     약관·참석 링크와 같은 우리 웹 주소를 출처로 둔다.

   ⚠️ 삽입이 막힌 영상(오류 101/150), 지워진 영상, 네트워크 오류는
      플레이어 자리에 안내와 [유튜브에서 보기]를 띄운다. 멋대로 앱 밖으로
      내보내지 않는다 — 사용자가 고르게 한다.
   ============================================================ */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, Pressable, Linking, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { firebaseConfig } from '../../../firebaseConfig';
import { C } from '../../lib/theme';

const BASE = `https://${firebaseConfig.projectId}.web.app/`;
const READY_TIMEOUT = 15000;

/* videoId 는 [A-Za-z0-9_-]{11} 로 검사한 값만 온다(onepoint.js) — 그대로 넣어도 안전하다 */
const html = (id, start) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}#p{position:absolute;top:0;left:0;width:100%;height:100%}</style>
</head><body><div id="p"></div>
<script>
function send(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o))}catch(e){}}
var player;
function onYouTubeIframeAPIReady(){
  player=new YT.Player('p',{width:'100%',height:'100%',videoId:'${id}',
    playerVars:{playsinline:1,rel:0,modestbranding:1,start:${start | 0}},
    events:{
      onReady:function(){send({t:'ready'})},
      onStateChange:function(e){if(e.data===0)send({t:'ended'})},
      onError:function(e){send({t:'error',code:e.data})}
    }});
}
window.__seek=function(s){if(player&&player.seekTo){player.seekTo(s,true);if(player.playVideo)player.playVideo();}};
</script>
<script src="https://www.youtube.com/iframe_api" onerror="send({t:'error',code:'net'})"></script>
</body></html>`;

/**
 * @param videoId  유튜브 영상 아이디(11자)
 * @param start    시작 위치(초)
 * @param url      원래 주소 — 오류 때 [유튜브에서 보기]
 * @param onEnded  끝까지 봤을 때
 * @param maxWidth 이보다 넓게 그리지 않는다
 * ref.seekTo(초)  그 위치로 옮겨 재생
 */
export const YouTubePlayer = forwardRef(function YouTubePlayer({ videoId, start = 0, url, onEnded, maxWidth = 900 }, ref) {
  /* 태블릿 가로에서 화면 폭 그대로 16:9 를 잡으면 화면보다 높아진다 */
  const width = Math.min(useWindowDimensions().width, maxWidth);
  const web = useRef(null);
  const [failed, setFailed] = useState(!videoId);
  const ready = useRef(false);

  useImperativeHandle(ref, () => ({
    seekTo(s) { web.current?.injectJavaScript(`window.__seek&&window.__seek(${Number(s) | 0});true;`); },
  }), []);

  /* 유튜브 스크립트를 끝내 못 받으면(인터넷 끊김) 검은 칸만 남는다 — 시간이 지나면 안내로 바꾼다 */
  useEffect(() => {
    ready.current = false;
    setFailed(!videoId);
    const t = setTimeout(() => { if (!ready.current) setFailed(true); }, READY_TIMEOUT);
    return () => clearTimeout(t);
  }, [videoId]);

  const h = Math.round((width * 9) / 16);
  const openOutside = () => { if (url) Linking.openURL(url).catch(() => {}); };

  if (failed) {
    return (
      <View style={{ width, height: h, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>이 영상은 앱 안에서 재생할 수 없어요</Text>
        {!!url && (
          <Pressable onPress={openOutside} accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 16, minHeight: 52, paddingHorizontal: 24, borderRadius: 12,
              backgroundColor: C.green, justifyContent: 'center', opacity: pressed ? 0.85 : 1,
            })}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>유튜브에서 보기 ↗</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ width, height: h, backgroundColor: '#000' }}>
      <WebView
        ref={web}
        source={{ html: html(videoId, start), baseUrl: BASE }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        style={{ backgroundColor: '#000' }}
        onMessage={(e) => {
          let m = null;
          try { m = JSON.parse(e.nativeEvent.data); } catch (err) { return; }
          if (m.t === 'ready') ready.current = true;
          else if (m.t === 'ended') onEnded?.();
          else if (m.t === 'error') setFailed(true);
        }}
        onError={() => setFailed(true)}
        /* 플레이어가 스스로 다른 페이지로 가려 하면 **막기만 한다**.
           예전엔 그 주소를 유튜브 앱으로 넘겼는데, 보다가 뒤로가기를 누르면
           유튜브 앱이 튀어나왔다(앱 주인이 겪음). 유튜브 플레이어는 로고·
           제목·끝 화면 등에서 youtube.com 이나 intent:// 로 가려 하고, 그 순간이
           뒤로가기와 겹치면 앱 밖으로 나가 버린다.
           앱 밖으로 나가는 길은 사용자가 직접 누르는 [↗ 유튜브] 하나뿐이다. */
        onShouldStartLoadWithRequest={(req) => {
          const u = req.url || '';
          if (req.isTopFrame === false) return true;
          if (u.startsWith(BASE) || u.startsWith('about:') || u.startsWith('data:')) return true;
          if (/^https:\/\/(www\.)?youtube\.com\/(embed|iframe_api|s\/)/.test(u)) return true;
          return false;
        }}
        onOpenWindow={() => {}}
      />
    </View>
  );
});

export default YouTubePlayer;
