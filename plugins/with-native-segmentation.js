const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FILES = [
  'NativeSegmentationModule.swift',
  'NativeSegmentationModule.m',
];

// Write source files to ios/Marumimi/ during expo prebuild so EAS Build can find them.
function withNativeSegmentationSources(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const iosDir = path.join(config.modRequest.projectRoot, 'ios', 'Marumimi');
      fs.mkdirSync(iosDir, { recursive: true });

      for (const file of FILES) {
        const src = path.join(__dirname, 'native-sources', file);
        const dest = path.join(iosDir, file);
        fs.copyFileSync(src, dest);
      }

      return config;
    },
  ]);
}

// Register the source files in the Xcode project (.pbxproj).
function withNativeSegmentationXcode(config) {
  return withXcodeProject(config, (config) => {
    const proj = config.modResults;
    const target = proj.getFirstTarget().uuid;

    const refs = proj.pbxFileReferenceSection();
    const groups = proj.hash.project.objects['PBXGroup'];

    // Primary: find the group containing NativeCameraModule.swift
    const camRefKey = Object.keys(refs).find(
      (key) => typeof refs[key] === 'object' &&
        (refs[key].path === 'Marumimi/NativeCameraModule.swift' ||
         refs[key].path === '"Marumimi/NativeCameraModule.swift"')
    );
    let parentGroupKey = camRefKey
      ? Object.keys(groups).find((key) => {
          const g = groups[key];
          return typeof g === 'object' && Array.isArray(g.children) &&
            g.children.some((c) => c.value === camRefKey);
        })
      : undefined;

    // Fallback 1: find a PBXGroup named "Marumimi"
    if (!parentGroupKey) {
      parentGroupKey = Object.keys(groups).find((key) => {
        const g = groups[key];
        return typeof g === 'object' &&
          (g.name === 'Marumimi' || g.name === '"Marumimi"');
      });
    }

    // Fallback 2: find a PBXGroup whose path is "Marumimi"
    if (!parentGroupKey) {
      parentGroupKey = Object.keys(groups).find((key) => {
        const g = groups[key];
        return typeof g === 'object' &&
          (g.path === 'Marumimi' || g.path === '"Marumimi"');
      });
    }

    FILES.forEach((file) => {
      const fullPath = `Marumimi/${file}`;

      // Idempotent: skip if already registered
      const alreadyAdded = Object.values(refs).some(
        (ref) => typeof ref === 'object' && ref.path &&
          (ref.path === fullPath || ref.path === `"${fullPath}"`)
      );
      if (alreadyAdded) return;

      if (!parentGroupKey) {
        console.warn(`[withNativeSegmentation] Could not resolve parent group — skipping ${file}`);
        return;
      }
      proj.addSourceFile(fullPath, { target }, parentGroupKey);
    });

    return config;
  });
}

module.exports = function withNativeSegmentation(config) {
  config = withNativeSegmentationSources(config);
  config = withNativeSegmentationXcode(config);
  return config;
};
