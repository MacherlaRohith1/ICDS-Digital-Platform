const express = require('express');
const initSqlJs = require('sql.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'icds-platform-secret-key-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const DB_PATH = path.join(dataDir, 'icds.db');

let SQL_DB; // raw sql.js database

// ─── HELPERS ─────────────────────────────────────────────────
function saveDB() {
  const data = SQL_DB.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  SQL_DB.run(sql, params);
  saveDB();
  const r = SQL_DB.exec("SELECT last_insert_rowid() as id");
  return { lastInsertRowid: r.length ? r[0].values[0][0] : 0 };
}

function get(sql, params = []) {
  const stmt = SQL_DB.prepare(sql);
  if (params.length) stmt.bind(params);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  }
  stmt.free();
  return undefined;
}

function all(sql, params = []) {
  const result = SQL_DB.exec(sql, params);
  if (result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map(vals => {
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  });
}

// ─── INIT DB & SEED ──────────────────────────────────────────
async function initDB() {
  const SQLMod = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    SQL_DB = new SQLMod.Database(fs.readFileSync(DB_PATH));
  } else {
    SQL_DB = new SQLMod.Database();
  }

  SQL_DB.run("PRAGMA foreign_keys = ON");

  SQL_DB.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    location TEXT NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  SQL_DB.run(`CREATE TABLE IF NOT EXISTS children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age_months INTEGER NOT NULL,
    gender TEXT,
    mother_name TEXT,
    awc_name TEXT NOT NULL,
    sector TEXT NOT NULL,
    block TEXT NOT NULL,
    district TEXT NOT NULL,
    weight_kg REAL,
    height_cm REAL,
    nutrition_status TEXT,
    last_weigh_date TEXT,
    last_visit_date TEXT,
    is_referred INTEGER DEFAULT 0,
    referral_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  SQL_DB.run(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_role TEXT NOT NULL,
    target_location TEXT,
    is_read INTEGER DEFAULT 0,
    acknowledged INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  SQL_DB.run(`CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER,
    user_id INTEGER,
    visit_type TEXT NOT NULL,
    notes TEXT,
    visit_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  SQL_DB.run(`CREATE TABLE IF NOT EXISTS awc_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    awc_name TEXT NOT NULL,
    sector TEXT NOT NULL,
    block TEXT NOT NULL,
    district TEXT NOT NULL,
    month TEXT NOT NULL,
    weighing_pct REAL DEFAULT 0,
    nutrition_supply_pct REAL DEFAULT 0,
    home_visit_pct REAL DEFAULT 0,
    immunization_pct REAL DEFAULT 0,
    overall_score REAL DEFAULT 0
  )`);

  // Seed if empty
  const check = SQL_DB.exec("SELECT COUNT(*) as c FROM users");
  const count = check.length ? check[0].values[0][0] : 0;
  if (count === 0) {
    console.log('Seeding database...');
    const hash = bcrypt.hashSync('1234', 10);

    const users = [
      ['Meena Kumari', 'meena', hash, 'aww', 'AWC Rampur', '9876543210'],
      ['Sunita Devi', 'sunita', hash, 'aww', 'AWC Nagar', '9876543211'],
      ['Priya Sharma', 'priya', hash, 'supervisor', 'Sector A', '9876543212'],
      ['Rekha Singh', 'rekha', hash, 'supervisor', 'Sector B', '9876543213'],
      ['Anjali Gupta', 'anjali', hash, 'cdpo', 'Block Sadar', '9876543214'],
      ['Dr. Ravi Kumar', 'ravi', hash, 'state', 'District HQ', '9876543215'],
      ['Admin User', 'admin', hash, 'state', 'State HQ', '9000000000'],
    ];
    users.forEach(u => run('INSERT INTO users (name,username,password,role,location,phone) VALUES (?,?,?,?,?,?)', u));

    const children = [
      ['Aarav Kumar',24,'M','Meena Kumari','AWC Rampur','Sector A','Block Sadar','District 1',10.2,82,'Normal','2026-03-01','2026-03-01',0,null],
      ['Priya Devi',36,'F','Sita Devi','AWC Rampur','Sector A','Block Sadar','District 1',8.1,78,'MAM','2026-02-28','2026-03-02',0,null],
      ['Ravi Singh',18,'M','Geeta Singh','AWC Rampur','Sector A','Block Sadar','District 1',6.2,68,'SAM','2026-02-25','2026-02-20',1,'Referred to NRC'],
      ['Ananya Sharma',30,'F','Lakshmi Sharma','AWC Rampur','Sector A','Block Sadar','District 1',11.5,88,'Normal','2026-03-01','2026-03-01',0,null],
      ['Karan Yadav',42,'M','Parvati Yadav','AWC Rampur','Sector A','Block Sadar','District 1',12.8,92,'Normal','2026-02-26','2026-02-26',0,null],
      ['Neha Patel',15,'F','Rani Patel','AWC Nagar','Sector A','Block Sadar','District 1',7.0,71,'MAM','2026-03-01','2026-03-01',0,null],
      ['Amit Verma',28,'M','Kamla Verma','AWC Nagar','Sector A','Block Sadar','District 1',10.8,85,'Normal','2026-02-27','2026-02-27',0,null],
      ['Divya Kumari',20,'F','Sunita Singh','AWC Nagar','Sector A','Block Sadar','District 1',5.8,66,'SAM','2026-02-15','2026-02-10',1,'Referred to NRC - critical'],
      ['Rohan Das',33,'M','Anita Das','AWC Patel Nagar','Sector B','Block Sadar','District 1',12.0,90,'Normal','2026-03-02','2026-03-02',0,null],
      ['Sonia Gupta',48,'F','Manju Gupta','AWC Patel Nagar','Sector B','Block Sadar','District 1',13.5,95,'Normal','2026-03-01','2026-03-01',0,null],
      ['Vikash Kumar',22,'M','Rekha Devi','AWC Patel Nagar','Sector B','Block Sadar','District 1',7.5,74,'MAM','2026-02-28','2026-02-28',0,null],
      ['Pooja Rani',16,'F','Savita Rani','AWC Gandhi Nagar','Sector B','Block Sadar','District 1',6.8,70,'Normal','2026-03-01','2026-03-01',0,null],
      ['Arjun Mishra',40,'M','Durga Mishra','AWC Gandhi Nagar','Sector B','Block Sadar','District 1',11.0,88,'Normal','2026-02-20','2026-02-20',0,null],
      ['Kavita Joshi',26,'F','Prema Joshi','AWC Subhash Colony','Sector C','Block Sadar','District 1',7.2,73,'MAM','2026-02-25','2026-02-22',0,null],
      ['Rahul Tiwari',35,'M','Shanti Tiwari','AWC Subhash Colony','Sector C','Block Sadar','District 1',9.0,80,'Normal','2026-03-02','2026-03-02',0,null],
      ['Meera Chauhan',19,'F','Usha Chauhan','AWC Subhash Colony','Sector C','Block Sadar','District 1',5.5,65,'SAM','2026-02-18','2026-02-15',1,'Referred - severe wasting'],
      ['Deepak Rajput',44,'M','Asha Rajput','AWC Nehru Basti','Sector C','Block Sadar','District 1',14.0,97,'Normal','2026-03-01','2026-03-01',0,null],
      ['Sunita Kumari',13,'F','Radha Kumari','AWC Nehru Basti','Sector C','Block Sadar','District 1',6.5,68,'Normal','2026-02-28','2026-02-28',0,null],
      ['Mohan Lal',50,'M','Pushpa Lal','AWC Vijay Nagar','Sector D','Block Sadar','District 1',15.2,100,'Normal','2026-03-02','2026-03-02',0,null],
      ['Lakshmi Devi',29,'F','Kiran Devi','AWC Vijay Nagar','Sector D','Block Sadar','District 1',9.8,82,'MAM','2026-02-26','2026-02-25',0,null],
      ['Rajesh Singh',38,'M','Nirmala Singh','AWC Vijay Nagar','Sector D','Block Sadar','District 1',12.5,92,'Normal','2026-03-01','2026-03-01',0,null],
      ['Sapna Yadav',21,'F','Bhavna Yadav','AWC Shanti Nagar','Sector D','Block Sadar','District 1',7.8,75,'Normal','2026-02-27','2026-02-27',0,null],
      ['Gaurav Pandey',32,'M','Suman Pandey','AWC Shanti Nagar','Sector D','Block Sadar','District 1',8.5,79,'MAM','2026-02-22','2026-02-20',0,null],
      ['Nisha Rawat',17,'F','Chandra Rawat','AWC Indira Colony','Sector A','Block Mandi','District 2',7.2,72,'Normal','2026-03-01','2026-03-01',0,null],
      ['Vijay Kumar',25,'M','Mala Kumar','AWC Indira Colony','Sector A','Block Mandi','District 2',8.0,78,'Normal','2026-02-28','2026-02-28',0,null],
      ['Rina Devi',14,'F','Hema Devi','AWC MG Road','Sector A','Block Mandi','District 2',5.2,63,'SAM','2026-02-12','2026-02-10',1,'Critical - urgent NRC referral'],
      ['Aakash Sharma',45,'M','Poonam Sharma','AWC MG Road','Sector A','Block Mandi','District 2',14.5,98,'Normal','2026-03-02','2026-03-02',0,null],
      ['Jyoti Singh',23,'F','Kavita Singh','AWC Rajiv Nagar','Sector B','Block Mandi','District 2',8.5,76,'MAM','2026-02-26','2026-02-24',0,null],
      ['Suresh Pal',37,'M','Bimla Pal','AWC Rajiv Nagar','Sector B','Block Mandi','District 2',11.8,89,'Normal','2026-03-01','2026-03-01',0,null],
      ['Manisha Gupta',27,'F','Sarita Gupta','AWC Ambedkar Nagar','Sector B','Block Mandi','District 2',9.2,80,'Normal','2026-02-27','2026-02-27',0,null],
    ];
    children.forEach(c => run('INSERT INTO children (name,age_months,gender,mother_name,awc_name,sector,block,district,weight_kg,height_cm,nutrition_status,last_weigh_date,last_visit_date,is_referred,referral_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', c));

    const perf = [
      ['AWC Rampur','Sector A','Block Sadar','District 1','2026-02',92,88,75,95,87.5],
      ['AWC Nagar','Sector A','Block Sadar','District 1','2026-02',45,60,30,70,51.3],
      ['AWC Patel Nagar','Sector B','Block Sadar','District 1','2026-02',88,82,80,90,85.0],
      ['AWC Gandhi Nagar','Sector B','Block Sadar','District 1','2026-02',72,68,55,78,68.3],
      ['AWC Subhash Colony','Sector C','Block Sadar','District 1','2026-02',50,45,35,60,47.5],
      ['AWC Nehru Basti','Sector C','Block Sadar','District 1','2026-02',65,70,48,72,63.8],
      ['AWC Vijay Nagar','Sector D','Block Sadar','District 1','2026-02',95,90,85,92,90.5],
      ['AWC Shanti Nagar','Sector D','Block Sadar','District 1','2026-02',78,75,62,80,73.8],
      ['AWC Indira Colony','Sector A','Block Mandi','District 2','2026-02',82,78,70,85,78.8],
      ['AWC MG Road','Sector A','Block Mandi','District 2','2026-02',40,55,28,65,47.0],
      ['AWC Rajiv Nagar','Sector B','Block Mandi','District 2','2026-02',85,80,72,88,81.3],
      ['AWC Ambedkar Nagar','Sector B','Block Mandi','District 2','2026-02',90,85,78,92,86.3],
      ['AWC Rampur','Sector A','Block Sadar','District 1','2026-03',95,90,80,96,90.3],
      ['AWC Nagar','Sector A','Block Sadar','District 1','2026-03',48,55,32,68,50.8],
      ['AWC Patel Nagar','Sector B','Block Sadar','District 1','2026-03',90,85,82,92,87.3],
      ['AWC Gandhi Nagar','Sector B','Block Sadar','District 1','2026-03',75,70,58,80,70.8],
    ];
    perf.forEach(p => run('INSERT INTO awc_performance (awc_name,sector,block,district,month,weighing_pct,nutrition_supply_pct,home_visit_pct,immunization_pct,overall_score) VALUES (?,?,?,?,?,?,?,?,?,?)', p));

    const alerts = [
      ['critical','SAM Case — Immediate Action','Ravi Singh (18m) at AWC Rampur — SAM detected, refer to NRC immediately','aww','AWC Rampur','2026-03-03 08:30:00'],
      ['critical','SAM Case — Urgent Referral','Divya Kumari (20m) at AWC Nagar — critical SAM, no follow-up logged','aww','AWC Nagar','2026-03-02 14:15:00'],
      ['warning','Missed Weigh-ins','Priya Devi (36m) has missed 2 consecutive weighing sessions','aww','AWC Rampur','2026-03-03 09:00:00'],
      ['warning','Low Home Visit Compliance','AWC Nagar — home visit rate at 30%, well below 70% target','supervisor','Sector A','2026-03-03 07:00:00'],
      ['critical','Underperforming Centre','AWC Nagar — overall performance score 51.3%, needs urgent intervention','supervisor','Sector A','2026-03-02 18:00:00'],
      ['info','Performance Improved','AWC Patel Nagar performance improved from 85.0% to 87.3% this month','supervisor','Sector B','2026-03-03 10:00:00'],
      ['critical','SAM Spike in Sector C','3 SAM cases in Sector C — Subhash Colony & Nehru Basti need additional resources','cdpo','Block Sadar','2026-03-03 06:00:00'],
      ['warning','12 Pending NRC Referrals','12 NRC referrals in Block Sadar pending follow-up for > 7 days','cdpo','Block Sadar','2026-03-02 20:00:00'],
      ['success','Sector D On Track','All AWCs in Sector D meeting monthly targets — highest performance in block','cdpo','Block Sadar','2026-03-03 08:00:00'],
      ['critical','District 2 SAM Prevalence High','District 2 SAM prevalence at 22% — deploy additional resources','state','State HQ','2026-03-03 06:00:00'],
      ['warning','Q3 Intervention Below Target','Q3 intervention outcomes 8% below state target across 4 districts','state','State HQ','2026-03-02 12:00:00'],
      ['success','District 1 Exceeding Benchmarks','Districts 1 performance benchmarks exceeded by 12% this quarter','state','State HQ','2026-03-03 09:00:00'],
      ['warning','AWC MG Road — No Weighing Data','AWC MG Road has not submitted weighing data for 3 weeks','supervisor','Sector A','2026-03-01 15:00:00'],
      ['critical','Rina Devi — Critical SAM','Rina Devi (14m) at AWC MG Road — urgent NRC referral needed','aww','AWC MG Road','2026-03-02 10:00:00'],
    ];
    alerts.forEach(a => run('INSERT INTO alerts (type,title,message,target_role,target_location,created_at) VALUES (?,?,?,?,?,?)', a));

    const visits = [
      [1,1,'weighing','Normal growth tracking','2026-03-01'],
      [2,1,'weighing','MAM - needs supplementary nutrition','2026-02-28'],
      [3,1,'referral','Referred to NRC for SAM treatment','2026-02-25'],
      [4,1,'weighing','Healthy weight gain','2026-03-01'],
      [5,1,'home_visit','Regular check-up','2026-02-26'],
      [6,2,'weighing','MAM detected - nutrition plan started','2026-03-01'],
      [7,2,'weighing','Normal','2026-02-27'],
      [8,2,'referral','Critical SAM - emergency NRC referral','2026-02-15'],
      [1,1,'nutrition_supply','THR distributed','2026-03-02'],
      [2,1,'home_visit','Counseling on nutrition','2026-03-02'],
      [9,3,'weighing','Normal growth','2026-03-02'],
      [10,3,'weighing','Healthy','2026-03-01'],
    ];
    visits.forEach(v => run('INSERT INTO visits (child_id,user_id,visit_type,notes,visit_date) VALUES (?,?,?,?,?)', v));

    console.log('Database seeded successfully!');
  }
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── AUTH ROUTES ─────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, location: user.location }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, location: user.location, phone: user.phone } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = get('SELECT id, name, username, role, location, phone FROM users WHERE id = ?', [req.user.id]);
  res.json(user);
});

