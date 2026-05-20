const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FILES = ['MealCardComposer.h', 'MealCardComposer.m'];

function withMealCardSources(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const iosDir = path.join(config.modRequest.projectRoot, 'ios', 'Marumimi');
      fs.mkdirSync(iosDir, { recursive: true });
      for (const file of FILES) {
        const src  = path.join(__dirname, 'native-sources', file);
        const dest = path.join(iosDir, file);
        fs.copyFileSync(src, dest);
      }
      return config;
    },
  ]);
}

function withMealCardXcode(config) {
  return withXcodeProject(config, (config) => {
    const proj   = config.modResults;
    const target = proj.getFirstTarget().uuid;
    const refs   = proj.pbxFileReferenceSection();
    const groups = proj.pbxGroupSection ? proj.pbxGroupSection() : {};

    // Find the main app PBX group
    let parentGroupKey;
    const existingFiles = Object.values(refs);
    const camRefKey = existingFiles.find(
      (r) => typeof r === 'object' && r.path && r.path.includes('AppDelegate')
    );

    if (camRefKey) {
      parentGroupKey = Object.keys(groups).find((key) => {
        const g = groups[key];
        return typeof g === 'object' && Array.isArray(g.children) &&
          g.children.some((c) => c.value === camRefKey);
      });
    }

    if (!parentGroupKey) {
      parentGroupKey = Object.keys(groups).find((key) => {
        const g = groups[key];
        return typeof g === 'object' &&
          (g.name === 'Marumimi' || g.name === '"Marumimi"');
      });
    }

    if (!parentGroupKey) {
      parentGroupKey = Object.keys(groups).find((key) => {
        const g = groups[key];
        return typeof g === 'object' &&
          (g.path === 'Marumimi' || g.path === '"Marumimi"');
      });
    }

    FILES.forEach((file) => {
      const fullPath = `Marumimi/${file}`;
      const alreadyAdded = Object.values(refs).some(
        (ref) => typeof ref === 'object' && ref.path &&
          (ref.path === fullPath || ref.path === `"${fullPath}"`)
      );
      if (alreadyAdded) return;
      if (!parentGroupKey) {
        console.warn(`[withMealCard] Could not resolve parent group — skipping ${file}`);
        return;
      }
      proj.addSourceFile(fullPath, { target }, parentGroupKey);
    });

    return config;
  });
}

module.exports = function withMealCard(config) {
  config = withMealCardSources(config);
  config = withMealCardXcode(config);
  return config;
};
