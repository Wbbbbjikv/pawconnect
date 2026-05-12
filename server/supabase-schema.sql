-- =====================================================
-- PawConnect 数据库 Schema (Supabase PostgreSQL)
-- 在 Supabase SQL Editor 中执行此文件
-- =====================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT DEFAULT '',
  city VARCHAR(20) DEFAULT '上海',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 宠物表
CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  breed VARCHAR(50) NOT NULL,
  age VARCHAR(20) NOT NULL,
  category VARCHAR(10) DEFAULT '猫' CHECK (category IN ('猫', '狗', '其他')),
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
  neutered VARCHAR(20) DEFAULT '未绝育',
  vaccine VARCHAR(50) DEFAULT '未知',
  location VARCHAR(100) NOT NULL,
  distance VARCHAR(20) DEFAULT '未知',
  story TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT '寻找领养' CHECK (status IN ('寻找领养', '审核中', '已领养')),
  publisher_id TEXT REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT false,
  latitude REAL DEFAULT 0,
  longitude REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 领养申请表
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) NOT NULL,
  pet_id TEXT REFERENCES pets(id) NOT NULL,
  applicant_name VARCHAR(50) NOT NULL,
  applicant_phone VARCHAR(20) NOT NULL,
  housing_type VARCHAR(30) NOT NULL,
  has_balcony_net BOOLEAN DEFAULT false,
  has_pet_experience BOOLEAN DEFAULT false,
  current_pets VARCHAR(50) DEFAULT '',
  family_support VARCHAR(30) DEFAULT '',
  has_allergies VARCHAR(10) DEFAULT 'no',
  daily_time VARCHAR(20) DEFAULT '',
  motivation TEXT DEFAULT '',
  signature_data TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT '审核中' CHECK (status IN ('审核中', '通过初审', '已通过', '未通过', '已取消')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) NOT NULL,
  pet_id TEXT REFERENCES pets(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pet_id)
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT REFERENCES users(id),
  receiver_id TEXT REFERENCES users(id),
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'notification' CHECK (type IN ('notification', 'chat', 'system')),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 领养成功记录表
CREATE TABLE IF NOT EXISTS adoptions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) NOT NULL,
  pet_id TEXT REFERENCES pets(id) NOT NULL,
  adoption_number VARCHAR(30) UNIQUE NOT NULL,
  adoption_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_pets_status ON pets(status);
