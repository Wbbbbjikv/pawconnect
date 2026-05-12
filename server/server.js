const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pawconnect-secret-key-change-me';

// ==================== Supabase Storage 客户端 ====================
const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'skip'
);

// ==================== PostgreSQL 连接池 ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/pawconnect',
  ssl: { rejectUnauthorized: false }
});

// ==================== 城市坐标库 & 距离计算 ====================
const cityCoords = {
  '北京': [39.9042, 116.4074], '上海': [31.2304, 121.4737], '广州': [23.1291, 113.2644],
  '深圳': [22.5431, 114.0579], '杭州': [30.2741, 120.1551], '南京': [32.0603, 118.7969],
  '武汉': [30.5928, 114.3055], '成都': [30.5728, 104.0668], '重庆': [29.4316, 106.9123],
  '天津': [39.3434, 117.3616], '苏州': [31.2990, 120.5853], '西安': [34.3416, 108.9398],
  '长沙': [28.2282, 112.9388], '郑州': [34.7466, 113.6253], '青岛': [36.0671, 120.3826],
  '大连': [38.9140, 121.6147], '厦门': [24.4798, 118.0894], '福州': [26.0745, 119.2965],
  '合肥': [31.8206, 117.2272], '济南': [36.6512, 116.9972], '昆明': [25.0389, 102.7183],
  '贵阳': [26.6470, 106.6302], '南宁': [22.8170, 108.3665], '海口': [20.0174, 110.3492],
  '石家庄': [38.0428, 114.5149], '太原': [37.8706, 112.5489], '沈阳': [41.8057, 123.4315],
  '长春': [43.8171, 125.3235], '哈尔滨': [45.8038, 126.5350], '兰州': [36.0611, 103.8343],
  '西宁': [36.6171, 101.7785], '南昌': [28.6820, 115.8579], '呼和浩特': [40.8424, 111.7490],
  '乌鲁木齐': [43.8256, 87.6168], '拉萨': [29.6500, 91.1000], '银川': [38.4872, 106.2309]
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findCityCoord(cityName) {
  if (!cityName) return null;
  for (var key in cityCoords) {
    if (cityName.indexOf(key) !== -1 || key.indexOf(cityName) !== -1) {
      return { lat: cityCoords[key][0], lon: cityCoords[key][1], city: key };
    }
  }
  return null;
}

// ==================== 中间件 ====================
app.use(express.json({ limit: '10mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function uploadToSupabase(file) {
  const ext = path.extname(file.originalname);
  const filename = uuidv4() + ext;
  const { data, error } = await supabase.storage
    .from('uploads')
    .upload(filename, file.buffer, { contentType: file.mimetype, upsert: true });
  if (error) throw error;
  return supabase.storage.from('uploads').getPublicUrl(filename).data.publicUrl;
}

// ==================== JWT 认证中间件 ====================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// ==================== 认证路由 ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: '姓名、邮箱和密码为必填项' });
    }
    if (password.length < 6 || password.length > 20) {
      return res.status(400).json({ error: '密码长度需为 6-20 位' });
    }
    const existing = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
    if (existing) return res.status(409).json({ error: '该邮箱已被注册' });

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await pool.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [id, name, email, passwordHash]);
    const user = (await pool.query('SELECT id, name, email, phone, avatar_url, city, created_at FROM users WHERE id = $1', [id])).rows[0];

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败，请稍后再试' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });

    const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    if (!user) return res.status(401).json({ error: '邮箱或密码错误' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: '邮箱或密码错误' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...userData } = user;
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: '登录失败' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = (await pool.query('SELECT id, name, email, phone, avatar_url, city, created_at FROM users WHERE id = $1', [req.user.id])).rows[0];
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

// ==================== 宠物路由 ====================

app.get('/api/pets', async (req, res) => {
  try {
    let sql = 'SELECT * FROM pets WHERE is_deleted = false';
    const params = [];
    let paramIdx = 1;
    if (req.query.status && req.query.status !== '全部') { sql += ' AND status = $' + paramIdx++; params.push(req.query.status); }
    if (req.query.category && req.query.category !== '全部') { sql += ' AND category = $' + paramIdx++; params.push(req.query.category); }
    if (req.query.search) {
      sql += ' AND (name LIKE $' + paramIdx++ + ' OR breed LIKE $' + paramIdx++ + ')';
      params.push('%' + req.query.search + '%', '%' + req.query.search + '%');
    }

    const userLat = parseFloat(req.query.userLat) || 0;
    const userLon = parseFloat(req.query.userLon) || 0;
    const userCity = req.query.userCity || '';
    const filterMode = req.query.filter || 'all';

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = parseInt((await pool.query(countSql, params)).rows[0].total);
    sql += ' ORDER BY created_at DESC';

    let pets = (await pool.query(sql, params)).rows;

    pets = pets.map(function(p) {
      var dist = '未知';
      var locationDisplay = p.location;
      if (userLat && userLon && p.latitude && p.longitude && !(p.latitude === 0 && p.longitude === 0)) {
        dist = (haversineKm(userLat, userLon, p.latitude, p.longitude)).toFixed(1) + 'km';
      }
      var isSameCity = userCity && (p.location.indexOf(userCity) !== -1 || (findCityCoord(userCity) && findCityCoord(p.location) && findCityCoord(userCity).city === findCityCoord(p.location).city));
      if (!isSameCity) {
        var coord = findCityCoord(p.location);
        locationDisplay = coord ? coord.city : p.location;
      }
      return Object.assign({}, p, { distance: dist, locationDisplay: locationDisplay, isSameCity: isSameCity });
    });

    if (filterMode === 'city' && userCity) {
      pets = pets.filter(function(p) { return p.isSameCity; });
      pets.sort(function(a, b) {
        var dA = parseFloat(a.distance) || 9999;
        var dB = parseFloat(b.distance) || 9999;
        return dA - dB;
      });
    }

    var limit = parseInt(req.query.limit) || 20;
    var offset = parseInt(req.query.offset) || 0;
    var pagedPets = pets.slice(offset, offset + limit);
    var hasMore = offset + limit < pets.length;

    res.json({ pets: pagedPets, total: pets.length, hasMore });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取宠物列表失败' });
  }
});

app.get('/api/pets/:id', async (req, res) => {
  const pet = (await pool.query('SELECT * FROM pets WHERE id = $1 AND is_deleted = false', [req.params.id])).rows[0];
  if (!pet) return res.status(404).json({ error: '宠物不存在' });
  res.json({ pet });
});

app.post('/api/pets', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, breed, age, gender, category, location, story, latitude, longitude } = req.body;
    if (!name || !breed || !age || !gender || !location) {
      return res.status(400).json({ error: '请填写所有必填项' });
    }
    let imageUrl = req.body.image_url || '';
    if (req.file) {
      imageUrl = await uploadToSupabase(req.file);
    }
    const id = uuidv4();

    let lat = parseFloat(latitude) || 0;
    let lon = parseFloat(longitude) || 0;
    if ((lat === 0 && lon === 0) || isNaN(lat)) {
      const coord = findCityCoord(location);
      if (coord) { lat = coord.lat; lon = coord.lon; }
    }

    await pool.query(
      'INSERT INTO pets (id, name, breed, age, gender, category, location, story, image_url, publisher_id, status, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [id, name, breed, age, gender, category || '猫', location, story || '', imageUrl, req.user.id, '审核中', lat, lon]
    );

    await pool.query(
      'INSERT INTO messages (id, sender_id, receiver_id, content, type, is_read) VALUES ($1, $2, $3, $4, $5, $6)',
      [uuidv4(), null, req.user.id, '您的宠物「' + name + '」已发布成功，正在审核中，审核通过后将在首页展示。', 'notification', false]
    );

    const pet = (await pool.query('SELECT * FROM pets WHERE id = $1', [id])).rows[0];
    res.status(201).json({ pet });
  } catch (err) {
    console.error('发布宠物失败:', err);
    res.status(500).json({ error: '发布失败' });
  }
});

