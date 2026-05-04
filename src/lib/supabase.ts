import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  document.body.innerHTML = `
    <div style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;color:#1c1f24;background:#f5f6f8">
      <div style="font-size:32px">⚙️</div>
      <h2 style="margin:0">Configuration manquante</h2>
      <p style="margin:0;color:#6c7480;font-size:14px;text-align:center;max-width:400px">
        Les variables d'environnement Supabase ne sont pas définies.<br>
        Ajoutez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>
        dans les secrets GitHub Actions du dépôt.
      </p>
    </div>`
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
