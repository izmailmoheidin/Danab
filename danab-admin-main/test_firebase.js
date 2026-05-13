const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Read .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');
let creds_b64 = '';

for (const line of envLines) {
  if (line.startsWith('FIREBASE_CREDENTIALS_B64=')) {
    creds_b64 = line.substring('FIREBASE_CREDENTIALS_B64='.length);
    break;
  }
}

if (!creds_b64) {
  console.error('❌ FIREBASE_CREDENTIALS_B64 not found in .env');
  process.exit(1);
}

console.log('✓ FIREBASE_CREDENTIALS_B64 found, length:', creds_b64.length);

try {
  const decoded = Buffer.from(creds_b64, 'base64').toString('utf8');
  const creds = JSON.parse(decoded);
  
  // Fix escaped newlines
  if (creds.private_key) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  
  console.log('✓ Credentials decoded and parsed');
  console.log('  Project ID:', creds.project_id);
  console.log('  Service Account:', creds.client_email);
  
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  const db = admin.firestore();
  console.log('✓ Firebase initialized');
  
  db.collection('system_users').limit(1).get().then(snap => {
    console.log('✓ Firestore query successful, docs:', snap.size);
    if (snap.size > 0) {
      console.log('✓ Database connection is working!');
    }
    process.exit(0);
  }).catch(err => {
    console.error('❌ Firestore query failed:', err.message);
    process.exit(1);
  });
} catch(e) {
  console.error('❌ Error:', e.message);
  process.exit(1);
}
