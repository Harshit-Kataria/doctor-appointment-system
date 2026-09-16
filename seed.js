const { db } = require('./server');
const crypto = require('node:crypto');
const id = () => crypto.randomUUID();
const ownerId = db.prepare('SELECT id FROM users WHERE role=? ORDER BY rowid LIMIT 1').get('admin').id;
const localDate = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
if (db.prepare('SELECT id FROM doctors LIMIT 1').get() || db.prepare('SELECT id FROM patients LIMIT 1').get()) {
  console.log('Existing records found. Demo data was not added.');
} else {
  const doctors=[['Dr. Maya Sharma','General Medicine','maya@example.com','555-0101'],['Dr. Arjun Mehta','Cardiology','arjun@example.com','555-0102'],['Dr. Neha Rao','Dermatology','neha@example.com','555-0103']];
  const patients=[['Aarav Patel','aarav@example.com','555-0201','1991-04-12',''],['Priya Nair','priya@example.com','555-0202','1987-09-24',''],['Rohan Gupta','rohan@example.com','555-0203','1998-01-16','']];
  const doctorIds=doctors.map(values=>{const key=id();db.prepare('INSERT INTO doctors (id,name,specialty,email,phone,ownerId) VALUES (?,?,?,?,?,?)').run(key,...values,ownerId);return key});
  const patientIds=patients.map(values=>{const key=id();db.prepare('INSERT INTO patients (id,name,email,phone,dob,notes,ownerId) VALUES (?,?,?,?,?,?,?)').run(key,...values,ownerId);return key});
  [['09:30','Routine consultation'],['11:00','Follow-up visit'],['14:00','Skin consultation']].forEach(([time,reason],i)=>db.prepare('INSERT INTO appointments (id,patientId,doctorId,date,time,duration,status,reason,ownerId) VALUES (?,?,?,?,?,?,?,?,?)').run(id(),patientIds[i],doctorIds[i],localDate(),time,30,'scheduled',reason,ownerId));
  console.log('Demo doctors, patients, and appointments added.');
}
