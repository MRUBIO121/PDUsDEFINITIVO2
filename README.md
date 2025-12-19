# Sistema de Monitoreo de Energia - Racks y PDUs

Sistema de monitoreo en tiempo real para infraestructura de racks y PDUs en centros de datos.

## Requisitos Previos

- Node.js >= 16.0.0
- npm >= 8.0.0
- SQL Server 2017 o superior
- Nginx (para produccion)
- PM2 (para produccion)

## Instalacion Paso a Paso

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd energy-monitoring-system
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar la base de datos

Ejecutar el script SQL en SQL Server Management Studio o sqlcmd:

```bash
sqlcmd -S localhost -U sa -P tu_password -i sql/complete_database_setup.sql
```

Este script crea:
- Base de datos `energy_monitor_db`
- Todas las tablas necesarias
- Umbrales por defecto
- Usuario administrador inicial

### 4. Configurar variables de entorno

Copiar el archivo de ejemplo y editar con tus valores:

```bash
cp .env.example .env
```

Editar `.env` con los siguientes valores minimos requeridos:

```env
# Servidor
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:5173

# SQL Server (REQUERIDO)
SQL_SERVER_HOST=localhost
SQL_SERVER_DATABASE=energy_monitor_db
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=tu_password_sql
SQL_SERVER_PORT=1433

# API NENG (REQUERIDO - Fuente de datos de racks)
NENG_API_URL=https://tu-api-neng.com/v1/energy/racks
NENG_SENSORS_API_URL=https://tu-api-neng.com/v1/energy/sensors
NENG_API_KEY=tu_api_key_neng

# Sesion (REQUERIDO - Cambiar en produccion)
SESSION_SECRET=cambiar_este_secreto_en_produccion

# SONAR (OPCIONAL - Para integracion de alertas)
SONAR_API_URL=https://tu-sonar-api.com/alerts
SONAR_BEARER_TOKEN=tu_token_sonar
SONAR_SKIP_SSL_VERIFY=false
```

### 5. Construir el frontend

```bash
npm run build
```

## Ejecucion

### Desarrollo

Abrir dos terminales:

```bash
# Terminal 1 - Frontend (Vite dev server)
npm run dev

# Terminal 2 - Backend (Express server)
npm run server:dev
```

Acceder a `http://localhost:5173`

### Produccion

```bash
# Construir frontend
npm run build

# Iniciar con PM2
pm2 start ecosystem.config.cjs --env production
pm2 save
```

## Credenciales por Defecto

- **Usuario**: `admin`
- **Password**: `Admin123!`

## Estructura de Roles

| Rol | Permisos |
|-----|----------|
| Administrador | Control total + gestion de usuarios |
| Operador | Control total excepto usuarios |
| Tecnico | Ver alertas + gestionar mantenimiento |
| Observador | Solo lectura |

## Configuracion de Nginx (Produccion)

Ver archivo `NGINX_SETUP.txt` para instrucciones detalladas.

Configuracion basica en Windows:

```powershell
# Crear directorios temporales
.\setup-nginx.ps1

# Verificar configuracion
cd D:\nginx
nginx.exe -t

# Iniciar nginx
nginx.exe
```

## Comandos Utiles

```bash
# Ver logs en tiempo real
pm2 logs energy-monitoring-api

# Ver estado de procesos
pm2 status

# Reiniciar aplicacion
pm2 restart energy-monitoring-api

# Detener aplicacion
pm2 stop energy-monitoring-api
```

## Verificacion de Conexion

```bash
# Verificar conexion a SQL Server (Windows)
verify-sql-server.bat
```

## Troubleshooting

### Error de conexion a SQL Server
- Verificar que SQL Server esta ejecutandose
- Verificar credenciales en `.env`
- Verificar que el puerto 1433 esta abierto

### Error de sesion/autenticacion
- Verificar que `SESSION_SECRET` esta configurado
- Verificar que la tabla `usersAlertado` existe en la BD

### Frontend no carga datos
- Verificar que el backend esta corriendo en el puerto correcto
- Verificar configuracion de CORS en `FRONTEND_URL`
- Verificar credenciales de API NENG

### Nginx no inicia (Windows)
- Ejecutar `setup-nginx.ps1` como Administrador
- Verificar que los directorios temporales existen

## Arquitectura

```
Frontend (React/Vite)
    |
    v
Backend (Express/Node.js) --> SQL Server
    |
    v
API NENG (Datos de racks)
    |
    v
SONAR API (Alertas - opcional)
```

## Licencia

Uso interno - Todos los derechos reservados
