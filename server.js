const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = __dirname;
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'caredesk.sqlite'));
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS doctors (id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, email TEXT, phone TEXT, ownerId TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, dob TEXT, notes TEXT, ownerId TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, doctorId TEXT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT, date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT, ownerId TEXT REFERENCES users(id));
CREATE INDEX IF NOT EXISTS appointment_schedule ON appointments(date, time, doctorId);`);
const id = () => crypto.randomUUID();
const adminEmail = process.env.ADMIN_EMAIL || 'admin@caredesk.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
const passwordHash = password => { const salt=crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.pbkdf2Sync(password,salt,150000,32,'sha256').toString('hex')}`; };
const verifyPassword = (password, saved) => { const [salt,hash]=saved.split(':'); if(!salt||!hash)return false; const candidate=crypto.pbkdf2Sync(password,salt,150000,32,'sha256'); return crypto.timingSafeEqual(candidate,Buffer.from(hash,'hex')); };
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id(),adminEmail,passwordHash(adminPassword),'admin');
// Existing single-account databases are assigned to their original administrator.
const originalOwner=db.prepare('SELECT id FROM users WHERE role=? ORDER BY rowid LIMIT 1').get('admin')?.id;
for(const table of ['doctors','patients','appointments']){
  if(!db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name==='ownerId'))db.exec(`ALTER TABLE ${table} ADD COLUMN ownerId TEXT REFERENCES users(id)`);
  db.prepare(`UPDATE ${table} SET ownerId=? WHERE ownerId IS NULL`).run(originalOwner);
  db.exec(`CREATE INDEX IF NOT EXISTS ${table}_owner ON ${table}(ownerId)`);
}

