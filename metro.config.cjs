const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Explicitly match and transpile the problem packages
config.transformer.unstable_transformModules = [
  '@nozbe/watermelondb',
  '@nozbe/with-observables',
  '@nozbe/simdjson',
  'react-native-signature-canvas'
];

module.exports = config;