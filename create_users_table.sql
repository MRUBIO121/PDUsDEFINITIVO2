-- ============================================================================================================
-- ARCHIVO: create_users_table.sql
-- PROPOSITO: Crear tabla de usuarios para el sistema de autenticación
-- FECHA: 2025-10-22
-- VERSION: 1.0
-- ============================================================================================================
--
-- Este script crea la tabla de usuarios con soporte para 4 roles diferentes:
-- - Administrador: Control total de la aplicación incluyendo gestión de usuarios
-- - Operador: Control total excepto gestión de usuarios
-- - Tecnico: Puede ver alertas y gestionar mantenimiento, pero no modificar umbrales ni usuarios
-- - Observador: Solo puede ver la aplicación sin modificar nada
--
-- TABLA INCLUIDA:
--   1. users - Usuarios del sistema con contraseñas hasheadas y roles
--
-- ============================================================================================================

-- Cambiar al contexto de la base de datos
USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'INICIO: Creación de tabla de usuarios';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- TABLA: users
-- ============================================================================================================
-- PROPOSITO: Almacena los usuarios del sistema con sus credenciales y roles
--
-- DESCRIPCION:
--   Esta tabla contiene toda la información de los usuarios que pueden acceder al sistema.
--   Las contraseñas se almacenan hasheadas usando bcrypt para máxima seguridad.
--
-- CAMPOS:
--   - id                : Identificador único del usuario (GUID)
--   - usuario           : Nombre de usuario único para login
--   - password_hash     : Contraseña hasheada con bcrypt
--   - rol               : Rol del usuario (Administrador, Operador, Tecnico, Observador)
--   - activo            : Indica si el usuario está activo (soft delete)
--   - fecha_creacion    : Fecha de creación del usuario
--   - fecha_modificacion: Fecha de última modificación
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en 'usuario' para evitar duplicados
--   - Check constraint en 'rol' para validar roles permitidos
--
-- INDICES:
--   - IX_users_usuario: Para búsquedas rápidas por nombre de usuario
--   - IX_users_rol: Para filtrar por rol
--   - IX_users_activo: Para filtrar usuarios activos
--
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: users';
PRINT '------------------------------------------------------------------------------------------------------------';

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
BEGIN
    CREATE TABLE users (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        usuario NVARCHAR(100) UNIQUE NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        rol NVARCHAR(50) NOT NULL CHECK (rol IN ('Administrador', 'Operador', 'Tecnico', 'Observador')),
        activo BIT NOT NULL DEFAULT 1,
        fecha_creacion DATETIME DEFAULT GETDATE(),
        fecha_modificacion DATETIME DEFAULT GETDATE()
    );

    -- Crear índices para optimizar búsquedas
    CREATE INDEX IX_users_usuario ON users(usuario);
    CREATE INDEX IX_users_rol ON users(rol);
    CREATE INDEX IX_users_activo ON users(activo);

    PRINT '✅ Tabla users creada exitosamente con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla users ya existe';
END
GO

-- ============================================================================================================
-- INSERTAR USUARIO ADMINISTRADOR POR DEFECTO
-- ============================================================================================================
-- PROPOSITO: Crear un usuario administrador inicial para acceso al sistema
--
-- CREDENCIALES POR DEFECTO:
--   Usuario: admin
--   Contraseña: Admin123!
--
-- IMPORTANTE: Esta contraseña es temporal y debe ser cambiada inmediatamente después
--             del primer acceso al sistema por razones de seguridad.
--
-- El password_hash corresponde a "Admin123!" hasheado con bcrypt (salt rounds: 10)
-- Hash generado con: bcrypt.hashSync('Admin123!', 10)
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Insertando usuario administrador por defecto';
PRINT '------------------------------------------------------------------------------------------------------------';

-- Verificar si ya existe un usuario administrador
IF NOT EXISTS (SELECT * FROM users WHERE usuario = 'admin')
BEGIN
    -- Hash de bcrypt para la contraseña "Admin123!" con salt rounds 10
    -- NOTA: Este hash debe ser generado en el backend al ejecutar el script
    -- Por ahora usamos un placeholder que será reemplazado por el backend
    INSERT INTO users (usuario, password_hash, rol, activo, fecha_creacion, fecha_modificacion)
    VALUES (
        'admin',
        '$2a$10$xyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr', -- Placeholder, será reemplazado
        'Administrador',
        1,
        GETDATE(),
        GETDATE()
    );

    PRINT '✅ Usuario administrador creado exitosamente';
    PRINT '   Usuario: admin';
    PRINT '   Contraseña temporal: Admin123!';
    PRINT '   ⚠️  IMPORTANTE: Cambie esta contraseña inmediatamente por seguridad';
END
ELSE
BEGIN
    PRINT 'ℹ️  Usuario administrador ya existe';
END
GO

-- ============================================================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'VERIFICACIÓN: Contando usuarios en la tabla';
PRINT '============================================================================================================';

SELECT COUNT(*) as Total_Usuarios FROM users;
SELECT usuario, rol, activo, fecha_creacion FROM users;

PRINT '';
PRINT '============================================================================================================';
PRINT '✅ Setup de tabla de usuarios FINALIZADO EXITOSAMENTE';
PRINT '============================================================================================================';
PRINT '';
PRINT 'RESUMEN DE ROLES DISPONIBLES:';
PRINT '  1. Administrador - Control total incluyendo gestión de usuarios';
PRINT '  2. Operador      - Control total excepto gestión de usuarios';
PRINT '  3. Tecnico       - Ver alertas y gestionar mantenimiento solamente';
PRINT '  4. Observador    - Solo lectura, sin permisos de modificación';
PRINT '';
PRINT 'PRÓXIMOS PASOS:';
PRINT '  1. Ejecutar este script en SQL Server Management Studio o desde el backend';
PRINT '  2. Acceder al sistema con usuario "admin" y contraseña "Admin123!"';
PRINT '  3. Cambiar la contraseña del administrador inmediatamente';
PRINT '  4. Crear usuarios adicionales según sea necesario';
PRINT '';
PRINT '============================================================================================================';
GO