const json = (res,status,value) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
const error = (res,status,message) => json(res,status,{error:message});
const readBody = async req => {let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw new Error('Request is too large.')}try{return JSON.parse(text||'{}')}catch{throw new Error('Invalid JSON.')}};
const clean = value => String(value??'').trim();
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const tables = {doctors:['name','specialty','email','phone'],patients:['name','email','phone','dob','notes'],appointments:['patientId','doctorId','date','time','duration','status','reason']};
const list = (type,ownerId) => db.prepare(`SELECT * FROM ${type} WHERE ownerId=?`).all(ownerId);
function validate(type,input,ownerId,recordId){
  if(type==='doctors'||type==='patients'){
    const item=Object.fromEntries(tables[type].map(key=>[key,clean(input[key])]));
    if(!item.name||item.name.length>100)return {error:'Name is required and must be under 100 characters.'};
    if(item.email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)||item.email.length>200))return {error:'Enter a valid email address.'};
    if(item.phone.length>30)return {error:'Phone number is too long.'};
    if(type==='doctors'&&!item.specialty)return {error:'Specialty is required.'};
    if(type==='patients'&&item.dob&&!validDate(item.dob))return {error:'Enter a valid date of birth.'};
    if(type==='patients'&&item.notes.length>2000)return {error:'Notes must be under 2000 characters.'};
    return {item};
  }
  const item={patientId:clean(input.patientId),doctorId:clean(input.doctorId),date:clean(input.date),time:clean(input.time),duration:Number(input.duration),status:clean(input.status),reason:clean(input.reason)};
  if(!db.prepare('SELECT id FROM patients WHERE id=? AND ownerId=?').get(item.patientId,ownerId))return {error:'Select a valid patient.'};
  if(!db.prepare('SELECT id FROM doctors WHERE id=? AND ownerId=?').get(item.doctorId,ownerId))return {error:'Select a valid doctor.'};
  if(!validDate(item.date)||!validTime(item.time))return {error:'Enter a valid date and time.'};
  if(![15,30,45,60,90].includes(item.duration))return {error:'Select a valid duration.'};
  if(!['scheduled','completed','cancelled','no-show'].includes(item.status))return {error:'Select a valid status.'};
  if(item.reason.length>300)return {error:'Reason must be under 300 characters.'};
  if(item.status!=='cancelled'){
    const start=Number(item.time.slice(0,2))*60+Number(item.time.slice(3)),end=start+item.duration;
    const clash=list('appointments',ownerId).find(other=>other.id!==recordId&&other.date===item.date&&other.status!=='cancelled'&&(other.doctorId===item.doctorId||other.patientId===item.patientId)&&start<(Number(other.time.slice(0,2))*60+Number(other.time.slice(3))+other.duration)&&end>(Number(other.time.slice(0,2))*60+Number(other.time.slice(3))));
    if(clash)return {error:clash.doctorId===item.doctorId?'This doctor has another appointment during that time.':'This patient has another appointment during that time.'};
  }
  return {item};
}
function userFromRequest(req){const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)return null;const tokenHash=crypto.createHash('sha256').update(token).digest('hex');return db.prepare('SELECT users.id, users.email, users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').get(tokenHash,Date.now())||null}
async function api(req,res,parts){
  if(parts[0]==='signup'&&req.method==='POST'){
    const body=await readBody(req),email=clean(body.email).toLowerCase(),password=String(body.password||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)return error(res,400,'Enter a valid email address.');
    if(password.length<8||password.length>128)return error(res,400,'Password must be 8 to 128 characters.');
    if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return error(res,409,'An account with this email already exists.');
    const userId=id();db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(userId,email,passwordHash(password),'owner');
    const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),userId,Date.now()+7*24*60*60*1000);
    return json(res,201,{token,user:{email,role:'owner'}});
  }
  if(parts[0]==='login'&&req.method==='POST'){
    const body=await readBody(req),user=db.prepare('SELECT * FROM users WHERE email=?').get(clean(body.email).toLowerCase());
    if(!user||!verifyPassword(String(body.password||''),user.password_hash))return error(res,401,'Incorrect email or password.');
    const token=crypto.randomBytes(32).toString('hex'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash,user.id,Date.now()+7*24*60*60*1000);
    return json(res,200,{token,user:{email:user.email,role:user.role}});
  }
  const user=userFromRequest(req);if(!user)return error(res,401,'Please sign in.');
  if(parts[0]==='me'&&req.method==='GET')return json(res,200,{user});
  if(parts[0]==='logout'&&req.method==='POST'){const token=req.headers.authorization.slice(7);db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(token).digest('hex'));return json(res,200,{ok:true})}
  const [type,recordId]=parts;if(!Object.hasOwn(tables,type))return error(res,404,'Not found.');
  if(req.method==='GET'&&!recordId)return json(res,200,list(type,user.id));
  if(req.method==='POST'&&!recordId){const {item,error:issue}=validate(type,await readBody(req),user.id);if(issue)return error(res,400,issue);const newId=id(),fields=tables[type];db.prepare(`INSERT INTO ${type} (id,${fields.join(',')},ownerId) VALUES (${Array(fields.length+2).fill('?').join(',')})`).run(newId,...fields.map(key=>item[key]),user.id);return json(res,201,{id:newId,...item})}
  if(!recordId)return error(res,405,'Method not allowed.');
  const existing=db.prepare(`SELECT * FROM ${type} WHERE id=? AND ownerId=?`).get(recordId,user.id);if(!existing)return error(res,404,'Record not found.');
  if(req.method==='PUT'){const {item,error:issue}=validate(type,await readBody(req),user.id,recordId);if(issue)return error(res,400,issue);const fields=tables[type];db.prepare(`UPDATE ${type} SET ${fields.map(key=>`${key}=?`).join(',')} WHERE id=? AND ownerId=?`).run(...fields.map(key=>item[key]),recordId,user.id);return json(res,200,{id:recordId,...item})}
  if(req.method==='DELETE'){if(type!=='appointments'&&db.prepare(`SELECT id FROM appointments WHERE ${type==='patients'?'patientId':'doctorId'}=? AND ownerId=? LIMIT 1`).get(recordId,user.id))return error(res,409,'This record has linked appointments. Delete those appointments first.');db.prepare(`DELETE FROM ${type} WHERE id=? AND ownerId=?`).run(recordId,user.id);return json(res,200,{ok:true})}
  return error(res,405,'Method not allowed.');
}
const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js'};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))return await api(req,res,url.pathname.slice(5).split('/').filter(Boolean));const file=files[url.pathname];if(!file||req.method!=='GET')return error(res,404,'Not found.');res.writeHead(200,{'Content-Type':mime[path.extname(file)],'X-Content-Type-Options':'nosniff'});fs.createReadStream(path.join(root,file)).pipe(res)}catch(err){if(err.message==='Invalid JSON.'||err.message==='Request is too large.')return error(res,400,err.message);console.error(err);error(res,500,'Server error.')}});
if(require.main===module)server.listen(Number(process.env.PORT)||3000,()=>console.log('CareDesk running at http://localhost:'+(process.env.PORT||3000)));
module.exports={server,db};
