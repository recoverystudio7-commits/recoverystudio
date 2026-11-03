/**
 * Desactiva el authenticator (TOTP) del administrador.
 * Uso: detén el servidor, ejecuta `npm run reset-totp` y vuelve a iniciarlo.
 * La próxima vez que ingreses se pedirá configurar un authenticator nuevo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(dbFile)) {
  console.error(`No se encontró la base de datos: ${dbFile}`);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const admin = (db.users || []).find((u) => u.role === 'admin');

if (!admin) {
  console.error('No se encontró un usuario administrador en la base de datos.');
  process.exit(1);
}

admin.totpEnabled = false;
admin.totpSecret = '';
admin.tokenVersion = (admin.tokenVersion || 0) + 1;
admin.updatedAt = new Date().toISOString();

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');

console.log(`Authenticator desactivado para ${admin.email}.`);
console.log('Reinicia el servidor e ingresa con tu contraseña para configurarlo de nuevo.');
