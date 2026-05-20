#!/bin/bash
# Called from Xcode build phase immediately after expo-configure-project.sh.
# Injects MealCardComposerExpoModule into the freshly regenerated ExpoModulesProvider.swift.

PROVIDER="$1"

if [ ! -f "$PROVIDER" ]; then
  echo "[inject] ExpoModulesProvider.swift not found at: $PROVIDER" >&2
  exit 0
fi

if grep -q 'MealCardComposerExpoModule' "$PROVIDER"; then
  echo "[inject] MealCardComposerExpoModule already present, skipping"
  exit 0
fi

python3 - "$PROVIDER" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, 'r') as f:
    content = f.read()

content = content.replace(
    '      DevMenuPreferences.self\n    ]',
    '      DevMenuPreferences.self,\n      MealCardComposerExpoModule.self\n    ]'
)
content = content.replace(
    '      WebBrowserModule.self\n    ]',
    '      WebBrowserModule.self,\n      MealCardComposerExpoModule.self\n    ]'
)

with open(path, 'w') as f:
    f.write(content)
print('[inject] MealCardComposerExpoModule injected into ExpoModulesProvider.swift')
PYEOF
