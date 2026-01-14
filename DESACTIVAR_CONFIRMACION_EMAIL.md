# Desactivar Confirmación de Email en Supabase

Para que los usuarios puedan iniciar sesión sin confirmar el email (útil para desarrollo y aplicaciones internas):

## Pasos:

1. Ve a tu proyecto en Supabase Dashboard
2. Navega a **Authentication** → **Settings** (en el menú lateral)
3. Busca la sección **"Email Auth"**
4. Desactiva la opción **"Enable email confirmations"**
5. Guarda los cambios

## Alternativa: Confirmar email manualmente desde SQL

Si prefieres mantener la confirmación activa pero confirmar usuarios específicos manualmente, ejecuta este SQL en el SQL Editor:

```sql
-- Confirmar el email del usuario dortiz@feb.es
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'dortiz@feb.es';

-- Verificar que se confirmó
SELECT id, email, email_confirmed_at
FROM auth.users
WHERE email = 'dortiz@feb.es';
```

## Recomendación

Para aplicaciones internas de empresa, es común desactivar la confirmación de email ya que los usuarios son conocidos y verificados por el administrador.
