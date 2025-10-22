# Sistema de Autenticación - Instrucciones de Configuración

Este documento describe cómo configurar y utilizar el sistema de autenticación implementado en la aplicación de Monitoreo de Racks y PDUs.

## Características Implementadas

- Sistema de autenticación con sesiones basado en express-session
- 4 roles de usuario con diferentes permisos:
  - **Administrador**: Control total incluyendo gestión de usuarios
  - **Operador**: Control total excepto gestión de usuarios
  - **Técnico**: Ver alertas y gestionar mantenimiento únicamente
  - **Observador**: Solo lectura, sin permisos de modificación
- Gestión completa de usuarios desde el frontend
- Protección de rutas y endpoints del API
- Contraseñas hasheadas con bcrypt

## Requisitos Previos

- SQL Server instalado y configurado
- Node.js >= 16.0.0
- Base de datos `energy_monitor_db` creada

## Instalación

### 1. Instalar Dependencias

Las dependencias ya están instaladas en el proyecto:
- `bcryptjs`: Para hasheo de contraseñas
- `express-session`: Para gestión de sesiones

Si necesita reinstalar:
```bash
npm install
```

### 2. Configurar Variable de Entorno (Opcional)

Añadir en el archivo `.env`:
```
SESSION_SECRET=tu-clave-secreta-aqui-cambiarla-en-produccion
```

Si no se especifica, se usará una clave por defecto (NO recomendado en producción).

### 3. Crear Tabla de Usuarios en SQL Server

Ejecutar el script SQL en SQL Server Management Studio o mediante línea de comandos:

```bash
sqlcmd -S localhost -U sa -P tu_password -d energy_monitor_db -i supabase/migrations/20251022000000_create_users_table.sql
```

O abrir el archivo `supabase/migrations/20251022000000_create_users_table.sql` en SQL Server Management Studio y ejecutarlo.

### 4. Inicializar Usuario Administrador

Ejecutar el script de Node.js para crear el usuario admin con contraseña hasheada:

```bash
node initialize_admin_user.cjs
```

Este script creará el usuario `admin` con contraseña `Admin123!`

## Credenciales por Defecto

```
Usuario:     admin
Contraseña:  Admin123!
Rol:         Administrador
```

## Estructura de la Base de Datos

### Tabla: users

| Campo               | Tipo              | Descripción                          |
|---------------------|-------------------|--------------------------------------|
| id                  | UNIQUEIDENTIFIER  | Identificador único (GUID)           |
| usuario             | NVARCHAR(100)     | Nombre de usuario (único)            |
| password_hash       | NVARCHAR(255)     | Contraseña hasheada con bcrypt       |
| rol                 | NVARCHAR(50)      | Rol del usuario                      |
| activo              | BIT               | Estado del usuario                   |
| fecha_creacion      | DATETIME          | Fecha de creación                    |
| fecha_modificacion  | DATETIME          | Fecha de última modificación         |

### Roles Válidos

- `Administrador`
- `Operador`
- `Tecnico`
- `Observador`

## Permisos por Rol

### Administrador
- Ver y navegar toda la aplicación
- Configurar umbrales generales
- Configurar umbrales específicos por rack
- Enviar racks y chains a mantenimiento
- Finalizar mantenimientos
- Exportar alertas a Excel
- **Gestionar usuarios** (crear, editar, eliminar)

### Operador
- Ver y navegar toda la aplicación
- Configurar umbrales generales
- Configurar umbrales específicos por rack
- Enviar racks y chains a mantenimiento
- Finalizar mantenimientos
- Exportar alertas a Excel
- **NO puede gestionar usuarios**

### Técnico
- Ver alertas y racks
- Enviar racks y chains a mantenimiento
- Finalizar mantenimientos
- Exportar alertas a Excel
- **NO puede modificar umbrales**
- **NO puede gestionar usuarios**

### Observador
- Solo lectura
- Ver alertas y racks
- **NO puede realizar ninguna modificación**
- **NO puede exportar ni gestionar nada**

## Uso de la Aplicación

### 1. Iniciar Sesión

