const path = require('path');

// Load `.env` before reading `IS_DEV` (EAS Build also injects env via `eas.json` / secrets).
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const appJson = require('./app.json');

/**
 * Dev bundle id + `extra.IS_DEV` for runtime.
 *
 * Controlled only by the `IS_DEV` environment variable (set in `.env` locally, or in
 * `eas.json` → `build.<profile>.env` for EAS Build — submit has no `env` block).
 * Not derived from `app.json` or `NODE_ENV`.
 *
 * Truthy: `1`, `true`, `yes`, `on` (case-insensitive). Otherwise false (including unset).
 */
function parseEnvBool(value) {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(s);
}

const IS_DEV = parseEnvBool(process.env.IS_DEV);

const IOS_BUNDLE_ID = IS_DEV
  ? 'com.tradingbrothers.virtual-pet-life.dev'
  : appJson.expo.ios.bundleIdentifier;
const ANDROID_PACKAGE = IS_DEV
  ? 'com.tradingbrothers.virtual_pet.dev'
  : appJson.expo.android.package;

// Visible in EAS build logs ("Read app config") — verify production builds are not using .dev
console.log(
  `[app.config] ios.bundleIdentifier=${IOS_BUNDLE_ID} IS_DEV=${IS_DEV} IS_DEV_env=${process.env.IS_DEV ?? '(unset)'} NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}`
);

function deriveSchemeFromClientId(clientId) {
  if (!clientId || !clientId.endsWith('.apps.googleusercontent.com')) return null;
  return `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;
}

const googleSignInPlugin = appJson.expo.plugins.find(
  (p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin'
);
const appJsonScheme = googleSignInPlugin?.[1]?.iosUrlScheme;

const envIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const derivedFromClientId = deriveSchemeFromClientId(envIosClientId);
const iosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
  derivedFromClientId ||
  (appJsonScheme &&
  appJsonScheme !== 'com.googleusercontent.apps.PLACEHOLDER_REPLACE_WITH_IOS_CLIENT_ID'
    ? appJsonScheme
    : 'com.googleusercontent.apps.PLACEHOLDER_REPLACE_WITH_IOS_CLIENT_ID');

const plugins = appJson.expo.plugins.map((p) => {
  if (Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin') {
    return ['@react-native-google-signin/google-signin', { iosUrlScheme }];
  }
  return p;
});

const existingUrlTypes = appJson.expo.ios?.infoPlist?.CFBundleURLTypes || [];
const filteredTypes = existingUrlTypes.filter((entry) => {
  const schemes = entry?.CFBundleURLSchemes || [];
  return !schemes.includes(iosUrlScheme);
});

const googleUrlType = {
  CFBundleURLSchemes: [iosUrlScheme],
  CFBundleURLName: IOS_BUNDLE_ID || appJson.expo.slug,
  CFBundleTypeRole: 'Editor',
};

const infoPlist = {
  ...(appJson.expo.ios?.infoPlist || {}),
  CFBundleURLTypes: [googleUrlType, ...filteredTypes],
  // Ensure network requests work in iOS Simulator (fetch can fail otherwise)
  NSAppTransportSecurity: {
    NSAllowsArbitraryLoads: true,
    NSAllowsLocalNetworking: true,
  },
};

module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: IOS_BUNDLE_ID,
      infoPlist,
    },
    android: {
      ...appJson.expo.android,
      package: ANDROID_PACKAGE,
    },
    plugins,
    extra: {
      ...appJson.expo.extra,
      IS_DEV,
    },
  },
};
