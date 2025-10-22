# Instrucciones para Producción

## Paso 1: Compilar el Frontend

```bash
npm run build
```

Esto crea la carpeta `dist/` con los archivos compilados del frontend.

## Paso 2: Iniciar el Servidor

```bash
npm run server
```

O directamente:

```bash
node server.cjs
```

## ¿Qué Hace el Servidor?

El servidor Express (puerto 3001 por defecto):

1. **Sirve el frontend compilado** desde la carpeta `dist/`
2. **Sirve las APIs** en `/api/*`
3. **Maneja la autenticación** con sesiones simples

## Acceso

- Abre el navegador en: `http://localhost:3001`
- Usuario por defecto: `admin`
- Contraseña por defecto: `Admin123!`

## Variables de Entorno Importantes

Asegúrate de tener el archivo `.env` con:

```
SESSION_SECRET=energy-monitor-secret-key-2025-secure-session
SQL_SERVER_HOST=tu-servidor-sql
SQL_SERVER_DATABASE=tu-base-de-datos
SQL_SERVER_USER=tu-usuario
SQL_SERVER_PASSWORD=tu-contraseña
```

## Solución de Problemas

### Error 401 (Unauthorized)

Esto significa que no has iniciado sesión o tu sesión expiró. Soluciones:

1. Refresca la página y vuelve a iniciar sesión
2. Limpia las cookies del navegador
3. Reinicia el servidor con `node server.cjs`

### No Aparece la Página

1. Verifica que existe la carpeta `dist/` (ejecuta `npm run build` primero)
2. Verifica que el servidor está corriendo en el puerto correcto
3. Revisa los logs del servidor para ver errores

### Problemas con la Base de Datos

1. Verifica que SQL Server está accesible
2. Confirma que las credenciales en `.env` son correctas
3. Revisa que existe la tabla `usersAlertado` con usuarios

## Producción con PM2 (Opcional)

Para mantener el servidor corriendo en producción:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```