1. Acceder a la aplicación en el navegador
2. Se mostrará automáticamente la pantalla de login
3. Ingresar usuario y contraseña
4. Click en "Iniciar Sesión"

### 2. Gestión de Usuarios (Solo Administrador)

1. Iniciar sesión como Administrador
2. Click en el botón "Configuración" en el header
3. Seleccionar la pestaña "Gestión de Usuarios"
4. Desde aquí se puede:
   - Ver lista de usuarios existentes
   - Crear nuevos usuarios
   - Editar usuarios (cambiar nombre, contraseña, rol, estado)
   - Eliminar usuarios (soft delete)

### 3. Crear Nuevo Usuario

1. En la sección "Gestión de Usuarios", click en "Nuevo Usuario"
2. Llenar el formulario:
   - **Usuario**: Nombre de usuario único (requerido)
   - **Contraseña**: Mínimo 8 caracteres (requerido)
   - **Rol**: Seleccionar uno de los 4 roles disponibles
3. Click en "Crear"

### 4. Editar Usuario

1. En la tabla de usuarios, click en el ícono de editar (lápiz)
2. Modificar los campos deseados:
   - Cambiar nombre de usuario
   - Cambiar contraseña (dejar en blanco para mantener la actual)
   - Cambiar rol
   - Activar/desactivar usuario
3. Click en "Guardar"

### 5. Eliminar Usuario

1. En la tabla de usuarios, click en el ícono de eliminar (papelera)
2. Confirmar la eliminación
3. El usuario se desactivará (soft delete)

**NOTA**: No se puede eliminar el propio usuario con el que se está logueado.

### 6. Cerrar Sesión

Click en el botón "Salir" en el header de la aplicación.

## Endpoints del API

### Autenticación

- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/auth/session` - Verificar sesión activa

### Gestión de Usuarios (Solo Administrador)

- `GET /api/users` - Obtener lista de usuarios
- `POST /api/users` - Crear nuevo usuario
- `PUT /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Eliminar usuario (soft delete)

### Endpoints Protegidos

Todos los endpoints existentes de la aplicación ahora requieren autenticación:
- `/api/racks/energy`
- `/api/thresholds`
- `/api/maintenance/*`
- etc.

## Seguridad

### Contraseñas
- Se almacenan hasheadas con bcrypt (salt rounds: 10)
- Nunca se envían en texto plano
- Validación de longitud mínima de 8 caracteres

### Sesiones
- Almacenadas con express-session
- Cookies httpOnly para prevenir XSS
- Cookie secure en producción (HTTPS)
- Duración: 24 horas

### Validaciones Backend
- Verificación de rol en cada endpoint protegido
- Prevención de eliminación del propio usuario
- Validación de unicidad de nombres de usuario
- Sanitización de inputs

## Troubleshooting

### No puedo acceder a la aplicación
- Verificar que la tabla `users` existe en la base de datos
- Verificar que el usuario admin fue creado correctamente
- Ejecutar `node initialize_admin_user.cjs` nuevamente

### Error al crear tabla
- Asegurarse de que SQL Server está ejecutándose
- Verificar las credenciales en el archivo `.env`
- Verificar que la base de datos `energy_monitor_db` existe

### Olvidé la contraseña del administrador
- Ejecutar nuevamente `node initialize_admin_user.cjs`
- Esto actualizará la contraseña del admin a `Admin123!`

### Error de sesión expirada
- Las sesiones duran 24 horas
- Volver a iniciar sesión
- Verificar que el servidor backend está ejecutándose

## Producción

Para desplegar en producción:

1. Cambiar `SESSION_SECRET` en `.env` a un valor aleatorio y seguro
2. Asegurar que `NODE_ENV=production` está configurado
3. Configurar HTTPS para que las cookies secure funcionen
4. Revisar los logs en `./logs/` para detectar intentos de acceso no autorizado

## Soporte

Para problemas o preguntas, revisar los logs en:
- `./logs/error.log` - Errores del servidor
- `./logs/combined.log` - Todos los logs

Los intentos de login se registran automáticamente con Winston.