// ─── DASHBOARD ROUTES ────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  const { role, location } = req.user;

  if (role === 'aww') {
    const children = all('SELECT * FROM children WHERE awc_name = ?', [location]);
    const totalChildren = children.length;
    const samCount = children.filter(c => c.nutrition_status === 'SAM').length;
    const mamCount = children.filter(c => c.nutrition_status === 'MAM').length;
    const normalCount = children.filter(c => c.nutrition_status === 'Normal').length;
    const referredCount = children.filter(c => c.is_referred).length;
    const today = new Date().toISOString().slice(0, 10);
    const weighedToday = children.filter(c => c.last_weigh_date === today).length;
    const perf = get('SELECT * FROM awc_performance WHERE awc_name = ? ORDER BY month DESC LIMIT 1', [location]);
    const alerts2 = all("SELECT * FROM alerts WHERE target_role = 'aww' AND target_location = ? ORDER BY created_at DESC", [location]);

    res.json({
      stats: { totalChildren, samCount, mamCount, normalCount, referredCount, weighedToday },
      performance: perf || {},
      alerts: alerts2.slice(0, 10),
      recentChildren: children.slice(0, 10)
    });
  }
  else if (role === 'supervisor') {
    const awcPerf = all('SELECT * FROM awc_performance WHERE sector = ? ORDER BY month DESC', [location]);
    const latestMonth = awcPerf.length > 0 ? awcPerf[0].month : '';
    const currentPerf = awcPerf.filter(p => p.month === latestMonth);
    const totalAWCs = currentPerf.length;
    const underperforming = currentPerf.filter(p => p.overall_score < 60).length;
    const avgScore = currentPerf.length > 0 ? (currentPerf.reduce((s, p) => s + p.overall_score, 0) / currentPerf.length).toFixed(1) : 0;
    const children = all('SELECT * FROM children WHERE sector = ?', [location]);
    const samCount = children.filter(c => c.nutrition_status === 'SAM').length;
    const alerts2 = all("SELECT * FROM alerts WHERE target_role = 'supervisor' AND target_location = ? ORDER BY created_at DESC", [location]);

    res.json({
      stats: { totalAWCs, underperforming, avgScore, totalChildren: children.length, samCount },
      awcPerformance: currentPerf,
      alerts: alerts2.slice(0, 10),
    });
  }
  else if (role === 'cdpo') {
    const blockMatch = 'Block Sadar';
    const allPerf = all('SELECT * FROM awc_performance WHERE block = ? ORDER BY month DESC', [blockMatch]);
    const latestMonth = allPerf.length > 0 ? allPerf[0].month : '';
    const currentPerf = allPerf.filter(p => p.month === latestMonth);
    const totalAWCs = currentPerf.length;
    const activeAWCs = currentPerf.filter(p => p.overall_score > 0).length;
    const children = all('SELECT * FROM children WHERE block = ?', [blockMatch]);
    const samCount = children.filter(c => c.nutrition_status === 'SAM').length;
    const sectors = [...new Set(currentPerf.map(p => p.sector))];
    const sectorStats = sectors.map(s => {
      const sp = currentPerf.filter(p => p.sector === s);
      return { sector: s, avgScore: (sp.reduce((sum, p) => sum + p.overall_score, 0) / sp.length).toFixed(1), awcCount: sp.length };
    });
    const alerts2 = all("SELECT * FROM alerts WHERE target_role = 'cdpo' ORDER BY created_at DESC");

    res.json({
      stats: { totalAWCs, activeAWCs, totalChildren: children.length, samCount, activePct: totalAWCs > 0 ? ((activeAWCs / totalAWCs) * 100).toFixed(0) : '0' },
      sectorStats,
      alerts: alerts2.slice(0, 10),
    });
  }
  else {
    const allPerf = all('SELECT * FROM awc_performance ORDER BY month DESC');
    const latestMonth = allPerf.length > 0 ? allPerf[0].month : '';
    const currentPerf = allPerf.filter(p => p.month === latestMonth);
    const children = all('SELECT * FROM children');
    const districts = [...new Set(children.map(c => c.district))];
    const districtStats = districts.map(d => {
      const dc = children.filter(c => c.district === d);
      const samPct = dc.length > 0 ? ((dc.filter(c => c.nutrition_status === 'SAM').length / dc.length) * 100).toFixed(1) : '0';
      return { district: d, totalChildren: dc.length, samPct };
    });
    const totalAWCs = currentPerf.length;
    const avgScore = currentPerf.length > 0 ? (currentPerf.reduce((s, p) => s + p.overall_score, 0) / currentPerf.length).toFixed(1) : 0;
    const alerts2 = all("SELECT * FROM alerts WHERE target_role = 'state' ORDER BY created_at DESC");

    res.json({
      stats: { districts: districts.length, totalAWCs, totalChildren: children.length, avgScore, coverage: '87%' },
      districtStats,
      alerts: alerts2.slice(0, 10),
    });
  }
});

