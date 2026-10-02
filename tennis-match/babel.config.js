module.exports = function (api) {
  api.cache(true);
  return {
    /* Expo SDK 54 의 babel-preset-expo 가 reanimated 4 용 worklets 플러그인을 알아서 붙인다.
       예전처럼 'react-native-reanimated/plugin' 을 직접 적으면 두 번 붙는다. */
    presets: ['babel-preset-expo'],
  };
};
