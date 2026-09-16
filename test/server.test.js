const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(),'caredesk-test-'));
process.env.DATA_DIR = directory;
const { server, db } = require('../server');
let base, token;
test.before(async () => {await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`});
test.after(async () => {await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(directory,{recursive:true,force:true})});
async function api(route,method='GET',body,authenticated=true,customToken){const response=await fetch(`${base}/api/${route}`,{method,headers:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${customToken||token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}

test('authentication protects records',async()=>{
  assert.equal((await api('patients','GET',undefined,false)).status,401);
  assert.equal((await api('login','POST',{email:'admin@caredesk.local',password:'wrong'},false)).status,401);
  const login=await api('login','POST',{email:'admin@caredesk.local',password:'Admin@123'},false);
  assert.equal(login.status,200);token=login.data.token;
  assert.equal((await api('me')).data.user.role,'admin');
});
test('CRUD, conflict checks, and linked-record protection',async()=>{
  const doctor=(await api('doctors','POST',{name:'Dr. Test',specialty:'General Medicine',email:'test@example.com',phone:'123'})).data;
  const patient=(await api('patients','POST',{name:'Test Patient',email:'patient@example.com',phone:'456',dob:'2000-01-01',notes:''})).data;
  assert.ok(doctor.id&&patient.id);
  const first={doctorId:doctor.id,patientId:patient.id,date:'2026-12-15',time:'10:00',duration:30,status:'scheduled',reason:'Checkup'};
  const booked=await api('appointments','POST',first);assert.equal(booked.status,201);
  assert.equal((await api('appointments','POST',{...first,time:'10:15'})).status,400);
  assert.equal((await api(`patients/${patient.id}`,'DELETE')).status,409);
  assert.equal((await api(`appointments/${booked.data.id}`,'PUT',{...first,status:'completed'})).status,200);
  assert.equal((await api(`appointments/${booked.data.id}`,'DELETE')).status,200);
  assert.equal((await api(`patients/${patient.id}`,'DELETE')).status,200);
  assert.equal((await api(`doctors/${doctor.id}`,'DELETE')).status,200);
});
test('new accounts are private and cannot use another account records',async()=>{
  const ownerDoctor=(await api('doctors','POST',{name:'Private Doctor',specialty:'General Medicine'})).data;
  const ownerPatient=(await api('patients','POST',{name:'Private Patient'})).data;
  assert.equal((await api('signup','POST',{email:'new@example.com',password:'longpassword'},false)).status,201);
  const signup=await api('signup','POST',{email:'another@example.com',password:'longpassword'},false);
  assert.equal(signup.status,201);const otherToken=signup.data.token;
  assert.equal((await api('signup','POST',{email:'another@example.com',password:'longpassword'},false)).status,409);
  assert.deepEqual((await api('patients','GET',undefined,true,otherToken)).data,[]);
  assert.equal((await api(`patients/${ownerPatient.id}`,'DELETE',undefined,true,otherToken)).status,404);
  assert.equal((await api('appointments','POST',{patientId:ownerPatient.id,doctorId:ownerDoctor.id,date:'2026-12-20',time:'10:00',duration:30,status:'scheduled'},true,otherToken)).status,400);
});