// ==================== 领养申请路由 ====================

app.get('/api/applications', authMiddleware, async (req, res) => {
  try {
    const apps = (await pool.query(
      'SELECT a.*, p.name as pet_name, p.breed as pet_breed, p.age as pet_age, p.gender as pet_gender, p.category as pet_category, p.image_url as pet_image_url FROM applications a LEFT JOIN pets p ON a.pet_id = p.id WHERE a.user_id = $1 ORDER BY a.created_at DESC',
      [req.user.id]
    )).rows;
    const applications = apps.map(a => ({
      ...a,
      pet: a.pet_name ? {
        id: a.pet_id, name: a.pet_name, breed: a.pet_breed,
        age: a.pet_age, gender: a.pet_gender, category: a.pet_category,
        image_url: a.pet_image_url
      } : null
    }));
    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: '获取申请列表失败' });
  }
});

app.post('/api/applications', authMiddleware, async (req, res) => {
  try {
    const { pet_id, applicant_name, applicant_phone, housing_type, has_balcony_net,
      has_pet_experience, current_pets, family_support, has_allergies,
      daily_time, motivation, signature_data } = req.body;

    if (!pet_id || !applicant_name || !applicant_phone || !housing_type) {
      return res.status(400).json({ error: '请填写所有必填项' });
    }

    const id = uuidv4();
    await pool.query(
      'INSERT INTO applications (id, user_id, pet_id, applicant_name, applicant_phone, housing_type, has_balcony_net, has_pet_experience, current_pets, family_support, has_allergies, daily_time, motivation, signature_data, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
      [id, req.user.id, pet_id, applicant_name, applicant_phone, housing_type,
        has_balcony_net ? true : false, has_pet_experience ? true : false, current_pets || '',
        family_support || '', has_allergies || 'no', daily_time || '',
        motivation || '', signature_data || '', '审核中']
    );

    await pool.query(
      'INSERT INTO messages (id, receiver_id, content, type) VALUES ($1, $2, $3, $4)',
      [uuidv4(), req.user.id, '你的领养申请（' + applicant_name + '）已成功提交，我们会尽快审核。', 'notification']
    );

    const app = (await pool.query('SELECT * FROM applications WHERE id = $1', [id])).rows[0];
    res.status(201).json({ application: app, message: '申请提交成功！' });
  } catch (err) {
    console.error('提交申请失败:', err);
    res.status(500).json({ error: '提交失败' });
  }
});