// ─── CHILDREN ROUTES ─────────────────────────────────────────
app.get('/api/children', auth, (req, res) => {
  const { role, location } = req.user;
  const { status, search } = req.query;
  let query = 'SELECT * FROM children WHERE 1=1';
  const params = [];

  if (role === 'aww') { query += ' AND awc_name = ?'; params.push(location); }
  else if (role === 'supervisor') { query += ' AND sector = ?'; params.push(location); }
  else if (role === 'cdpo') { query += ' AND block = ?'; params.push('Block Sadar'); }

  if (status && status !== 'all' && status !== '') { query += ' AND nutrition_status = ?'; params.push(status); }
  if (search) { query += ' AND name LIKE ?'; params.push(`%${search}%`); }

  query += " ORDER BY CASE nutrition_status WHEN 'SAM' THEN 0 WHEN 'MAM' THEN 1 ELSE 2 END, name";
  const result = all(query, params);
  res.json(result);
});

app.get('/api/children/:id', auth, (req, res) => {
  const child = get('SELECT * FROM children WHERE id = ?', [parseInt(req.params.id)]);
  if (!child) return res.status(404).json({ error: 'Child not found' });
  const childVisits = all('SELECT v.*, u.name as user_name FROM visits v LEFT JOIN users u ON v.user_id = u.id WHERE v.child_id = ? ORDER BY v.visit_date DESC', [parseInt(req.params.id)]);
  res.json({ ...child, visits: childVisits });
});

