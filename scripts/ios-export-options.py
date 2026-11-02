import json
import os
import plistlib
import shutil
from pathlib import Path

temporary = Path(os.environ['RUNNER_TEMP'])
with (temporary / 'profile.plist').open('rb') as stream:
    profile = plistlib.load(stream)
config = json.loads(Path('capacitor.config.json').read_text())
team = os.environ['APPLE_TEAM_ID']
bundle = config['appId']
if profile['Entitlements']['application-identifier'] != f'{team}.{bundle}':
    raise SystemExit('Provisioning profile must match APPLE_TEAM_ID and capacitor.config.json appId.')
method = os.environ['EXPORT_METHOD']
if method not in ('app-store-connect', 'release-testing'):
    raise SystemExit('Unsupported distribution method.')
if method == 'release-testing' and not profile.get('ProvisionedDevices'):
    raise SystemExit('Release testing requires a profile containing registered devices.')
destination = Path.home() / 'Library/MobileDevice/Provisioning Profiles'
destination.mkdir(parents=True, exist_ok=True)
shutil.copyfile(temporary / 'omnichat.mobileprovision', destination / f"{profile['UUID']}.mobileprovision")
with (temporary / 'ExportOptions.plist').open('wb') as stream:
    plistlib.dump({
        'method': method,
        'teamID': team,
        'signingStyle': 'manual',
        'signingCertificate': 'Apple Distribution',
        'provisioningProfiles': {bundle: profile['UUID']},
        'uploadSymbols': True,
    }, stream)
