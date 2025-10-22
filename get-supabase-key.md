# Obtener Supabase Service Role Key

Para que el sistema de sesiones funcione correctamente, necesitas el **Service Role Key** de Supabase.

## Pasos:

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard/project/dxafxtlqogjaoqxfjbti

2. En el menú lateral, haz clic en **Settings** (Configuración)

3. Haz clic en **API**

4. Busca la sección **Project API keys**

5. Copia el **service_role key** (NO el anon key)
   - Es un JWT que empieza con `eyJ...`
   - Esta clave tiene acceso administrativo completo

6. Agrega la clave a tu archivo `.env`:

```env
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
```

## Advertencia de Seguridad

⚠️ **IMPORTANTE**: El Service Role Key tiene acceso administrativo completo.
- NUNCA lo expongas en el frontend
- NUNCA lo subas a repositorios públicos
- Solo úsalo en el backend (server.cjs)

## Verificación

Una vez agregada la clave:
1. Reinicia el servidor: `pm2 restart energy-monitoring-api`
2. Intenta iniciar sesión
3. Las sesiones ahora se almacenarán en Supabase de forma persistente
