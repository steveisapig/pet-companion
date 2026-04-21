/**
 * Expo config plugin: force C++17 for the `fmt` pod only.
 *
 * The standalone fmt CocoaPod uses FMT_STRING macros that are not valid
 * consteval expressions under C++20. Skia, React Native, and all other pods
 * must remain on their default standard (C++20).
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const SNIPPET = `
  # ── fmt C++17 fix ─────────────────────────────────────────────────────
  # FMT_STRING consteval breaks under C++20; fmt only needs C++17.
  # All other pods (Skia, RN core) must stay on their default standard.
  installer.pods_project.targets.each do |target|
    next unless target.name == 'fmt'
    target.build_configurations.each do |cfg|
      cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
    end
  end
  # ──────────────────────────────────────────────────────────────────────`;

module.exports = function withCxx17(config) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const podfilePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'Podfile'
      );

      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes('fmt C++17 fix')) {
        return modConfig;
      }

      contents = contents.replace(
        /(post_install do \|installer\|[\s\S]*?)(^  end)/m,
        (_, body, closing) => `${body}${SNIPPET}\n${closing}`
      );

      fs.writeFileSync(podfilePath, contents);
      return modConfig;
    },
  ]);
};