CREATE INDEX IF NOT EXISTS idx_pets_location ON pets(location);
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_pet ON applications(pet_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- 自动更新 updated_at 的函数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为各表添加自动更新触发器
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pets_updated_at') THEN
    CREATE TRIGGER trg_pets_updated_at BEFORE UPDATE ON pets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_applications_updated_at') THEN
    CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- =====================================================
-- 种子数据 (52 条宠物)
-- =====================================================
INSERT INTO pets (id, name, breed, age, gender, category, neutered, vaccine, location, distance, story, image_url, status, latitude, longitude) VALUES
('p001', '小橘子', '橘猫', '1岁', 'female', '猫', '已绝育', '已疫苗', '上海浦东新区', '2.5km', '小橘子在一个下雨天被发现蜷缩在停车场的角落，当时它又饿又冷。被救助后，它展现了极其亲人的性格，总是第一个跑到笼子前迎接志愿者。', 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 31.2304, 121.4737),
('p002', '奶盖', '布偶猫', '6个月', 'female', '猫', '已绝育', '已疫苗', '北京朝阳区', '3.8km', '奶盖是一只颜值超高的布偶猫，蓝眼睛像宝石一样美丽。性格温柔粘人，喜欢跟在人后面走来走去。已经习惯家庭生活，会用猫砂盆。', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 39.9042, 116.4074),
('p003', '旺财', '比格犬', '8个月', 'male', '狗', '未绝育', '已疫苗', '武汉洪山区', '5.1km', '旺财是一只精力充沛的小比格，最喜欢追飞盘和在草地上打滚。从繁殖场救出，经过细心照料，现在已经是健康快乐的小狗了。', 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '寻找领养', 30.5928, 114.3055),
('p004', '蓝胖子', '英国短毛猫', '2岁', 'male', '猫', '已绝育', '驱虫完成', '杭州西湖区', '1.2km', '蓝胖子性格沉稳，圆脸圆眼，特别招人喜欢。原主人因工作调动出国无法带走它。非常安静，不拆家不闹腾，喜欢在窗台晒太阳。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 30.2741, 120.1551),
('p005', '布丁', '金毛', '3个月', 'female', '狗', '未绝育', '第一针疫苗', '成都锦江区', '8.0km', '布丁是一只超萌的金毛小奶狗，毛茸茸的身体就像一颗行走的布丁。和兄弟姐妹一起被遗弃在公园的纸箱里，现在已健康长大。', 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=800&fit=crop', '寻找领养', 30.5728, 104.0668),
('p006', '芝麻', '暹罗猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '广州天河区', '6.5km', '芝麻是个小话痨，喜欢喵喵叫跟你聊天。暹罗猫天性活泼好动。从小区救助的流浪猫，现在已完全适应室内生活，性格亲人。', 'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 23.1291, 113.2644),
('p007', '大壮', '哈士奇', '1岁半', 'male', '狗', '已绝育', '已疫苗', '南京鼓楼区', '12.0km', '大壮是一只表情丰富的二哈。精力极其旺盛，需要每天大量运动。原主人因工作太忙无法照顾。适合喜欢户外运动的家庭。', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '寻找领养', 32.0603, 118.7969),
('p008', '豆豆', '柯基', '2岁', 'female', '狗', '已绝育', '已疫苗', '深圳南山区', '4.2km', '豆豆是一只短腿小柯基，屁股扭起来超级可爱。性格开朗活泼，对小孩子特别友好。已训练有素，是非常理想的家庭伴侣犬。', 'https://images.unsplash.com/photo-1612536057832-2ff7ead58194?w=600&h=800&fit=crop', '寻找领养', 22.5431, 114.0579),
('p009', '年糕', '美短', '8个月', 'male', '猫', '未绝育', '已疫苗', '西安雁塔区', '2.0km', '年糕是一只圆滚滚的美短，银白色虎斑纹特别帅气。性格独立但不冷漠，想被摸的时候会主动蹭过来。已恢复健康。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 34.3416, 108.9398),
('p010', '雪球', '萨摩耶', '1岁', 'female', '狗', '已绝育', '已疫苗', '重庆渝中区', '15.0km', '雪球是一只笑容治愈的萨摩耶，一身雪白的毛发特别漂亮。从狗肉馆救出，经过半年的心理疏导和身体治疗，现在已是健康的快乐狗狗。', 'https://images.unsplash.com/photo-1596492784531-6e6ce5e0f2b4?w=600&h=800&fit=crop', '寻找领养', 29.4316, 106.9123),
('p011', '团子', '拉布拉多', '3岁', 'female', '狗', '已绝育', '已疫苗', '长沙岳麓区', '7.0km', '团子性格温和稳重，是一只非常听话的拉布拉多。曾经是导盲犬预备犬，训练有素。原主人因出国无法继续饲养，希望能找到永远的家。', 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=600&h=800&fit=crop', '寻找领养', 28.2282, 112.9388),
('p012', '墨墨', '黑猫', '2岁', 'male', '猫', '已绝育', '已疫苗', '苏州姑苏区', '3.5km', '墨墨全身乌黑发亮，金色眼睛特别迷人。性格安静内敛，喜欢安静地陪在你身边。从老城区救助，已经习惯室内生活。', 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&h=800&fit=crop', '寻找领养', 31.2990, 120.5853),
('p013', '元宝', '橘猫', '3岁', 'male', '猫', '已绝育', '已疫苗', '天津南开区', '4.0km', '元宝是一只胖乎乎的橘猫，特别能吃。性格慵懒佛系，最喜欢在阳光下午睡。性格特别好，随便撸不生气。', 'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 39.3434, 117.3616),
('p014', '可乐', '泰迪', '1岁', 'female', '狗', '已绝育', '已疫苗', '青岛崂山区', '6.0km', '可乐是一只聪明的小泰迪，卷卷的毛发像泰迪熊一样可爱。活泼好动，喜欢和人互动玩耍。', 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '寻找领养', 36.0671, 120.3826),
('p015', '奥利奥', '奶牛猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '福州鼓楼区', '5.5km', '奥利奥黑白分明的毛色像一块大饼干。精力旺盛，喜欢跑酷和玩逗猫棒。有它在家里永远不会无聊。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 26.0745, 119.2965),
('p016', '馒头', '柴犬', '2岁', 'male', '狗', '已绝育', '已疫苗', '大连甘井子区', '8.5km', '馒头是一只表情丰富的柴犬，招牌眯眯眼笑容特别治愈。性格独立但忠诚，是非常好的伴侣犬。', 'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 38.9140, 121.6147),
('p017', '咪咪', '三花猫', '1岁半', 'female', '猫', '已绝育', '已疫苗', '厦门思明区', '3.2km', '咪咪是一只漂亮的三花猫，毛色分布像画一样美。性格文静温柔，喜欢安静地陪伴主人。', 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 24.4798, 118.0894),
('p018', '来福', '边境牧羊犬', '2岁半', 'male', '狗', '已绝育', '已疫苗', '合肥包河区', '10.0km', '来福是边牧中的聪明代表，会很多指令和把戏。精力充沛需要大量运动，适合有院子或爱户外的主人。', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '寻找领养', 31.8206, 117.2272),
('p019', '汤圆', '银渐层', '10个月', 'male', '猫', '未绝育', '已疫苗', '昆明盘龙区', '4.8km', '汤圆是一只圆脸银渐层，银白色的毛发特别高贵。性格粘人，喜欢被抱着，是个会撒娇的小暖男。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中', 25.0389, 102.7183),
('p020', '二丫', '中华田园犬', '2岁', 'female', '狗', '已绝育', '已疫苗', '南昌红谷滩区', '5.0km', '二丫是一只忠诚的田园犬，从农村救助站领回的。虽然不是什么名贵品种，但聪明机灵看家护院一级棒。', 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '寻找领养', 28.6820, 115.8579),
('p021', '跳跳', '安哥拉兔', '5个月', 'female', '其他', '未绝育', '未疫苗', '上海浦东新区', '2.5km', '跳跳是一只毛茸茸的长毛兔，毛发雪白蓬松像棉花糖。性格温和亲人，已学会在固定位置方便。', 'https://images.unsplash.com/photo-1591382386627-349b692688ff?w=600&h=800&fit=crop', '寻找领养', 31.2304, 121.4737),
('p022', '波仔', '龙猫', '8个月', 'male', '其他', '未绝育', '不适用', '北京海淀区', '5.0km', '波仔是一只灰色的龙猫，圆圆的身体超级可爱。夜间活跃白天睡觉，适合上班族。饲养简单无异味。', 'https://images.unsplash.com/photo-1504450874802-0ba2bcd9c5a0?w=600&h=800&fit=crop', '寻找领养', 39.9042, 116.4074),
('p023', '球球', '仓鼠', '3个月', 'male', '其他', '未绝育', '不适用', '武汉武昌区', '1.0km', '球球是一只金丝熊仓鼠，胖乎乎圆滚滚。饲养成本极低，只需要小笼子和基础粮食。非常适合学生党。', 'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=600&h=800&fit=crop', '寻找领养', 30.5928, 114.3055),
('p024', '肉松', '刺猬', '6个月', 'female', '其他', '未绝育', '不适用', '杭州萧山区', '8.0km', '肉松是一只迷你非洲刺猬，小小的一只超级萌。不吵不闹没异味，是公寓饲养的完美选择。', 'https://images.unsplash.com/photo-1591382386627-349b692688ff?w=600&h=800&fit=crop', '审核中', 30.2741, 120.1551),
('p025', '乌龙', '英短蓝猫', '1岁半', 'male', '猫', '已绝育', '已疫苗', '上海徐汇区', '3.0km', '乌龙是一只圆脸英短，灰蓝色的毛发像毛绒玩具一样柔软。性格慵懒温顺，喜欢在沙发上陪着你看电视，是最佳宅家伴侣。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '寻找领养', 31.1970, 121.4370),
('p026', '棉花糖', '贵宾犬', '1岁', 'female', '狗', '已绝育', '已疫苗', '上海静安区', '2.0km', '棉花糖是一只白色迷你贵宾，卷毛蓬松像一颗行走的棉花糖。性格粘人爱撒娇，喜欢赖在主人怀里。已做过美容造型。', 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '寻找领养', 31.2286, 121.4482),
('p027', '咖啡', '德文卷毛猫', '8个月', 'female', '猫', '未绝育', '已疫苗', '上海长宁区', '4.5km', '咖啡是一只精灵般的德文卷毛猫，大耳朵短卷毛，像小精灵一样可爱。极其粘人，总是跳上肩膀当围脖。智商超高会玩巡回游戏。', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 31.2184, 121.4160),
('p028', '豆沙', '博美犬', '10个月', 'male', '狗', '未绝育', '已疫苗', '上海杨浦区', '5.0km', '豆沙是一只金黄色的博美，毛量惊人像个小狮子。体型小巧适合公寓饲养。性格机警活泼，是个称职的小看门狗。', 'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 31.2734, 121.5239),
('p029', '奶茶', '三花英短', '1岁', 'female', '猫', '已绝育', '已疫苗', '上海闵行区', '8.0km', '奶茶是一只三花色的英短，粉鼻子粉爪垫萌化人心。性格软糯好脾气，怎么撸都不生气。喜欢用头蹭人示好。', 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 31.1125, 121.3817),
('p030', '饭团', '西高地白梗', '2岁', 'male', '狗', '已绝育', '已疫苗', '上海普陀区', '6.0km', '饭团是一只雪白的西高地，活泼开朗像个永动机。对小孩和其他狗都很友善。已经完成基础训练，会随行和定点大小便。', 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '审核中', 31.2492, 121.4045),
('p031', '包子', '异国短毛猫', '2岁', 'male', '猫', '已绝育', '已疫苗', '北京通州区', '4.0km', '包子是一只加菲猫，扁脸圆眼表情呆萌。性格温顺安静，不需要太多运动。在家就是吃饭睡觉求摸摸的佛系生活。', 'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 39.9048, 116.6573),
('p032', '大熊', '金毛寻回犬', '2岁半', 'male', '狗', '已绝育', '已疫苗', '北京丰台区', '5.5km', '大熊是一只体格健壮的金毛，性格却温柔得像只大泰迪熊。喜欢游泳和捡球。已绝育身体健康，是完美的家庭伴侣犬。', 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=800&fit=crop', '寻找领养', 39.8585, 116.2870),
('p033', '雪梨', '缅因猫', '1岁半', 'female', '猫', '已绝育', '已疫苗', '北京大兴区', '8.0km', '雪梨是一只体型修长的缅因猫，毛发蓬松气质高贵。虽然体型大但性格温柔如水，被称为温柔的巨人。喜欢用尾巴勾人小腿。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '寻找领养', 39.7282, 116.3386),
('p034', '皮皮', '迷你雪纳瑞', '3岁', 'male', '狗', '已绝育', '已疫苗', '北京昌平区', '10.0km', '皮皮是一只聪明的小雪纳瑞，胡子眉毛特别有范儿。不掉毛无体味，适合对狗毛过敏的家庭。已学会坐下握手趴下等指令。', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '寻找领养', 40.2208, 116.2337),
('p035', '奶茶弟弟', '英短金渐层', '10个月', 'male', '猫', '未绝育', '已疫苗', '北京顺义区', '12.0km', '金渐层的毛发在阳光下闪闪发光，圆脸大眼睛颜值超高。性格活泼好动，喜欢玩逗猫棒和激光笔。已学会用猫砂盆和猫抓板。', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '审核中', 40.1300, 116.6544),
('p036', '乐乐', '巴哥犬', '1岁半', 'male', '狗', '已绝育', '已疫苗', '北京西城区', '3.0km', '乐乐是一只满脸褶子的小巴哥，表情永远忧郁但性格超欢乐。不需要大量运动，适合懒人饲养。打呼噜声音超级治愈。', 'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 39.9134, 116.3661),
('p037', '糯米', '苏格兰折耳猫', '1岁', 'female', '猫', '已绝育', '已疫苗', '武汉江岸区', '3.0km', '糯米是一只折耳猫，圆圆的脸和折下来的小耳朵格外可爱。性格文静温柔，声音特别小，是个安静的小淑女。', 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 30.6000, 114.3050),
('p038', '北极', '阿拉斯加雪橇犬', '2岁', 'male', '狗', '已绝育', '已疫苗', '武汉硚口区', '6.0km', '北极是一只帅气的阿拉斯加，黑白配色威风凛凛。性格憨厚老实，对人特别友善。需要较大活动空间和每日运动量。', 'https://images.unsplash.com/photo-1596492784531-6e6ce5e0f2b4?w=600&h=800&fit=crop', '寻找领养', 30.5756, 114.2631),
('p039', '小老虎', '狸花猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '武汉汉阳区', '5.5km', '小老虎是一只标准的大狸花，虎斑纹威风帅气。从小区楼下救助的流浪猫，生存能力强但特别亲人。会自己开门和开水龙头。', 'https://images.unsplash.com/photo-1577023311546-cdc07a8454d6?w=600&h=800&fit=crop', '寻找领养', 30.5532, 114.2617),
('p040', '嘟嘟', '法国斗牛犬', '1岁', 'female', '狗', '未绝育', '已疫苗', '武汉青山区', '4.0km', '嘟嘟是一只奶油色的法斗，蝙蝠耳圆身子超级萌。性格温顺不爱叫，非常适合公寓。怕热怕冷需要室内饲养，是个精致小公举。', 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '寻找领养', 30.6390, 114.3947),
('p041', '果冻', '布偶猫', '8个月', 'male', '猫', '未绝育', '已疫苗', '武汉江夏区', '7.0km', '果冻是一只海豹双色布偶，蓝眼睛像宝石一样深邃。性格温顺粘人，一叫名字就跑过来。抱起来全身软塌塌的，名副其实的布偶猫。', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 30.3534, 114.3260),
('p042', '坦克', '罗威纳', '3岁', 'male', '狗', '已绝育', '已疫苗', '武汉东西湖区', '9.0km', '坦克是一只外表威武内心温柔的罗威纳。经过专业训练，服从性极高。忠诚护主但从不无故攻击。适合有养狗经验的主人。', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=800&fit=crop', '审核中', 30.6200, 114.1345),
('p043', '泡芙', '加菲猫', '1岁', 'female', '猫', '已绝育', '已疫苗', '杭州拱墅区', '2.0km', '泡芙是一只奶油色的加菲猫，大饼脸配上无辜的小眼神特别喜感。性格懒散佛系，每天除了吃就是睡，快乐的猫生不需要解释。', 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&h=800&fit=crop', '寻找领养', 30.3194, 120.1451),
('p044', '闪电', '杜宾犬', '1岁半', 'male', '狗', '未绝育', '已疫苗', '杭州滨江区', '5.0km', '闪电是一只身形矫健的杜宾，立耳断尾标准体型。智商极高学东西特别快。对主人绝对忠诚，是绝佳的护卫犬和伴侣犬。', 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '寻找领养', 30.2083, 120.2129),
('p045', '公主', '波斯猫', '2岁', 'female', '猫', '已绝育', '已疫苗', '杭州上城区', '3.5km', '公主是一只纯白波斯猫，长毛飘飘气质优雅。性格安静高贵，喜欢在窗边看风景。需要定期梳理毛发，是个精致的小公主。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '寻找领养', 30.2478, 120.1696),
('p046', '奶瓶', '马尔济斯犬', '8个月', 'female', '狗', '未绝育', '已疫苗', '杭州余杭区', '6.0km', '奶瓶是一只雪白的马尔济斯，小小一只像奶瓶一样可爱。性格软萌粘人，喜欢被抱在怀里。不掉毛，适合精致的铲屎官。', 'https://images.unsplash.com/photo-1618173745201-8e2424e2e97f?w=600&h=800&fit=crop', '寻找领养', 30.3318, 119.9785),
('p047', '冬瓜', '中华田园猫', '1岁', 'male', '猫', '已绝育', '已疫苗', '杭州临平区', '10.0km', '冬瓜是一只在菜市场被发现的橘白田园猫。虽然不是什么名贵品种，但性格好到爆。随便抱随便撸，还会用爪子轻轻拍你求关注。', 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养', 30.4295, 120.2990),
('p048', '火锅', '挪威森林猫', '1岁半', 'male', '猫', '已绝育', '已疫苗', '成都武侯区', '4.0km', '火锅是一只长毛挪威森林猫，尾巴蓬松像鸡毛掸子。性格独立但不冷漠，想被摸时会主动蹭过来。不掉毛是意外惊喜。', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=800&fit=crop', '寻找领养', 30.6430, 104.0481),
('p049', '大黄', '中华田园犬', '3岁', 'male', '狗', '已绝育', '已疫苗', '成都金牛区', '5.0km', '大黄是一只忠诚的田园犬，黄毛大耳朵笑起来特别治愈。从工地上救助的流浪狗，特别懂得感恩。看家护院一级棒。', 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=800&fit=crop', '寻找领养', 30.6949, 104.0510),
('p050', '翠花', '虎皮鹦鹉', '4个月', 'female', '其他', '不适用', '不适用', '成都成华区', '2.5km', '翠花是一只蓝绿色虎皮鹦鹉，已经会学舌说你好和恭喜发财。饲养简单成本低，笼养即可不需要遛。喜欢站在人手上玩。', 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=600&h=800&fit=crop', '寻找领养', 30.6603, 104.1019),
('p051', '毛球', '约克夏梗', '10个月', 'female', '狗', '未绝育', '已疫苗', '成都双流区', '7.0km', '毛球是只迷你约克夏，丝质长毛可以扎小辫子。体型超级小可以放进包包里。性格活泼机灵，是个会走路的时尚单品。', 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=800&fit=crop', '审核中', 30.5753, 103.9238),
('p052', '小白', '白兔', '3个月', 'female', '其他', '未绝育', '不适用', '成都龙泉驿区', '6.0km', '小白是一只纯白侏儒兔，红眼睛粉耳朵像小天使。性格温顺会认人，已学会在固定角落上厕所。饲养成本低适合新手。', 'https://images.unsplash.com/photo-1591382386627-349b692688ff?w=600&h=800&fit=crop', '寻找领养', 30.5574, 104.2715)
ON CONFLICT (id) DO NOTHING;
