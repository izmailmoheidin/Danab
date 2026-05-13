const fs = require('fs');
const admin = require('firebase-admin');
const b64 = fs.readFileSync('.env','utf8').split(/\n/).find(l=>l.startsWith('FIREBASE_CREDENTIALS_B64='));
if(!b64){console.error('no var'); process.exit(1)}
const encoded=b64.split('=')[1];
const decoded=Buffer.from(encoded,'base64').toString('utf8');
console.log('decoded length', decoded.length);
let parsed;
try{
  parsed=JSON.parse(decoded);
  console.log('parsed ok');
}catch(e){
  console.error('json parse failed', e.message);
  process.exit(1);
}
console.log('private_key contains \\n?', parsed.private_key && parsed.private_key.indexOf('\\n')>=0);
// fix
if(parsed.private_key) parsed.private_key=parsed.private_key.replace(/\\n/g,'\n');
try{
  admin.initializeApp({credential: admin.credential.cert(parsed)});
  const db=admin.firestore();
  db.collection('system_users').limit(1).get().then(snap=>{console.log('ok docs', snap.size); process.exit(0)}).catch(e=>{console.error('query err', e.message); process.exit(1)});
}catch(e){console.error('init err', e.message); process.exit(1)}