// ==================== 收藏路由 ====================

app.get('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const favs = (await pool.query(
      'SELECT f.*, p.id as pet_id, p.name as pet_name, p.breed as pet_breed, p.age as pet_age, p.gender as pet_gender, p.category as pet_category, p.neutered as pet_neutered, p.vaccine as pet_vaccine, p.location as pet_location, p.story as pet_story, p.image_url as pet_image_url, p.status as pet_status FROM favorites f LEFT JOIN pets p ON f.pet_id = p.id WHERE f.user_id = $1 AND p.is_deleted = false ORDER BY f.created_at DESC',
      [req.user.id]
    )).rows;
    const favorites = favs.map(f => ({
      ...f,
      pet: f.pet_name ? {
        id: f.pet_id, name: f.pet_name, breed: f.pet_breed,
        age: f.pet_age, gender: f.pet_gender, category: f.pet_category,
        neutered: f.pet_neutered, vaccine: f.pet_vaccine,
        location: f.pet_location, story: f.pet_story,
        image_url: f.pet_image_url, status: f.pet_status
      } : null
    }));
    res.json({ favorites });
  } catch (err) {
    res.status(500).json({ error: '获取收藏列表失败' });
  }
});

app.post('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const { pet_id } = req.body;
    if (!pet_id) return res.status(400).json({ error: '缺少宠物ID' });
    const id = uuidv4();
    await pool.query(
      'INSERT INTO favorites (id, user_id, pet_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, pet_id) DO NOTHING',
      [id, req.user.id, pet_id]
    );
    const fav = (await pool.query('SELECT * FROM favorites WHERE id = $1', [id])).rows[0] || { user_id: req.user.id, pet_id };
    res.status(201).json({ favorite: fav });
  } catch (err) {
    res.status(500).json({ error: '收藏失败' });
  }
});

app.delete('/api/favorites/:petId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM favorites WHERE user_id = $1 AND pet_id = $2', [req.user.id, req.params.petId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '取消收藏失败' });
  }
});

app.get('/api/favorites/check/:petId', authMiddleware, async (req, res) => {
  try {
    const fav = (await pool.query('SELECT id FROM favorites WHERE user_id = $1 AND pet_id = $2', [req.user.id, req.params.petId])).rows[0];
    res.json({ isFavorited: !!fav });
  } catch (err) {
    res.status(500).json({ error: '检查收藏状态失败' });
  }
});

app.get('/api/favorites/ids', authMiddleware, async (req, res) => {
  try {
    const rows = (await pool.query('SELECT pet_id FROM favorites WHERE user_id = $1', [req.user.id])).rows;
    res.json({ ids: rows.map(r => r.pet_id) });
  } catch (err) {
    res.status(500).json({ error: '获取收藏ID列表失败' });
  }
});

// ==================== 消息路由 ====================

app.get('/api/messages/unread-count', authMiddleware, async (req, res) => {
  try {
    const row = (await pool.query('SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false', [req.user.id])).rows[0];
    res.json({ count: parseInt(row.count) });
  } catch (err) {
    res.status(500).json({ error: '获取未读消息数失败' });
  }
});

app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const msgs = (await pool.query(
      'SELECT * FROM messages WHERE receiver_id = $1 OR sender_id = $2 ORDER BY created_at DESC',
      [req.user.id, req.user.id]
    )).rows;
    res.json({ messages: msgs });
  } catch (err) {
    res.status(500).json({ error: '获取消息列表失败' });
  }
});

app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { receiver_id, content, type } = req.body;
    if (!content) return res.status(400).json({ error: '消息内容不能为空' });
    const id = uuidv4();
    await pool.query(
      'INSERT INTO messages (id, sender_id, receiver_id, content, type) VALUES ($1,$2,$3,$4,$5)',
      [id, req.user.id, receiver_id || null, content, type || 'chat']
    );
    const msg = (await pool.query('SELECT * FROM messages WHERE id = $1', [id])).rows[0];
    res.status(201).json({ message: msg });
  } catch (err) {
    res.status(500).json({ error: '发送消息失败' });
  }
});

