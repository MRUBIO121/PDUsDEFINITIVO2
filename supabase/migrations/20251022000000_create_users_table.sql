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
-- TABLA: usersAlertado
-- ============================================================================================================
-- PROPOSITO: Almacena los usuarios del sistema con sus credenciales y roles
--
-- DESCRIPCION:
--   Esta tabla contiene toda la información de los usuarios que pueden acceder al sistema.
--   IMPORTANTE: Las contraseñas se almacenan en TEXTO PLANO (sin cifrado).
--   No se utiliza bcrypt ni ningún otro método de hash de contraseñas.
--
-- CAMPOS:
--   - id                : Identificador único del usuario (GUID)
--   - usuario           : Nombre de usuario único para login
--   - password          : Contraseña en texto plano
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
--   - IX_usersAlertado_usuario: Para búsquedas rápidas por nombre de usuario
--   - IX_usersAlertado_rol: Para filtrar por rol
--   - IX_usersAlertado_activo: Para filtrar usuarios activos
--
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: usersAlertado';
PRINT '------------------------------------------------------------------------------------------------------------';

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='usersAlertado' AND xtype='U')
BEGIN
    CREATE TABLE usersAlertado (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        usuario NVARCHAR(100) UNIQUE NOT NULL,
        password NVARCHAR(255) NOT NULL,
        rol NVARCHAR(50) NOT NULL CHECK (rol IN ('Administrador', 'Operador', 'Tecnico', 'Observador')),
        sitio_asignado NVARCHAR(500) NULL,
        activo BIT NOT NULL DEFAULT 1,
        fecha_creacion DATETIME DEFAULT GETDATE(),
        fecha_modificacion DATETIME DEFAULT GETDATE()
    );

    -- Crear índices para optimizar búsquedas
    CREATE INDEX IX_usersAlertado_usuario ON usersAlertado(usuario);
    CREATE INDEX IX_usersAlertado_rol ON usersAlertado(rol);
    CREATE INDEX IX_usersAlertado_activo ON usersAlertado(activo);
    CREATE INDEX IX_usersAlertado_sitio_asignado ON usersAlertado(sitio_asignado);

    PRINT '✅ Tabla usersAlertado creada exitosamente con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla usersAlertado ya existe';

    -- Agregar columna sitio_asignado si no existe
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usersAlertado') AND name = 'sitio_asignado')
    BEGIN
        ALTER TABLE usersAlertado ADD sitio_asignado NVARCHAR(500) NULL;
        CREATE INDEX IX_usersAlertado_sitio_asignado ON usersAlertado(sitio_asignado);
        PRINT '✅ Columna sitio_asignado añadida a tabla existente';
    END
    ELSE
    BEGIN
        PRINT 'ℹ️  Columna sitio_asignado ya existe';

        -- Verificar si necesita ampliarse el tamaño de la columna
        DECLARE @currentLength INT;
        SELECT @currentLength = CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'usersAlertado' AND COLUMN_NAME = 'sitio_asignado';

        IF @currentLength < 500
        BEGIN
            ALTER TABLE usersAlertado ALTER COLUMN sitio_asignado NVARCHAR(500) NULL;
            PRINT '✅ Tamaño de columna sitio_asignado ampliado a 500 caracteres';
        END
    END
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
-- IMPORTANTE: La contraseña se almacena en texto plano (sin cifrado)
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Insertando usuario administrador por defecto';
PRINT '------------------------------------------------------------------------------------------------------------';

-- Verificar si ya existe un usuario administrador
IF NOT EXISTS (SELECT * FROM usersAlertado WHERE usuario = 'admin')
BEGIN
    INSERT INTO usersAlertado (usuario, password, rol, sitio_asignado, activo, fecha_creacion, fecha_modificacion)
    VALUES (
        'admin',
        'Admin123!',
        'Administrador',
        NULL,
        1,
        GETDATE(),
        GETDATE()
    );

    PRINT '✅ Usuario administrador creado exitosamente';
    PRINT '   Usuario: admin';
    PRINT '   Contraseña: Admin123!';
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

SELECT COUNT(*) as Total_Usuarios FROM usersAlertado;
SELECT usuario, rol, activo, fecha_creacion FROM usersAlertado;

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
PRINT '  3. Crear usuarios adicionales según sea necesario';
PRINT '';
PRINT '============================================================================================================';
GO
