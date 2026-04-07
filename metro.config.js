const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

// Required for expo-sqlite web (WASM support)
config.resolver.assetExts.push("wasm");

module.exports = withRorkMetro(config);