app.post('/api/children', auth, (req, res) => {
  const { name, age_months, gender, mother_name, weight_kg, height_cm, nutrition_status } = req.body;
  const u = req.user;

  if (u.role !== 'aww') return res.status(403).json({ error: 'Only AWWs can add children' });

  const awc_name = u.location;
  const ref = get('SELECT sector, block, district FROM children WHERE awc_name = ? LIMIT 1', [awc_name]);
  const sector = ref?.sector || 'Sector A';
  const block = ref?.block || 'Block Sadar';
  const district = ref?.district || 'District 1';
  const today = new Date().toISOString().slice(0, 10);

  const result = run(
    'INSERT INTO children (name,age_months,gender,mother_name,awc_name,sector,block,district,weight_kg,height_cm,nutrition_status,last_weigh_date,last_visit_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [name, age_months, gender, mother_name, awc_name, sector, block, district, weight_kg, height_cm, nutrition_status, today, today]
  );
  res.json({ id: result.lastInsertRowid, message: 'Child registered successfully' });
});

// ─── ALERTS ROUTES ───────────────────────────────────────────
app.get('/api/alerts', auth, (req, res) => {
  const { role, location } = req.user;
  let result;
  if (role === 'aww') {
    result = all("SELECT * FROM alerts WHERE target_role = 'aww' AND target_location = ? ORDER BY created_at DESC", [location]);
  } else if (role === 'supervisor') {
    result = all("SELECT * FROM alerts WHERE target_role = 'supervisor' AND target_location = ? ORDER BY created_at DESC", [location]);
  } else if (role === 'cdpo') {
    result = all("SELECT * FROM alerts WHERE target_role = 'cdpo' ORDER BY created_at DESC");
  } else {
    result = all("SELECT * FROM alerts WHERE target_role = 'state' ORDER BY created_at DESC");
  }
  res.json(result);
});

