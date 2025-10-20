const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create Supabase client with anon key (for public operations)
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Create Supabase client with service role (for admin operations)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = {
  supabasePublic,
  supabaseAdmin
};