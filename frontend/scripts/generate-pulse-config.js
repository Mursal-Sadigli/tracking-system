const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .forEach((line) => {
            const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (!m || process.env[m[1]] != null) return;
            let val = m[2].trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[m[1]] = val;
        });
}

const apiUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const galleryEnabled = process.env.REACT_APP_SUBJECT_GALLERY_PAYLOAD === 'true';
const galleryDownloadEnabled = process.env.REACT_APP_SUBJECT_IMAGE_DOWNLOAD !== 'false';

const out = `window.PULSE_CONFIG=${JSON.stringify({ apiUrl, galleryEnabled, galleryDownloadEnabled })};\n`;
const dest = path.join(__dirname, '..', 'public', 'pulse-config.js');
fs.writeFileSync(dest, out, 'utf8');
console.log('pulse-config.js ->', dest, apiUrl || '(same-origin)');