app.put('/api/alerts/:id/acknowledge', auth, (req, res) => {
  run('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ message: 'Alert acknowledged' });
});

// ─── PERFORMANCE ROUTES ──────────────────────────────────────
app.get('/api/performance', auth, (req, res) => {
  const { role, location } = req.user;
  let result;
  if (role === 'aww') {
    result = all('SELECT * FROM awc_performance WHERE awc_name = ? ORDER BY month DESC', [location]);
  } else if (role === 'supervisor') {
    result = all('SELECT * FROM awc_performance WHERE sector = ? ORDER BY month DESC', [location]);
  } else if (role === 'cdpo') {
    result = all('SELECT * FROM awc_performance WHERE block = ? ORDER BY month DESC', ['Block Sadar']);
  } else {
    result = all('SELECT * FROM awc_performance ORDER BY month DESC');
  }
  res.json(result);
});

// ─── RECORD VISIT ────────────────────────────────────────────
app.post('/api/visits', auth, (req, res) => {
  const { child_id, visit_type, notes } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  run('INSERT INTO visits (child_id, user_id, visit_type, notes, visit_date) VALUES (?,?,?,?,?)', [child_id, req.user.id, visit_type, notes, today]);

  if (visit_type === 'weighing') {
    run('UPDATE children SET last_weigh_date = ? WHERE id = ?', [today, child_id]);
  }
  run('UPDATE children SET last_visit_date = ? WHERE id = ?', [today, child_id]);

  res.json({ message: 'Visit recorded' });
});

// ─── SPA FALLBACK ────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ───────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║   ICDS Digital Platform is running!      ║`);
    console.log(`  ║   Open: http://localhost:${PORT}            ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
    console.log(`  Login accounts (password for all: 1234):`);
    console.log(`    meena  → AWW (AWC Rampur)`);
    console.log(`    priya  → Supervisor (Sector A)`);
    console.log(`    anjali → CDPO (Block Sadar)`);
    console.log(`    ravi   → State Official`);
    console.log(`    admin  → State Official\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
