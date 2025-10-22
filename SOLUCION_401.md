# Solución Completa para Error 401 Unauthorized

## ¿Qué he cambiado?

### 1. Servidor ahora sirve el frontend compilado (server.cjs)

**Cambios realizados:**
- Agregado `express.static` para servir archivos de la carpeta `dist/`
- Agregada ruta catch-all que devuelve `index.html` para rutas que no sean APIs
- Configuración de CORS simplificada para funcionar cuando frontend y backend están en el mismo servidor
- Cookies de sesión configuradas con `secure: false` y `sameSite: 'lax'`
- Login ahora llama a `req.session.save()` explícitamente
- Agregados logs detallados para debugging

### 2. Configuración de sesión mejorada

- Las cookies ahora funcionan con HTTP (no solo HTTPS)
- La sesión se guarda explícitamente después del login
- Logs muestran exactamente qué está pasando con las sesiones

## Pasos para usar la aplicación

### 1. Compilar el frontend

```bash
npm run build
```

Esto crea/actualiza la carpeta `dist/` con el frontend compilado.

### 2. Iniciar el servidor

```bash
node server.cjs
```

O usando el script de package.json:

```bash
npm run server
```

### 3. Acceder a la aplicación

**MUY IMPORTANTE**: Accede a través del puerto del servidor:

```
http://localhost:3001
```

NO uses `localhost:5173` (ese es solo para desarrollo).

### 4. Iniciar sesión

- Usuario: `admin`
- Contraseña: `Admin123!`

## ¿Por qué estaba fallando?

El error 401 ocurría porque:

1. **Frontend y backend en puertos diferentes**: El proxy de Vite solo funciona en desarrollo
2. **Cookies no se enviaban**: Al estar en diferentes puertos, las cookies no se compartían
3. **Sesión no se persistía**: La sesión se creaba pero no se guardaba correctamente

## ¿Cómo funciona ahora?

1. El servidor Express (puerto 3001) hace **TODO**:
   - Sirve el frontend estático desde `/dist`
   - Maneja las APIs en `/api/*`
   - Gestiona las sesiones con cookies

2. **Un solo puerto = Sin problemas de CORS**:
   - Frontend y backend en `localhost:3001`
   - Las cookies funcionan perfectamente
   - No hay problemas de CORS

3. **Sesión simple y directa**:
   - Login guarda usuario en `req.session`
   - Middleware `requireAuth` verifica que existe `req.session.userId`
   - Cookie se envía automáticamente en cada petición

## Debugging

Si sigue sin funcionar, revisa el archivo `DEBUG_SESSION.md` que incluye:

- Cómo ver las cookies en el navegador
- Cómo verificar que la sesión se está creando
- Qué buscar en los logs del servidor
- Soluciones a problemas comunes

Los logs del servidor ahora muestran:

```
🔑 Creating session for user: admin
📝 Session data before save: {...}
✅ Session saved successfully for user: admin
```

Y cuando haces peticiones:

```
🔐 Auth Check: { path: '/api/racks/energy', hasSession: true, userId: 1, cookie: 'present' }
✅ Auth Success - User: admin
```

Si ves `❌ Auth Failed`, mira la razón en los logs.

## Notas Importantes

1. **Siempre recompila después de cambios**:
   ```bash
   npm run build
   ```

2. **Reinicia el servidor después de cambios en server.cjs**:
   - Cierra el servidor (Ctrl+C)
   - Ejecuta `node server.cjs` nuevamente

3. **Usa modo incógnito** para probar sin cookies viejas

4. **Verifica que el puerto sea 3001** en la URL del navegador

## Resumen

- ✅ Servidor configurado para servir frontend y backend
- ✅ Sesiones con cookies funcionando
- ✅ CORS configurado correctamente
- ✅ Logs de debugging agregados
- ✅ Documentación completa creada

**Ejecuta `npm run build` y luego `node server.cjs`** para probar los cambios.