// ==================== 领养成功路由 ====================

app.get('/api/adoptions', authMiddleware, async (req, res) => {
  try {
    const adops = (await pool.query(
      'SELECT a.*, p.name as pet_name, p.breed as pet_breed, p.image_url as pet_image_url FROM adoptions a LEFT JOIN pets p ON a.pet_id = p.id WHERE a.user_id = $1 ORDER BY a.created_at DESC',
      [req.user.id]
    )).rows;
    const adoptions = adops.map(a => ({
      ...a,
      pet: a.pet_name ? { id: a.pet_id, name: a.pet_name, breed: a.pet_breed, image_url: a.pet_image_url } : null
    }));
    res.json({ adoptions });
  } catch (err) {
    res.status(500).json({ error: '获取领养记录失败' });
  }
});

// ==================== 用户统计 ====================

app.get('/api/pets/mine', authMiddleware, async (req, res) => {
  try {
    const pets = (await pool.query('SELECT * FROM pets WHERE publisher_id = $1 AND is_deleted = false ORDER BY created_at DESC', [req.user.id])).rows;
    res.json({ pets });
  } catch (err) {
    res.status(500).json({ error: '获取我的发布失败' });
  }
});

app.put('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, city } = req.body;
    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (name !== undefined) { updates.push('name = $' + paramIdx++); params.push(name); }
    if (phone !== undefined) { updates.push('phone = $' + paramIdx++); params.push(phone); }
    if (city !== undefined) { updates.push('city = $' + paramIdx++); params.push(city); }
    if (updates.length === 0) { return res.status(400).json({ error: '没有需要更新的字段' }); }
    params.push(req.user.id);
    await pool.query('UPDATE users SET ' + updates.join(', ') + ' WHERE id = $' + paramIdx, params);
    const user = (await pool.query('SELECT id, name, email, phone, avatar_url, city, created_at FROM users WHERE id = $1', [req.user.id])).rows[0];
    res.json({ user });
  } catch (err) {
    console.error('更新用户资料失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

app.post('/api/user/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择头像文件' });
    const avatarUrl = await uploadToSupabase(req.file);
    await pool.query("UPDATE users SET avatar_url = $1 WHERE id = $2", [avatarUrl, req.user.id]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    res.status(500).json({ error: '上传头像失败' });
  }
});

// ==================== 用户统计 ====================

app.get('/api/user/stats', authMiddleware, async (req, res) => {
  try {
    const appCount = parseInt((await pool.query('SELECT COUNT(*) as count FROM applications WHERE user_id = $1', [req.user.id])).rows[0].count);
    const favCount = parseInt((await pool.query('SELECT COUNT(*) as count FROM favorites WHERE user_id = $1', [req.user.id])).rows[0].count);
    const adoptionCount = parseInt((await pool.query('SELECT COUNT(*) as count FROM adoptions WHERE user_id = $1', [req.user.id])).rows[0].count);
    const publishCount = parseInt((await pool.query('SELECT COUNT(*) as count FROM pets WHERE publisher_id = $1 AND is_deleted = false', [req.user.id])).rows[0].count);
    res.json({ stats: { applicationCount: appCount, favoriteCount: favCount, adoptionCount: adoptionCount, publishCount: publishCount } });
  } catch (err) {
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// ==================== IP 定位 ====================
app.get('/api/location', (req, res) => {
  const http = require('http');
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  http.get('http://ip-api.com/json/' + (clientIp || '') + '?lang=zh-CN', (resp) => {
    let data = '';
    resp.on('data', chunk => data += chunk);
    resp.on('end', () => {
      try {
        const geo = JSON.parse(data);
        if (geo.status === 'success') {
          res.json({ city: geo.city || '上海', region: geo.regionName || '', country: geo.country || '中国' });
        } else {
          res.json({ city: '上海', region: '', country: '中国' });
        }
      } catch(e) { res.json({ city: '上海', region: '', country: '中国' }); }
    });
  }).on('error', () => res.json({ city: '上海', region: '', country: '中国' }));
});

// ==================== 健康检查 ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'PawConnect API', db: 'PostgreSQL' });
});

app.use((req, res) => res.status(404).json({ error: '接口不存在' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: '服务器内部错误' }); });

// 仅在本地开发时监听端口（Vercel 不需要 listen）
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('');
    console.log('===========================================');
    console.log('  PawConnect API 服务已启动!');
    console.log('  地址: http://localhost:' + PORT);
    console.log('  健康检查: http://localhost:' + PORT + '/api/health');
    console.log('  数据库: PostgreSQL');
    console.log('===========================================');
    console.log('');
  });
}

module.exports = app;
