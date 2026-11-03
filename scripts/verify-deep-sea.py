"""Validate the delivered debug APKs and the shared offline globe, without a device."""
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
out = root / 'artifacts/deep-sea'
expected_certificate = 'ba4d593e592c3e2b1ff422663b6c7fb375177e2d626cf0a4001be70da461fc40'
source = root / 'packages/globe/dist'
files = {p.relative_to(source).as_posix(): p.read_bytes() for p in source.rglob('*') if p.is_file()}
script = re.search(r'src="(?:\./)?([^"]+\.js)"', files['index.html'].decode()).group(1)
digest = lambda raw: hashlib.sha256(raw).hexdigest()
resources = []
for target in ['apps/web/public/globe', 'apps/web/dist/globe', 'apps/android/app/src/main/assets/globe', 'apps/ios/Resources/globe']:
    matches = all((root / target / name).read_bytes() == raw for name, raw in files.items())
    assert matches, target
    resources.append({'path': target, 'matchesCurrentGlobe': matches, 'checkedFiles': len(files)})

apks = []
for kind, base in [('phone', 'http://192.168.1.102:8188/api/v1'), ('emulator', 'http://10.0.2.2:8188/api/v1')]:
    path = root / f'apps/android/releases/ourworld-deep-sea-{kind}-debug.apk'
    signature = (out / f'{kind}-signature.txt').read_text(encoding='utf-8-sig')
    certificate = re.search(r'certificate SHA-256 digest: (\w+)', signature).group(1)
    assert certificate == expected_certificate, kind
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, 'APK CRC validation'
        assert all(archive.read('assets/globe/' + name) == raw for name, raw in files.items()), kind
        dex = b''.join(archive.read(n) for n in archive.namelist() if re.fullmatch(r'classes\d*\.dex', n))
        assert base.encode() in dex, base
    apks.append({'file': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest(path.read_bytes()), 'apiBase': base, 'certificateSha256': certificate, 'matchesOriginalSigningCertificate': True, 'matchesCurrentGlobe': True, 'zipCrcPassed': True})

suites = []
for path in (root / 'apps/android/app/build/test-results/testDebugUnitTest').glob('TEST-*.xml'):
    suite = ET.parse(path).getroot()
    result = {k: int(suite.attrib[k]) for k in ['tests', 'failures', 'errors']}
    assert not result['failures'] and not result['errors'], suite.attrib['name']
    suites.append({'name': suite.attrib['name'], **result})
assert sum(s['tests'] for s in suites) == 19
report = {'at': datetime.now(timezone.utc).isoformat(), 'globeScript': script, 'globeSha256': digest(files[script]), 'resources': resources, 'apks': apks, 'androidUnitTests': suites, 'nativeDeviceRun': False, 'iosXcodeBuild': False}
(out / 'release-check.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
