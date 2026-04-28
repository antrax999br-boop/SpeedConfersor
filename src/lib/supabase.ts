import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jadjfkugyodgpvxkwbhc.supabase.co';
const supabaseKey = 'sb_publishable_mFcwg5EbEQlevUtGX3thkg_hic-_l0L';

export const supabase = createClient(supabaseUrl, supabaseKey);
