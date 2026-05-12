-- =====================================================
-- PawConnect 数据库 Schema
-- 在 Supabase SQL Editor 中执行此文件
-- =====================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  city VARCHAR(20) DEFAULT '上海',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 宠物表
CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  breed VARCHAR(50) NOT NULL,
  age VARCHAR(20) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
  neutered VARCHAR(20) DEFAULT '未绝育',
  vaccine VARCHAR(50) DEFAULT '未知',
  location VARCHAR(100) NOT NULL,
  distance VARCHAR(20) DEFAULT '未知',
  story TEXT,
  image_url TEXT,
  status VARCHAR(20) DEFAULT '寻找领养' CHECK (status IN ('寻找领养', '审核中', '已领养')),
  publisher_id UUID REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 领养申请表
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  pet_id UUID REFERENCES pets(id) NOT NULL,
  applicant_name VARCHAR(50) NOT NULL,
  applicant_phone VARCHAR(20) NOT NULL,
  housing_type VARCHAR(30) NOT NULL,
  has_balcony_net BOOLEAN DEFAULT false,
  has_pet_experience BOOLEAN DEFAULT false,
  current_pets VARCHAR(50) DEFAULT '',
  family_support VARCHAR(30) DEFAULT '',
  has_allergies VARCHAR(10) DEFAULT 'no',
  daily_time VARCHAR(20) DEFAULT '',
  motivation TEXT,
  signature_data TEXT,
  status VARCHAR(20) DEFAULT '审核中' CHECK (status IN ('审核中', '通过初审', '已通过', '未通过', '已取消')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  pet_id UUID REFERENCES pets(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pet_id)
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'notification' CHECK (type IN ('notification', 'chat', 'system')),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 领养成功记录表
CREATE TABLE IF NOT EXISTS adoptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  pet_id UUID REFERENCES pets(id) NOT NULL,
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

-- 为 pets 开启 RLS (Row Level Security)
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE adoptions ENABLE ROW LEVEL SECURITY;

-- RLS 策略: 宠物表 (所有人可读，发布者可写)
CREATE POLICY "pets_read_all" ON pets FOR SELECT USING (is_deleted = false);
CREATE POLICY "pets_insert_auth" ON pets FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "pets_update_owner" ON pets FOR UPDATE USING (auth.uid() = publisher_id);
CREATE POLICY "pets_delete_owner" ON pets FOR DELETE USING (auth.uid() = publisher_id);

-- RLS 策略: 申请表 (用户可读写自己的申请)
CREATE POLICY "applications_read_owner" ON applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "applications_insert_auth" ON applications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "applications_update_owner" ON applications FOR UPDATE USING (auth.uid() = user_id);

-- RLS 策略: 收藏表
CREATE POLICY "favorites_read_owner" ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "favorites_insert_auth" ON favorites FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "favorites_delete_owner" ON favorites FOR DELETE USING (auth.uid() = user_id);

-- RLS 策略: 消息表
CREATE POLICY "messages_read_owner" ON messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages_insert_auth" ON messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RLS 策略: 领养成功表
CREATE POLICY "adoptions_read_owner" ON adoptions FOR SELECT USING (auth.uid() = user_id);

-- 自动更新 updated_at 的函数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为各表添加自动更新触发器
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pets_updated_at BEFORE UPDATE ON pets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 插入种子数据
INSERT INTO pets (name, breed, age, gender, neutered, vaccine, location, distance, story, image_url, status) VALUES
('小橘子', '橘猫', '1岁', 'female', '已绝育', '已疫苗', '浦东新区', '2.5km', '小橘子在一个下雨天被发现蜷缩在停车场的角落，当时它又饿又冷。被救助后，它展现了极其亲人的性格，总是第一个跑到笼子前迎接志愿者。它喜欢被人抱着，也喜欢和逗猫棒玩耍，性格温顺不闹腾，非常适合家庭领养。', 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=800&fit=crop', '寻找领养'),
('旺财', '比格犬', '8个月', 'male', '未绝育', '已疫苗', '徐汇区', '5.1km', '旺财是一只精力充沛的小比格，最喜欢的事情就是追飞盘和在草地上打滚。它是从繁殖场救出来的，经过半年的细心照料，现在已经是一只健康快乐的小狗了。', 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=800&fit=crop', '寻找领养'),
('蓝胖子', '英国短毛猫', '2岁', 'male', '已绝育', '驱虫完成', '静安区', '1.2km', '蓝胖子是一只性格沉稳的英短，圆脸圆眼，特别招人喜欢。它原主人因为工作调动出国无法带走它。蓝胖子非常安静，不拆家不闹腾。', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=800&fit=crop', '审核中'),
('布丁', '金毛', '3个月', 'female', '未绝育', '第一针疫苗', '长宁区', '8.0km', '布丁是一只超萌的金毛小奶狗，毛茸茸的身体就像一颗行走的布丁。它和兄弟姐妹一起被遗弃在公园的纸箱里，现在布丁已经健康长大。', 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=800&fit=crop', '寻找领养');
