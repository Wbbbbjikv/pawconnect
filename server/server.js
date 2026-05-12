const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pawconnect-secret-key-change-me';

// ==================== 初始化 SQLite 数据库 ====================
const db = new Database(path.join(__dirname, 'pawconnect.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 数据库迁移：为已有 pets 表添加 category 列
try { db.exec("ALTER TABLE pets ADD COLUMN category TEXT DEFAULT '猫' CHECK(category IN ('猫','狗','其他'))"); } catch(e) { /* 列已存在 */ }
// 数据库迁移：添加经纬度列
try { db.exec("ALTER TABLE pets ADD COLUMN latitude REAL DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE pets ADD COLUMN longitude REAL DEFAULT 0"); } catch(e) {}

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    city TEXT DEFAULT '上海',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    breed TEXT NOT NULL,
    age TEXT NOT NULL,
    category TEXT DEFAULT '猫' CHECK(category IN ('猫','狗','其他')),
    gender TEXT NOT NULL CHECK(gender IN ('male','female')),
    neutered TEXT DEFAULT '未绝育',
    vaccine TEXT DEFAULT '未知',
    location TEXT NOT NULL,
    distance TEXT DEFAULT '未知',
    story TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    status TEXT DEFAULT '寻找领养' CHECK(status IN ('寻找领养','审核中','已领养')),
    publisher_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    latitude REAL DEFAULT 0,
    longitude REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pet_id TEXT NOT NULL,
    applicant_name TEXT NOT NULL,
    applicant_phone TEXT NOT NULL,
    housing_type TEXT NOT NULL,
    has_balcony_net INTEGER DEFAULT 0,
    has_pet_experience INTEGER DEFAULT 0,
    current_pets TEXT DEFAULT '',
    family_support TEXT DEFAULT '',
    has_allergies TEXT DEFAULT 'no',
    daily_time TEXT DEFAULT '',
    motivation TEXT DEFAULT '',
    signature_data TEXT DEFAULT '',
    status TEXT DEFAULT '审核中' CHECK(status IN ('审核中','通过初审','已通过','未通过','已取消')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pet_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, pet_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT,
    receiver_id TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'notification' CHECK(type IN ('notification','chat','system')),
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS adoptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pet_id TEXT NOT NULL,
    adoption_number TEXT UNIQUE NOT NULL,
    adoption_date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// 插入种子数据（使用 INSERT OR IGNORE 避免重复）
const insertPet = db.prepare(
  'INSERT OR IGNORE INTO pets (id, name, breed, age, gender, category, neutered, vaccine, location, distance, story, image_url, status, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const seedPets = [
  ['p001', '小橘子', '橘猫', '1岁', 'female', '猫', '已绝育', '已疫苗', '上海浦东新区', '2.5km',
    '小橘子在一个下雨天被发现蜷缩在停车场的角落，当时它又饿又冷。被救助后，它展现了极其亲人的性格，总是第一个跑到笼子前迎接志愿者。',
    'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 31.2304, 121.4737],
  ['p002', '奶盖', '布偶猫', '6个月', 'female', '猫', '已绝育', '已疫苗', '北京朝阳区', '3.8km',
    '奶盖是一只颜值超高的布偶猫，蓝眼睛像宝石一样美丽。性格温柔粘人，喜欢跟在人后面走来走去。已经习惯家庭生活，会用猫砂盆。',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 39.9042, 116.4074],
  ['p003', '旺财', '比格犬', '8个月', 'male', '狗', '未绝育', '已疫苗', '武汉洪山区', '5.1km',
    '旺财是一只精力充沛的小比格，最喜欢追飞盘和在草地上打滚。从繁殖场救出，经过细心照料，现在已经是健康快乐的小狗了。',
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '寻找领养', 30.5928, 114.3055],
  ['p004', '蓝胖子', '英国短毛猫', '2岁', 'male', '猫', '已绝育', '驱虫完成', '杭州西湖区', '1.2km',
    '蓝胖子性格沉稳，圆脸圆眼，特别招人喜欢。原主人因工作调动出国无法带走它。非常安静，不拆家不闹腾，喜欢在窗台晒太阳。',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 30.2741, 120.1551],
  ['p005', '布丁', '金毛', '3个月', 'female', '狗', '未绝育', '第一针疫苗', '成都锦江区', '8.0km',
    '布丁是一只超萌的金毛小奶狗，毛茸茸的身体就像一颗行走的布丁。和兄弟姐妹一起被遗弃在公园的纸箱里，现在已健康长大。',
    'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=800&fit=crop', '寻找领养', 30.5728, 104.0668],
  ['p006', '芝麻', '暹罗猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '广州天河区', '6.5km',
    '芝麻是个小话痨，喜欢喵喵叫跟你聊天。暹罗猫天性活泼好动。从小区救助的流浪猫，现在已完全适应室内生活，性格亲人。',
    'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 23.1291, 113.2644],
  ['p007', '大壮', '哈士奇', '1岁半', 'male', '狗', '已绝育', '已疫苗', '南京鼓楼区', '12.0km',
    '大壮是一只表情丰富的二哈。精力极其旺盛，需要每天大量运动。原主人因工作太忙无法照顾。适合喜欢户外运动的家庭。',
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '寻找领养', 32.0603, 118.7969],
  ['p008', '豆豆', '柯基', '2岁', 'female', '狗', '已绝育', '已疫苗', '深圳南山区', '4.2km',
    '豆豆是一只短腿小柯基，屁股扭起来超级可爱。性格开朗活泼，对小孩子特别友好。已训练有素，是非常理想的家庭伴侣犬。',
    'https://images.unsplash.com/photo-1612536057832-2ff7ead58194?w=600&h=800&fit=crop', '寻找领养', 22.5431, 114.0579],
  ['p009', '年糕', '美短', '8个月', 'male', '猫', '未绝育', '已疫苗', '西安雁塔区', '2.0km',
    '年糕是一只圆滚滚的美短，银白色虎斑纹特别帅气。性格独立但不冷漠，想被摸的时候会主动蹭过来。已恢复健康。',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 34.3416, 108.9398],
  ['p010', '雪球', '萨摩耶', '1岁', 'female', '狗', '已绝育', '已疫苗', '重庆渝中区', '15.0km',
    '雪球是一只笑容治愈的萨摩耶，一身雪白的毛发特别漂亮。从狗肉馆救出，经过半年的心理疏导和身体治疗，现在已是健康的快乐狗狗。',
    'https://images.unsplash.com/photo-1596492784531-6e6ce5e0f2b4?w=600&h=800&fit=crop', '寻找领养', 29.4316, 106.9123],
  ['p011', '团子', '拉布拉多', '3岁', 'female', '狗', '已绝育', '已疫苗', '长沙岳麓区', '7.0km',
    '团子性格温和稳重，是一只非常听话的拉布拉多。曾经是导盲犬预备犬，训练有素。原主人因出国无法继续饲养，希望能找到永远的家。',
    'https://images.unsplash.com/photo-1552053831-71594a27632d?w=600&h=800&fit=crop', '寻找领养', 28.2282, 112.9388],
  ['p012', '墨墨', '黑猫', '2岁', 'male', '猫', '已绝育', '已疫苗', '苏州姑苏区', '3.5km',
    '墨墨全身乌黑发亮，金色眼睛特别迷人。性格安静内敛，喜欢安静地陪在你身边。从老城区救助，已经习惯室内生活。',
    'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&h=800&fit=crop', '寻找领养', 31.2990, 120.5853],
  ['p013', '元宝', '橘猫', '3岁', 'male', '猫', '已绝育', '已疫苗', '天津南开区', '4.0km',
    '元宝是一只胖乎乎的橘猫，特别能吃。性格慵懒佛系，最喜欢在阳光下午睡。性格特别好，随便撸不生气。',
    'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 39.3434, 117.3616],
  ['p014', '可乐', '泰迪', '1岁', 'female', '狗', '已绝育', '已疫苗', '青岛崂山区', '6.0km',
    '可乐是一只聪明的小泰迪，卷卷的毛发像泰迪熊一样可爱。活泼好动，喜欢和人互动玩耍。',
    'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '寻找领养', 36.0671, 120.3826],
  ['p015', '奥利奥', '奶牛猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '福州鼓楼区', '5.5km',
    '奥利奥黑白分明的毛色像一块大饼干。精力旺盛，喜欢跑酷和玩逗猫棒。有它在家里永远不会无聊。',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 26.0745, 119.2965],
  ['p016', '馒头', '柴犬', '2岁', 'male', '狗', '已绝育', '已疫苗', '大连甘井子区', '8.5km',
    '馒头是一只表情丰富的柴犬，招牌眯眯眼笑容特别治愈。性格独立但忠诚，是非常好的伴侣犬。',
    'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 38.9140, 121.6147],
  ['p017', '咪咪', '三花猫', '1岁半', 'female', '猫', '已绝育', '已疫苗', '厦门思明区', '3.2km',
    '咪咪是一只漂亮的三花猫，毛色分布像画一样美。性格文静温柔，喜欢安静地陪伴主人。',
    'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 24.4798, 118.0894],
  ['p018', '来福', '边境牧羊犬', '2岁半', 'male', '狗', '已绝育', '已疫苗', '合肥包河区', '10.0km',
    '来福是边牧中的聪明代表，会很多指令和把戏。精力充沛需要大量运动，适合有院子或爱户外的主人。',
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '寻找领养', 31.8206, 117.2272],
  ['p019', '汤圆', '银渐层', '10个月', 'male', '猫', '未绝育', '已疫苗', '昆明盘龙区', '4.8km',
    '汤圆是一只圆脸银渐层，银白色的毛发特别高贵。性格粘人，喜欢被抱着，是个会撒娇的小暖男。',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 25.0389, 102.7183],
  ['p020', '二丫', '中华田园犬', '2岁', 'female', '狗', '已绝育', '已疫苗', '南昌红谷滩区', '5.0km',
    '二丫是一只忠诚的田园犬，从农村救助站领回的。虽然不是什么名贵品种，但聪明机灵看家护院一级棒。',
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '寻找领养', 28.6820, 115.8579],
  ['p021', '跳跳', '安哥拉兔', '5个月', 'female', '其他', '未绝育', '未疫苗', '上海浦东新区', '2.5km',
    '跳跳是一只毛茸茸的长毛兔，毛发雪白蓬松像棉花糖。性格温和亲人，已学会在固定位置方便。',
    'https://images.unsplash.com/photo-1591382386627-349b692688ff?w=600&h=800&fit=crop', '寻找领养', 31.2304, 121.4737],
  ['p022', '波仔', '龙猫', '8个月', 'male', '其他', '未绝育', '不适用', '北京海淀区', '5.0km',
    '波仔是一只灰色的龙猫，圆圆的身体超级可爱。夜间活跃白天睡觉，适合上班族。饲养简单无异味。',
    'https://images.unsplash.com/photo-1504450874802-0ba2bcd9c5a0?w=600&h=800&fit=crop', '寻找领养', 39.9042, 116.4074],
  ['p023', '球球', '仓鼠', '3个月', 'male', '其他', '未绝育', '不适用', '武汉武昌区', '1.0km',
    '球球是一只金丝熊仓鼠，胖乎乎圆滚滚。饲养成本极低，只需要小笼子和基础粮食。非常适合学生党。',
    'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=600&h=800&fit=crop', '寻找领养', 30.5928, 114.3055],
  ['p024', '肉松', '刺猬', '6个月', 'female', '其他', '未绝育', '不适用', '杭州萧山区', '8.0km',
    '肉松是一只迷你非洲刺猬，小小的一只超级萌。不吵不闹没异味，是公寓饲养的完美选择。',
    'https://images.unsplash.com/photo-1591382386627-349b692688ff?w=600&h=800&fit=crop', '审核中', 30.2741, 120.1551],
  // ========== 上海 (+6) ==========
  ['p025', '乌龙', '英短蓝猫', '1岁半', 'male', '猫', '已绝育', '已疫苗', '上海徐汇区', '3.0km',
    '乌龙是一只圆脸英短，灰蓝色的毛发像毛绒玩具一样柔软。性格慵懒温顺，喜欢在沙发上陪着你看电视，是最佳宅家伴侣。',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '寻找领养', 31.1970, 121.4370],
  ['p026', '棉花糖', '贵宾犬', '1岁', 'female', '狗', '已绝育', '已疫苗', '上海静安区', '2.0km',
    '棉花糖是一只白色迷你贵宾，卷毛蓬松像一颗行走的棉花糖。性格粘人爱撒娇，喜欢赖在主人怀里。已做过美容造型。',
    'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '寻找领养', 31.2286, 121.4482],
  ['p027', '咖啡', '德文卷毛猫', '8个月', 'female', '猫', '未绝育', '已疫苗', '上海长宁区', '4.5km',
    '咖啡是一只精灵般的德文卷毛猫，大耳朵短卷毛，像小精灵一样可爱。极其粘人，总是跳上肩膀当围脖。智商超高会玩巡回游戏。',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 31.2184, 121.4160],
  ['p028', '豆沙', '博美犬', '10个月', 'male', '狗', '未绝育', '已疫苗', '上海杨浦区', '5.0km',
    '豆沙是一只金黄色的博美，毛量惊人像个小狮子。体型小巧适合公寓饲养。性格机警活泼，是个称职的小看门狗。',
    'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 31.2734, 121.5239],
  ['p029', '奶茶', '三花英短', '1岁', 'female', '猫', '已绝育', '已疫苗', '上海闵行区', '8.0km',
    '奶茶是一只三花色的英短，粉鼻子粉爪垫萌化人心。性格软糯好脾气，怎么撸都不生气。喜欢用头蹭人示好。',
    'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 31.1125, 121.3817],
  ['p030', '饭团', '西高地白梗', '2岁', 'male', '狗', '已绝育', '已疫苗', '上海普陀区', '6.0km',
    '饭团是一只雪白的西高地，活泼开朗像个永动机。对小孩和其他狗都很友善。已经完成基础训练，会随行和定点大小便。',
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '审核中', 31.2492, 121.4045],
  // ========== 北京 (+6) ==========
  ['p031', '包子', '异国短毛猫', '2岁', 'male', '猫', '已绝育', '已疫苗', '北京通州区', '4.0km',
    '包子是一只加菲猫，扁脸圆眼表情呆萌。性格温顺安静，不需要太多运动。在家就是吃饭睡觉求摸摸的佛系生活。',
    'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 39.9048, 116.6573],
  ['p032', '大熊', '金毛寻回犬', '2岁半', 'male', '狗', '已绝育', '已疫苗', '北京丰台区', '5.5km',
    '大熊是一只体格健壮的金毛，性格却温柔得像只大泰迪熊。喜欢游泳和捡球。已绝育身体健康，是完美的家庭伴侣犬。',
    'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=800&fit=crop', '寻找领养', 39.8585, 116.2870],
  ['p033', '雪梨', '缅因猫', '1岁半', 'female', '猫', '已绝育', '已疫苗', '北京大兴区', '8.0km',
    '雪梨是一只体型修长的缅因猫，毛发蓬松气质高贵。虽然体型大但性格温柔如水，被称为"温柔的巨人"。喜欢用尾巴勾人小腿。',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '寻找领养', 39.7282, 116.3386],
  ['p034', '皮皮', '迷你雪纳瑞', '3岁', 'male', '狗', '已绝育', '已疫苗', '北京昌平区', '10.0km',
    '皮皮是一只聪明的小雪纳瑞，胡子眉毛特别有范儿。不掉毛无体味，适合对狗毛过敏的家庭。已学会坐下握手趴下等指令。',
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '寻找领养', 40.2208, 116.2337],
  ['p035', '奶茶弟弟', '英短金渐层', '10个月', 'male', '猫', '未绝育', '已疫苗', '北京顺义区', '12.0km',
    '金渐层的毛发在阳光下闪闪发光，圆脸大眼睛颜值超高。性格活泼好动，喜欢玩逗猫棒和激光笔。已学会用猫砂盆和猫抓板。',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '审核中', 40.1300, 116.6544],
  ['p036', '乐乐', '巴哥犬', '1岁半', 'male', '狗', '已绝育', '已疫苗', '北京西城区', '3.0km',
    '乐乐是一只满脸褶子的小巴哥，表情永远忧郁但性格超欢乐。不需要大量运动，适合懒人饲养。打呼噜声音超级治愈。',
    'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 39.9134, 116.3661],
  // ========== 武汉 (+6) ==========
  ['p037', '糯米', '苏格兰折耳猫', '1岁', 'female', '猫', '已绝育', '已疫苗', '武汉江岸区', '3.0km',
    '糯米是一只折耳猫，圆圆的脸和折下来的小耳朵格外可爱。性格文静温柔，声音特别小，是个安静的小淑女。',
    'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 30.6000, 114.3050],
  ['p038', '北极', '阿拉斯加雪橇犬', '2岁', 'male', '狗', '已绝育', '已疫苗', '武汉硚口区', '6.0km',
    '北极是一只帅气的阿拉斯加，黑白配色威风凛凛。性格憨厚老实，对人特别友善。需要较大活动空间和每日运动量。',
    'https://images.unsplash.com/photo-1596492784531-6e6ce5e0f2b4?w=600&h=800&fit=crop', '寻找领养', 30.5756, 114.2631],
  ['p039', '小老虎', '狸花猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '武汉汉阳区', '5.5km',
    '小老虎是一只标准的大狸花，虎斑纹威风帅气。从小区楼下救助的流浪猫，生存能力强但特别亲人。会自己开门和开水龙头。',
    'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 30.5532, 114.2617],
  ['p040', '嘟嘟', '法国斗牛犬', '1岁', 'female', '狗', '未绝育', '已疫苗', '武汉青山区', '4.0km',
    '嘟嘟是一只奶油色的法斗，蝙蝠耳圆身子超级萌。性格温顺不爱叫，非常适合公寓。怕热怕冷需要室内饲养，是个精致小公举。',
    'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '寻找领养', 30.6390, 114.3947],
  ['p041', '果冻', '布偶猫', '8个月', 'male', '猫', '未绝育', '已疫苗', '武汉江夏区', '7.0km',
    '果冻是一只海豹双色布偶，蓝眼睛像宝石一样深邃。性格温顺粘人，一叫名字就跑过来。抱起来全身软塌塌的，名副其实的布偶猫。',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 30.3534, 114.3260],
  ['p042', '坦克', '罗威纳', '3岁', 'male', '狗', '已绝育', '已疫苗', '武汉东西湖区', '9.0km',
    '坦克是一只外表威武内心温柔的罗威纳。经过专业训练，服从性极高。忠诚护主但从不无故攻击。适合有养狗经验的主人。',
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '审核中', 30.6200, 114.1345],
  // ========== 杭州 (+5) ==========
  ['p043', '泡芙', '加菲猫', '1岁', 'female', '猫', '已绝育', '已疫苗', '杭州拱墅区', '2.0km',
    '泡芙是一只奶油色的加菲猫，大饼脸配上无辜的小眼神特别喜感。性格懒散佛系，每天除了吃就是睡，快乐的猫生不需要解释。',
    'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&h=800&fit=crop', '寻找领养', 30.3194, 120.1451],
  ['p044', '闪电', '杜宾犬', '1岁半', 'male', '狗', '未绝育', '已疫苗', '杭州滨江区', '5.0km',
    '闪电是一只身形矫健的杜宾，立耳断尾标准体型。智商极高学东西特别快。对主人绝对忠诚，是绝佳的护卫犬和伴侣犬。',
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '寻找领养', 30.2083, 120.2129],
  ['p045', '公主', '波斯猫', '2岁', 'female', '猫', '已绝育', '已疫苗', '杭州上城区', '3.5km',
    '公主是一只纯白波斯猫，长毛飘飘气质优雅。性格安静高贵，喜欢在窗边看风景。需要定期梳理毛发，是个精致的小公主。',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '寻找领养', 30.2478, 120.1696],
  ['p046', '奶瓶', '马尔济斯犬', '8个月', 'female', '狗', '未绝育', '已疫苗', '杭州余杭区', '6.0km',
    '奶瓶是一只雪白的马尔济斯，小小一只像奶瓶一样可爱。性格软萌粘人，喜欢被抱在怀里。不掉毛，适合精致的铲屎官。',
    'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 30.3318, 119.9785],
  ['p047', '冬瓜', '中华田园猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '杭州临平区', '10.0km',
    '冬瓜是一只在菜市场被发现的橘白田园猫。虽然不是什么名贵品种，但性格好到爆。随便抱随便撸，还会用爪子轻轻拍你求关注。',
    'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 30.4295, 120.2990],
  // ========== 成都 (+5) ==========
  ['p048', '火锅', '挪威森林猫', '1岁半', 'male', '猫', '已绝育', '已疫苗', '成都武侯区', '4.0km',
    '火锅是一只长毛挪威森林猫，尾巴蓬松像鸡毛掸子。性格独立但不冷漠，想被摸时会主动蹭过来。不掉毛是意外惊喜。',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 30.6430, 104.0481],
  ['p049', '大黄', '中华田园犬', '3岁', 'male', '狗', '已绝育', '已疫苗', '成都金牛区', '5.0km',
    '大黄是一只忠诚的田园犬，黄毛大耳朵笑起来特别治愈。从工地上救助的流浪狗，特别懂得感恩。看家护院一级棒。',
    'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=800&fit=crop', '寻找领养', 30.6949, 104.0510],
  ['p050', '翠花', '虎皮鹦鹉', '4个月', 'female', '其他', '不适用', '不适用', '成都成华区', '2.5km',
    '翠花是一只蓝绿色虎皮鹦鹉，已经会学舌说你好和恭喜发财。饲养简单成本低，笼养即可不需要遛。喜欢站在人手上玩。',
    'https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=600&h=800&fit=crop', '寻找领养', 30.6603, 104.1019],
  ['p051', '毛球', '约克夏梗', '10个月', 'female', '狗', '未绝育', '已疫苗', '成都双流区', '7.0km',
    '毛球是只迷你约克夏，丝质长毛可以扎小辫子。体型超级小可以放进包包里。性格活泼机灵，是个会走路的时尚单品。',
    'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '审核中', 30.5753, 103.9238],
  ['p052', '小白', '白兔', '3个月', 'female', '其他', '未绝育', '不适用', '成都龙泉驿区', '6.0km',
    '小白是一只纯白侏儒兔，红眼睛粉耳朵像小天使。性格温顺会认人，已学会在固定角落上厕所。饲养成本低适合新手。',
    'https://images.unsplash.com/photo-1591382386627-349b692688ff?w=600&h=800&fit=crop', '寻找领养', 30.5574, 104.2715],
];
seedPets.forEach(p => insertPet.run(...p));

// 更新已有宠物的 category 字段（兼容旧数据）
db.prepare("UPDATE pets SET category = '猫' WHERE category IS NULL AND breed LIKE '%猫%'").run();
db.prepare("UPDATE pets SET category = '狗' WHERE category IS NULL AND breed LIKE '%犬%' OR breed LIKE '%金毛%' OR breed LIKE '%柯基%' OR breed LIKE '%哈士奇%' OR breed LIKE '%萨摩耶%' OR breed LIKE '%拉布拉多%' OR breed LIKE '%比格%'").run();
db.prepare("UPDATE pets SET category = '其他' WHERE category IS NULL").run();

console.log('种子宠物数据已就绪');

// ==================== 城市坐标库 & 距离计算 ====================
// 中国主要城市中心坐标 (lat, lon)
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
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 托管前端页面
app.use(express.static(path.join(__dirname, '..')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: '该邮箱已被注册' });

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, name, email, passwordHash);
    const user = db.prepare('SELECT id, name, email, phone, avatar_url, city, created_at FROM users WHERE id = ?').get(id);

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

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, avatar_url, city, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

// ==================== 宠物路由 ====================

app.get('/api/pets', (req, res) => {
  try {
    let sql = 'SELECT * FROM pets WHERE is_deleted = 0';
    const params = [];
    if (req.query.status && req.query.status !== '全部') { sql += ' AND status = ?'; params.push(req.query.status); }
    if (req.query.category && req.query.category !== '全部') { sql += ' AND category = ?'; params.push(req.query.category); }
    if (req.query.search) { sql += ' AND (name LIKE ? OR breed LIKE ?)'; params.push('%' + req.query.search + '%', '%' + req.query.search + '%'); }

    const userLat = parseFloat(req.query.userLat) || 0;
    const userLon = parseFloat(req.query.userLon) || 0;
    const userCity = req.query.userCity || '';
    const filterMode = req.query.filter || 'all'; // 'all' | 'city'

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countSql).all(...params)[0].total;
    sql += ' ORDER BY created_at DESC';

    let pets = db.prepare(sql).all(...params);

    // 为每个宠物计算距离和位置展示格式
    pets = pets.map(function(p) {
      var dist = '未知';
      var locationDisplay = p.location;
      if (userLat && userLon && p.latitude && p.longitude && !(p.latitude === 0 && p.longitude === 0)) {
        dist = (haversineKm(userLat, userLon, p.latitude, p.longitude)).toFixed(1) + 'km';
      }
      // 判断是否同城
      var isSameCity = userCity && (p.location.indexOf(userCity) !== -1 || (findCityCoord(userCity) && findCityCoord(p.location) && findCityCoord(userCity).city === findCityCoord(p.location).city));
      if (isSameCity) {
        locationDisplay = p.location;
      } else {
        // 不同城：显示省+市格式（从坐标反查）
        var coord = findCityCoord(p.location);
        locationDisplay = coord ? coord.city : p.location;
      }
      return Object.assign({}, p, { distance: dist, locationDisplay: locationDisplay, isSameCity: isSameCity });
    });

    // 同城模式：过滤并排序
    if (filterMode === 'city' && userCity) {
      pets = pets.filter(function(p) { return p.isSameCity; });
      // 同城按距离排序（有距离的在前）
      pets.sort(function(a, b) {
        var dA = parseFloat(a.distance) || 9999;
        var dB = parseFloat(b.distance) || 9999;
        return dA - dB;
      });
    }

    // 分页
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

app.get('/api/pets/:id', (req, res) => {
  const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND is_deleted = 0').get(req.params.id);
  if (!pet) return res.status(404).json({ error: '宠物不存在' });
  res.json({ pet });
});

app.post('/api/pets', authMiddleware, upload.single('image'), (req, res) => {
  try {
    const { name, breed, age, gender, category, location, story, latitude, longitude } = req.body;
    if (!name || !breed || !age || !gender || !location) {
      return res.status(400).json({ error: '请填写所有必填项' });
    }
    let imageUrl = req.body.image_url || '';
    if (req.file) imageUrl = '/uploads/' + req.file.filename;
    const id = uuidv4();

    // 解析经纬度：优先使用前端传入的，否则从城市坐标库查找，最后默认0
    let lat = parseFloat(latitude) || 0;
    let lon = parseFloat(longitude) || 0;
    if ((lat === 0 && lon === 0) || isNaN(lat)) {
      const coord = findCityCoord(location);
      if (coord) { lat = coord.lat; lon = coord.lon; }
    }

    db.prepare(
      'INSERT INTO pets (id, name, breed, age, gender, category, location, story, image_url, publisher_id, status, latitude, longitude) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(id, name, breed, age, gender, category || '猫', location, story || '', imageUrl, req.user.id, '审核中', lat, lon);

    // 自动发送一条系统通知：宠物发布成功，正在审核中
    db.prepare(
      'INSERT INTO messages (id, sender_id, receiver_id, content, type, is_read) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), null, req.user.id, '您的宠物「' + name + '」已发布成功，正在审核中，审核通过后将在首页展示。', 'notification', 0);

    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(id);
    res.status(201).json({ pet });
  } catch (err) {
    console.error('发布宠物失败:', err);
    res.status(500).json({ error: '发布失败' });
  }
});

// ==================== 领养申请路由 ====================

app.get('/api/applications', authMiddleware, (req, res) => {
  try {
    const apps = db.prepare(
      'SELECT a.*, p.name as pet_name, p.breed as pet_breed, p.age as pet_age, p.gender as pet_gender, p.category as pet_category, p.image_url as pet_image_url FROM applications a LEFT JOIN pets p ON a.pet_id = p.id WHERE a.user_id = ? ORDER BY a.created_at DESC'
    ).all(req.user.id);
    // 转换格式以匹配前端期望
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

app.post('/api/applications', authMiddleware, (req, res) => {
  try {
    const { pet_id, applicant_name, applicant_phone, housing_type, has_balcony_net,
      has_pet_experience, current_pets, family_support, has_allergies,
      daily_time, motivation, signature_data } = req.body;

    if (!pet_id || !applicant_name || !applicant_phone || !housing_type) {
      return res.status(400).json({ error: '请填写所有必填项' });
    }

    const id = uuidv4();
    db.prepare(
      'INSERT INTO applications (id, user_id, pet_id, applicant_name, applicant_phone, housing_type, has_balcony_net, has_pet_experience, current_pets, family_support, has_allergies, daily_time, motivation, signature_data, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(id, req.user.id, pet_id, applicant_name, applicant_phone, housing_type,
      has_balcony_net ? 1 : 0, has_pet_experience ? 1 : 0, current_pets || '',
      family_support || '', has_allergies || 'no', daily_time || '',
      motivation || '', signature_data || '', '审核中');

    // 发送系统通知
    db.prepare(
      'INSERT INTO messages (id, receiver_id, content, type) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), req.user.id,
      '你的领养申请（' + applicant_name + '）已成功提交，我们会尽快审核。', 'notification');

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    res.status(201).json({ application: app, message: '申请提交成功！' });
  } catch (err) {
    console.error('提交申请失败:', err);
    res.status(500).json({ error: '提交失败' });
  }
});

// ==================== 收藏路由 ====================

app.get('/api/favorites', authMiddleware, (req, res) => {
  try {
    const favs = db.prepare(
      'SELECT f.*, p.id as pet_id, p.name as pet_name, p.breed as pet_breed, p.age as pet_age, p.gender as pet_gender, p.category as pet_category, p.neutered as pet_neutered, p.vaccine as pet_vaccine, p.location as pet_location, p.story as pet_story, p.image_url as pet_image_url, p.status as pet_status FROM favorites f LEFT JOIN pets p ON f.pet_id = p.id WHERE f.user_id = ? AND p.is_deleted = 0 ORDER BY f.created_at DESC'
    ).all(req.user.id);
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

app.post('/api/favorites', authMiddleware, (req, res) => {
  try {
    const { pet_id } = req.body;
    if (!pet_id) return res.status(400).json({ error: '缺少宠物ID' });
    const id = uuidv4();
    db.prepare('INSERT OR IGNORE INTO favorites (id, user_id, pet_id) VALUES (?, ?, ?)').run(id, req.user.id, pet_id);
    const fav = db.prepare('SELECT * FROM favorites WHERE id = ?').get(id) || { user_id: req.user.id, pet_id };
    res.status(201).json({ favorite: fav });
  } catch (err) {
    res.status(500).json({ error: '收藏失败' });
  }
});

app.delete('/api/favorites/:petId', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND pet_id = ?').run(req.user.id, req.params.petId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '取消收藏失败' });
  }
});

app.get('/api/favorites/check/:petId', authMiddleware, (req, res) => {
  try {
    const fav = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND pet_id = ?').get(req.user.id, req.params.petId);
    res.json({ isFavorited: !!fav });
  } catch (err) {
    res.status(500).json({ error: '检查收藏状态失败' });
  }
});

app.get('/api/favorites/ids', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare('SELECT pet_id FROM favorites WHERE user_id = ?').all(req.user.id);
    res.json({ ids: rows.map(r => r.pet_id) });
  } catch (err) {
    res.status(500).json({ error: '获取收藏ID列表失败' });
  }
});

// ==================== 消息路由 ====================

app.get('/api/messages/unread-count', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0').get(req.user.id);
    res.json({ count: row.count });
  } catch (err) {
    res.status(500).json({ error: '获取未读消息数失败' });
  }
});

app.get('/api/messages', authMiddleware, (req, res) => {
  try {
    const msgs = db.prepare(
      'SELECT * FROM messages WHERE receiver_id = ? OR sender_id = ? ORDER BY created_at DESC'
    ).all(req.user.id, req.user.id);
    res.json({ messages: msgs });
  } catch (err) {
    res.status(500).json({ error: '获取消息列表失败' });
  }
});

app.post('/api/messages', authMiddleware, (req, res) => {
  try {
    const { receiver_id, content, type } = req.body;
    if (!content) return res.status(400).json({ error: '消息内容不能为空' });
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, sender_id, receiver_id, content, type) VALUES (?,?,?,?,?)')
      .run(id, req.user.id, receiver_id || null, content, type || 'chat');
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    res.status(201).json({ message: msg });
  } catch (err) {
    res.status(500).json({ error: '发送消息失败' });
  }
});

// ==================== 领养成功路由 ====================

app.get('/api/adoptions', authMiddleware, (req, res) => {
  try {
    const adops = db.prepare(
      'SELECT a.*, p.name as pet_name, p.breed as pet_breed, p.image_url as pet_image_url FROM adoptions a LEFT JOIN pets p ON a.pet_id = p.id WHERE a.user_id = ? ORDER BY a.created_at DESC'
    ).all(req.user.id);
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

// 获取当前用户发布的宠物
app.get('/api/pets/mine', authMiddleware, (req, res) => {
  try {
    const pets = db.prepare('SELECT * FROM pets WHERE publisher_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(req.user.id);
    res.json({ pets });
  } catch (err) {
    res.status(500).json({ error: '获取我的发布失败' });
  }
});

// 更新用户资料
app.put('/api/user/profile', authMiddleware, (req, res) => {
  try {
    const { name, phone, city } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (city !== undefined) { updates.push('city = ?'); params.push(city); }
    if (updates.length === 0) { return res.status(400).json({ error: '没有需要更新的字段' }); }
    updates.push("updated_at = datetime('now')");
    params.push(req.user.id);
    db.prepare('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
    const user = db.prepare('SELECT id, name, email, phone, avatar_url, city, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json({ user });
  } catch (err) {
    console.error('更新用户资料失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 上传用户头像
app.post('/api/user/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择头像文件' });
    const avatarUrl = '/uploads/' + req.file.filename;
    db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?").run(avatarUrl, req.user.id);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    res.status(500).json({ error: '上传头像失败' });
  }
});

// ==================== 用户统计 ====================

app.get('/api/user/stats', authMiddleware, (req, res) => {
  try {
    const appCount = db.prepare('SELECT COUNT(*) as count FROM applications WHERE user_id = ?').get(req.user.id).count;
    const favCount = db.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?').get(req.user.id).count;
    const adoptionCount = db.prepare('SELECT COUNT(*) as count FROM adoptions WHERE user_id = ?').get(req.user.id).count;
    const publishCount = db.prepare('SELECT COUNT(*) as count FROM pets WHERE publisher_id = ? AND is_deleted = 0').get(req.user.id).count;
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
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'PawConnect API', db: 'SQLite' });
});

app.use((req, res) => res.status(404).json({ error: '接口不存在' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: '服务器内部错误' }); });

app.listen(PORT, () => {
  console.log('');
  console.log('===========================================');
  console.log('  PawConnect API 服务已启动!');
  console.log('  地址: http://localhost:' + PORT);
  console.log('  健康检查: http://localhost:' + PORT + '/api/health');
  console.log('  数据库: SQLite (pawconnect.db)');
  console.log('===========================================');
  console.log('');
});
