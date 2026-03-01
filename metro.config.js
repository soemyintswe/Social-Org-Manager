const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Work around packages importing "web-streams-polyfill/dist/ponyfill"
// without file extension; Metro warns because that exact file path does not exist.
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "web-streams-polyfill/dist/ponyfill": path.resolve(
    __dirname,
    "node_modules/web-streams-polyfill/dist/ponyfill.js"
  ),
};

module.exports = config;
