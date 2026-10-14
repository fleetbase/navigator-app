import fs from 'fs';
import path from 'path';

test('Android manifest does not request broad photo or video library access', () => {
    const manifest = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');

    expect(manifest).not.toContain('android.permission.READ_MEDIA_IMAGES');
    expect(manifest).not.toContain('android.permission.READ_MEDIA_VIDEO');
    expect(manifest).toMatch(/android\.permission\.READ_EXTERNAL_STORAGE" tools:node="remove"/);
    expect(manifest).toMatch(/android\.permission\.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/);
});
