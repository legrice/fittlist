#!/usr/bin/env python3
"""Exercise the release gate with unsafe packaging configurations."""
import copy
import importlib.util
import json
import plistlib
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('gate', root / 'scripts/check-ios-release.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
base = json.loads((root / 'ios/App/App/capacitor.config.json').read_text())
info = plistlib.loads((root / 'ios/App/App/Info.plist').read_bytes())
privacy = plistlib.loads((root / 'ios/App/App/PrivacyInfo.xcprivacy').read_bytes())
assert not gate.validate(base, info, privacy, {})
for name, edit in [
    ('preview', lambda c: c['server'].update(url='https://preview.example.test')),
    ('credential query', lambda c: c['server'].update(url='https://www.fittlist.co?access=example')),
    ('wildcard', lambda c: c['server'].update(allowNavigation=['*.example.test'])),
    ('cleartext', lambda c: c['server'].update(cleartext=True)),
    ('missing recovery', lambda c: c['server'].pop('errorPath')),
    ('debugging', lambda c: c['ios'].update(webContentsDebuggingEnabled=True)),
    ('logging', lambda c: c.update(loggingBehavior='debug')),
]:
    config = copy.deepcopy(base)
    edit(config)
    assert gate.validate(config, info, privacy, {}), name
assert gate.validate(base, info, privacy, {'TARGETED_DEVICE_FAMILY': '1,2'})
assert gate.validate(base, info, privacy, {'CAPACITOR_DEBUG': 'true'})
assert gate.validate(base, info, {}, {})
print('Native release gate: 10 unsafe configurations rejected')
