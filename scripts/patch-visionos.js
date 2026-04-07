#!/usr/bin/env node
/**
 * Patches podspecs that use visionos (requires CocoaPods 1.13+).
 * Run after npm install for environments with older CocoaPods.
 */
const fs = require('fs');
const path = require('path');

const podspecPath = path.join(
  __dirname,
  '../node_modules/react-native-svg/RNSVG.podspec'
);

if (!fs.existsSync(podspecPath)) {
  process.exit(0);
}

let content = fs.readFileSync(podspecPath, 'utf8');

// Remove visionos from platforms hash (avoids CocoaPods < 1.13 error)
if (content.includes(':visionos => "1.0"')) {
  content = content.replace(
    's.platforms         = { :osx => "10.14", :ios => "12.4", :tvos => "12.4", :visionos => "1.0" }',
    's.platforms         = { :osx => "10.14", :ios => "12.4", :tvos => "12.4" }'
  );
}

// Make visionos.resource_bundles conditional (avoids CocoaPods < 1.13 error)
const resourceBundles = "s.visionos.resource_bundles  = {'RNSVGFilters' => ['apple/**/*.xros.metallib']}";
const resourceBundlesPatched = resourceBundles + ' if s.respond_to?(:visionos)';
if (content.includes(resourceBundles) && !content.includes(resourceBundlesPatched)) {
  content = content.replace(resourceBundles, resourceBundlesPatched);
}

fs.writeFileSync(podspecPath, content);
