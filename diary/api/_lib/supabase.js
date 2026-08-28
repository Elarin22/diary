import { createClient } from '@supabase/supabase-js';

// 이 클라이언트는 절대 프론트엔드로 보내지 마세요.
// service_role key는 RLS를 우회하므로 반드시 /api 서버 코드 안에서만 씁니다.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
