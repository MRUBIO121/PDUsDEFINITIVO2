# Guía de Debugging - Error 401

## Pasos para debuggear el problema de sesión

### 1. Recompilar y Reiniciar

```bash
# Compilar el frontend
npm run build

# Reiniciar el servidor (cerrar el anterior con Ctrl+C primero)
node server.cjs
```

### 2. Verificar en el Navegador

1. **Abre el navegador en modo incógnito** (para empezar sin cookies)
2. Ve a `http://localhost:3001`
3. **Abre las Herramientas de Desarrollador** (F12)
4. Ve a la pestaña **Console** para ver los logs
5. Ve a la pestaña **Network** para ver las peticiones

### 3. Probar el Login

1. Ingresa usuario: `admin` y contraseña: `Admin123!`
2. Haz clic en "Iniciar Sesión"
3. **En la pestaña Network**, busca la petición `login`
4. Haz clic en ella y verifica:
   - **Response Headers**: Debe incluir `Set-Cookie: connect.sid=...`
   - **Response**: Debe ser `{"success": true, ...}`

### 4. Verificar la Cookie

En las **Herramientas de Desarrollador**:
- Ve a **Application** (o **Storage** en Firefox)
- En el menú izquierdo, expande **Cookies**
- Haz clic en `http://localhost:3001`
- **Debe aparecer una cookie llamada `connect.sid`**

Si NO aparece la cookie:
- El problema está en cómo el servidor está enviando las cookies
- Verifica que el servidor está corriendo en el mismo puerto que el navegador

### 5. Verificar Petición a /api/racks/energy

Después del login, en la pestaña **Network**:
1. Busca la petición a `/api/racks/energy`
2. Haz clic en ella
3. Ve a **Request Headers**
4. **Debe incluir**: `Cookie: connect.sid=...`

Si NO incluye la cookie:
- El navegador no está enviando las cookies
- Puede ser un problema de CORS o configuración del navegador

### 6. Revisar los Logs del Servidor

En la terminal donde corre `node server.cjs`, debes ver:

```
🔑 Creating session for user: admin
📝 Session data before save: { sessionId: '...', userId: 1, ... }
✅ Session saved successfully for user: admin
```

Luego cuando accedas a `/api/racks/energy`:

```
🔐 Auth Check: { path: '/api/racks/energy', hasSession: true, userId: 1, cookie: 'present' }
✅ Auth Success - User: admin
```

Si ves `❌ Auth Failed - No session or userId`, significa que la cookie no llegó al servidor.

## Solución Rápida

Si todo lo anterior falla, prueba esto:

### Opción 1: Asegúrate de que el puerto es correcto

Verifica que el navegador accede exactamente a `http://localhost:3001` (el mismo puerto donde corre el servidor).

### Opción 2: Limpia las cookies

1. En DevTools → Application → Storage
2. Haz clic derecho en `http://localhost:3001`
3. Selecciona "Clear"
4. Refresca la página (F5) e intenta login nuevamente

### Opción 3: Prueba otro navegador

A veces Chrome o Firefox tienen configuraciones que bloquean cookies. Prueba con otro navegador.

## Problema Común: Puerto Incorrecto

Si el frontend está en un puerto y el backend en otro, las cookies NO funcionarán.

Solución:
- Accede SIEMPRE a través de `http://localhost:3001` (el puerto del servidor)
- El servidor sirve tanto el frontend como las APIs
