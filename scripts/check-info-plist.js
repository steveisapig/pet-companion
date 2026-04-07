/**
 * Logs URL scheme diagnostics in generated iOS Info.plist.
 * Run after prebuild to verify Google Sign-In entries are present.
 */
const fs = require('fs');
const path = require('path');

const possiblePaths = [
  path.join(__dirname, '../ios/VirtualPet/Info.plist'),
  path.join(__dirname, '../ios/VirtualPetLife/Info.plist'),
];

for (const plistPath of possiblePaths) {
  if (fs.existsSync(plistPath)) {
    const content = fs.readFileSync(plistPath, 'utf8');
    const schemes =
      content.match(/<string>com\.googleusercontent\.apps\.[^<]+<\/string>/g) ||
      [];
    const hasUrlName = content.includes('<key>CFBundleURLName</key>');
    const hasTypeRole = content.includes('<key>CFBundleTypeRole</key>');
    const allSchemes =
      content.match(/<key>CFBundleURLSchemes<\/key>\s*<array>[\s\S]*?<\/array>/g) || [];
    console.log(
      '[check-info-plist] URL schemes in',
      path.relative(process.cwd(), plistPath) + ':',
      schemes.map((s) => s.replace(/<\/?string>/g, ''))
    );
    console.log('[check-info-plist] Has CFBundleURLName:', hasUrlName);
    console.log('[check-info-plist] Has CFBundleTypeRole:', hasTypeRole);
    console.log('[check-info-plist] URL scheme blocks found:', allSchemes.length);
    return;
  }
}

console.log('[check-info-plist] No Info.plist found at expected paths');
