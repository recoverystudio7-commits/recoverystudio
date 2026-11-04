/**
 * Define la contraseña del administrador y cierra sus sesiones abiertas.
 *
 * Uso:
 *   npm run set-admin-password                 (genera una clave fuerte y la muestra)
 *   npm run set-admin-password -- --password "MiClaveLargaDe16+"
 *   npm run set-admin-password -- --email otro@correo.cl --reset-totp
 *
 * Funciona con la base local (data/db.json) y con Redis (Vercel),
 * detectando las variables KV_REST_API_URL / KV_REST_API_TOKEN.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { remoteEnabled, readRemoteDb, writeRemoteDb, acquireLock } from '../lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'db.json');

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}

const hasFlag = (name) => args.includes(`--${name}`);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(24);
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  // Garantiza mayúscula, minúscula, número y símbolo.
  return `${out.slice(0, 20)}#7Kq`;
}

function checkStrength(password) {
  if (password.length < 16) return 'La clave debe tener al menos 16 caracteres.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La clave debe mezclar minúsculas, mayúsculas y números.';
  }
  return '';
}

async function main() {
  const email = String(arg('email', process.env.ADMIN_EMAIL || '')).toLowerCase();
  let password = arg('password', process.env.ADMIN_PASSWORD || '');
  const generated = !password;
  if (generated) password = generatePassword();

  const problem = checkStrength(password);
  if (problem) {
    console.error(`✖ ${problem}`);
    process.exit(1);
  }

  let db;
  let release = null;

  if (remoteEnabled) {
    release = await acquireLock();
    db = await readRemoteDb();
    if (!db) {
      console.error('No se encontró la base de datos en Redis.');
      process.exit(1);
    }
  } else {
    if (!fs.existsSync(dbFile)) {
      console.error(`No se encontró la base de datos: ${dbFile}`);
      process.exit(1);
    }
    db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  }

  const admins = (db.users || []).filter((u) => u.role === 'admin');
  const admin = email
    ? admins.find((u) => String(u.email).toLowerCase() === email)
    : admins[0];

  if (!admin) {
    if (release) await release();
    console.error(email ? `No existe un administrador con el correo ${email}.` : 'No se encontró un usuario administrador.');
    process.exit(1);
  }

  const { salt, hash } = hashPassword(password);
  admin.salt = salt;
  admin.hash = hash;
  admin.passHash = hash;
  admin.passwordUpdatedAt = new Date().toISOString();
  admin.updatedAt = admin.passwordUpdatedAt;
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  if (hasFlag('reset-totp')) {
    admin.totpEnabled = false;
    admin.totpSecret = '';
  }

  if (remoteEnabled) {
    await writeRemoteDb(db);
    if (release) await release();
  } else {
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
  }

  console.log('');
  console.log(`✔ Contraseña actualizada para ${admin.email}`);
  console.log(`  Almacenamiento: ${remoteEnabled ? 'Redis (Vercel)' : dbFile}`);
  console.log(`  Sesiones anteriores cerradas: tokenVersion = ${admin.tokenVersion}`);
  if (hasFlag('reset-totp')) console.log('  Authenticator (TOTP) desactivado: se pedirá configurarlo al ingresar.');
  if (generated) {
    console.log('');
    console.log('  CLAVE NUEVA (guárdala en un lugar seguro):');
    console.log(`  ${password}`);
  }
  console.log('');
}

main().catch(async (err) => {
  console.error('✖ Error:', err.message);
  process.exit(1);
});
