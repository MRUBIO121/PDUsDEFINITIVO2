# Inicio Rápido - Sistema de Autenticación

## Pasos para Configurar

### 1. Crear la tabla de usuarios en SQL Server
```bash
sqlcmd -S localhost -U sa -P tu_password -d energy_monitor_db -i create_users_table.sql
```

### 2. Inicializar el usuario administrador
```bash
node initialize_admin_user.cjs
```

### 3. Iniciar la aplicación
```bash
npm run build
npm run server
```

### 4. Acceder a la aplicación

Abrir el navegador en `http://localhost:5173` (o el puerto configurado)

**Credenciales por defecto:**
- Usuario: `admin`
- Contraseña: `Admin123!`

⚠️ **IMPORTANTE**: Cambiar la contraseña después del primer acceso.

## Roles Disponibles

| Rol | Permisos |
|-----|----------|
| **Administrador** | Control total + gestión de usuarios |
| **Operador** | Control total sin gestión de usuarios |
| **Técnico** | Ver alertas + gestionar mantenimiento |
| **Observador** | Solo lectura |

## Gestión de Usuarios

1. Login como Administrador
2. Click en "Configuración" (header)
3. Pestaña "Gestión de Usuarios"
4. Crear, editar o eliminar usuarios

## Archivos Importantes

- `create_users_table.sql` - Script para crear tabla de usuarios
- `initialize_admin_user.cjs` - Script para crear usuario admin
- `INSTRUCCIONES_AUTENTICACION.md` - Documentación completa

## Seguridad

- Contraseñas hasheadas con bcrypt
- Sesiones con express-session
- Cookies httpOnly
- Validación de roles en backend
- Protección de todos los endpoints del API

## Solución Rápida de Problemas

**Olvidé la contraseña:**
```bash
node initialize_admin_user.cjs
```

**Tabla no existe:**
```bash
sqlcmd -S localhost -U sa -P tu_password -d energy_monitor_db -i create_users_table.sql
```

**Sesión expirada:**
- Volver a iniciar sesión
- Las sesiones duran 24 horas
