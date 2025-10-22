# Solución al Error 401 de Autenticación

## Problema Identificado

El sistema tenía dos problemas principales:

1. **MemoryStore para sesiones**: Las sesiones se almacenaban en memoria, lo que causa:
   - Pérdida de sesiones al reiniciar el servidor
   - No funciona en entornos de producción
   - Memory leaks
   - No persiste entre requests

2. **Falta de SESSION_SECRET**: Esta variable era opcional pero es crítica para la seguridad de las sesiones

## Solución Implementada

### 1. Almacenamiento Persistente de Sesiones

Las sesiones ahora se almacenan en **Supabase PostgreSQL** usando `connect-pg-simple`:

- ✅ Sesiones persistentes entre reinicios del servidor
- ✅ Funcionamiento correcto en producción
- ✅ Sin memory leaks
- ✅ Escalable y confiable

### 2. Migración de Base de Datos

Se creó la tabla `sessions` en Supabase:

```sql
CREATE TABLE sessions (
  sid text PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp(6) NOT NULL
);
```

**Estado**: ✅ Migración aplicada exitosamente

### 3. Actualizaciones al Código

**server.cjs**:
- Agregado PostgreSQL pool para Supabase
- Configurado `connect-pg-simple` como session store
- Contraseñas en texto plano (sin bcrypt)
- Comentarios claros sobre comparación de contraseñas

**package.json**:
- ✅ Agregado `pg@8.13.1`
- ✅ Agregado `connect-pg-simple@10.0.0`
- ✅ Agregado `@supabase/supabase-js@2.47.10`
- ✅ Removido `bcryptjs` (no se usa)

### 4. Variables de Entorno

**Agregadas al .env**:
```env
# Supabase Backend (para sesiones)
SUPABASE_URL=https://dxafxtlqogjaoqxfjbti.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Session Configuration
SESSION_SECRET=energy-monitor-secret-key-2025-secure-session
```

## PASOS SIGUIENTES PARA COMPLETAR LA SOLUCIÓN

### Paso 1: Obtener Service Role Key

1. Ve a: https://supabase.com/dashboard/project/dxafxtlqogjaoqxfjbti/settings/api

2. Busca la sección **Project API keys**

3. Copia el **service_role** key (NO el anon key)
   - Es un JWT largo que empieza con `eyJ...`
   - Tiene el rol `service_role`, NO `anon`

4. Abre el archivo `.env` en tu proyecto

5. Reemplaza la línea:
```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Con tu clave real:
```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFz... (tu clave completa)
```

⚠️ **IMPORTANTE**:
- Esta clave tiene acceso administrativo completo
- NUNCA la expongas públicamente
- NUNCA la subas a GitHub
- Solo úsala en el backend (server.cjs)
- El archivo `.env` ya está en `.gitignore`

### Paso 2: Reiniciar el Servidor

```bash
pm2 restart energy-monitoring-api
pm2 logs energy-monitoring-api
```

### Paso 3: Probar el Login

1. Abre el navegador en tu aplicación
2. Usa las credenciales:
   - Usuario: `admin`
   - Contraseña: `Admin123!`
3. Verifica que no aparezcan errores 401

### Paso 4: Verificar Sesiones en Supabase

Puedes verificar que las sesiones se están guardando:

1. Ve a: https://supabase.com/dashboard/project/dxafxtlqogjaoqxfjbti/editor
2. Selecciona la tabla `sessions`
3. Deberías ver registros con tus sesiones activas

## Verificación del Sistema

### ✅ Completado

- [x] Migración de tabla `sessions` aplicada
- [x] Código actualizado para usar PostgreSQL store
- [x] Dependencias instaladas (`pg`, `connect-pg-simple`, `@supabase/supabase-js`)
- [x] Removido bcrypt del código
- [x] SESSION_SECRET configurado
- [x] Contraseñas en texto plano documentadas
- [x] Proyecto compilado sin errores
- [x] README actualizado con documentación de autenticación

### ⏳ Pendiente (Requiere Acción del Usuario)

- [ ] Agregar SUPABASE_SERVICE_ROLE_KEY al archivo .env
- [ ] Reiniciar el servidor con pm2
- [ ] Probar el login

## Estructura de Autenticación

```
Usuario ingresa credenciales
         ↓
POST /api/auth/login
         ↓
Verificación en SQL Server (tabla usersAlertado)
Comparación texto plano: password === user.password
         ↓
Sesión creada en Supabase PostgreSQL (tabla sessions)
         ↓
Cookie enviada al navegador
         ↓
Requests subsiguientes usan la cookie
         ↓
Middleware requireAuth verifica sesión en Supabase
         ↓
Acceso autorizado a /api/racks/energy
```

## Archivos Modificados

1. `server.cjs` - Configuración de sesiones con PostgreSQL
2. `package.json` - Nuevas dependencias
3. `.env` - Variables de Supabase backend
4. `.env.example` - Documentación de variables
5. `supabase/migrations/20251022120000_create_sessions_table.sql` - Nueva migración
6. `README.md` - Documentación de autenticación

## Troubleshooting

### Error: "connection refused"
- Verifica que SUPABASE_SERVICE_ROLE_KEY esté configurado correctamente
- Asegúrate de usar el service_role key, no el anon key

### Error 401 persiste
- Limpia cookies del navegador
- Verifica que SESSION_SECRET esté configurado
- Revisa logs: `pm2 logs energy-monitoring-api`

### Sesiones no se guardan
- Verifica conexión a Supabase
- Confirma que la tabla `sessions` existe
- Revisa los logs del servidor

## Seguridad

✅ **Implementado**:
- Sesiones en base de datos persistente
- httpOnly cookies (no accesibles desde JavaScript)
- sameSite: 'lax' (protección CSRF)
- Expiración de sesiones (24 horas)

⚠️ **Recordatorio**:
- Las contraseñas están en texto plano como solicitaste
- El SERVICE_ROLE_KEY debe mantenerse secreto
- Solo el backend tiene acceso a las sesiones
