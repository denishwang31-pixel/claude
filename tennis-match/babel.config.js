module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated/react-native-draggable-flatlist 용 (반드시 마지막)
    plugins: ['react-native-reanimated/plugin'],
  };
};
