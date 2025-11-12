# Sistema de Monitoreo de Energía - Racks y PDUs

Sistema completo de monitoreo en tiempo real para infraestructura de racks y unidades de distribución de energía (PDUs), diseñado para centros de datos.

## Características Principales

### 🎯 Dashboard en Tiempo Real
- Visualización jerárquica: País → Sitio → Data Center → Gateway → Racks
- Estados dinámicos con indicadores visuales (Normal, Advertencia, Crítico, Mantenimiento)
- Actualización automática cada 30 segundos
- Vista combinada que agrupa múltiples PDUs por rack lógico
- Contadores globales independientes de filtros activos
- Agrupamiento por Gateway con información de nombre e IP

### 📊 Vista de Alertas
- Toggle entre vista completa y solo alertas activas
- Resumen de alertas por Rack y por PDU
- Contadores dinámicos por tipo de alerta (Crítico/Advertencia)
- Filtrado por métrica (Amperaje, Temperatura, Humedad, Voltaje)
- Los racks en mantenimiento no cuentan en alertas

### 🔧 Modo de Mantenimiento
- Gestión de mantenimiento por rack individual o chain completa
- Importación masiva desde Excel (hasta 1000 racks)
- Descarga de plantilla Excel con estructura predefinida
- Vista expandible con detalles de todos los racks en mantenimiento
- Eliminación flexible (individual o por entrada completa)
- Auditoría completa con registro de usuario, fecha y razón
- Persistencia en base de datos

### 🔍 Filtrado y Búsqueda
- Filtros geográficos: País, Sitio, Data Center, Gateway
- Filtros jerárquicos con actualización dinámica de opciones disponibles
- Botones "Mostrar más/menos" para Data Centers y Gateways (>4 elementos)
- Filtros de estado: Crítico, Advertencia
- Filtros por métrica: Amperaje, Temperatura, Humedad, Voltaje
- Búsqueda por: sitio, país, DC, nombre de rack, nodo, cadena, número de serie
- Auto-selección de filtro cuando el usuario tiene un solo sitio asignado
- Unificación de sitios Cantabria (Norte y Sur se muestran como "Cantabria")
- Reseteo automático en cascada de filtros inferiores al cambiar un filtro superior

### 📈 Métricas Monitoreadas
- **Amperaje**: Fases monofásicas y trifásicas (0A = normal, solo alerta sobrecarga)
- **Temperatura**: Umbrales mínimos y máximos configurables
- **Humedad**: Umbrales mínimos y máximos configurables
- **Voltaje**: Detecta sin energía y sobrevoltaje (0V = crítico)
- **Potencia**: Métrica adicional disponible

### ⚙️ Configuración de Umbrales
- Editor gráfico de umbrales críticos y de advertencia
- Umbrales globales y por rack individual
- Configuración separada para sistemas monofásicos y trifásicos
- Almacenamiento persistente en base de datos
- Aplicación inmediata de cambios

### 📤 Exportación de Datos
- Exportar alertas a Excel con todas las métricas
- Descarga directa en el navegador del cliente
- Formato profesional con encabezados descriptivos
- Incluye todas las razones de alerta por PDU

### 👥 Sistema de Usuarios y Permisos

#### Roles Disponibles
1. **Administrador**: Control total incluyendo gestión de usuarios
2. **Operador**: Control total excepto gestión de usuarios
3. **Técnico**: Ver alertas y gestionar mantenimiento solamente
4. **Observador**: Solo lectura sin permisos de modificación

#### Restricciones por Sitio
- Los usuarios pueden tener sitios asignados que restringen su acceso
- Las restricciones aplican a TODOS los roles, incluidos Administradores
- Usuarios con sitios asignados:
  - Solo ven datos de sus sitios
  - Solo pueden gestionar mantenimiento de sus sitios
  - Solo pueden configurar umbrales de sus sitios
  - Solo pueden finalizar mantenimientos de sus sitios
- Banner informativo indica los sitios asignados al usuario
- Botones deshabilitados visualmente para equipos fuera de permisos
- Unificación automática de Cantabria Norte y Cantabria Sur

#### Gestión de Usuarios (Solo Administradores)
- **Crear usuarios**: Asignar usuario, contraseña, rol y sitios específicos
- **Editar usuarios**: Modificar roles, contraseñas y sitios asignados
- **Eliminar usuarios**: Soft delete (desactivar sin borrar del sistema)
- **Listar usuarios**: Vista completa con filtros y estados
- **Permisos granulares**: Control de acceso por sitio
- Contraseñas almacenadas en texto plano (sin cifrado)
- Interfaz dedicada accesible desde el menú principal
- Listado de todos los sitios disponibles en el sistema

#### Credenciales por Defecto
- **Usuario**: `admin`
- **Contraseña**: `Admin123!`

## Arquitectura del Sistema

```
Frontend (React/TypeScript)
    ↓ HTTP/REST
Backend (Node.js/Express)
    ↓ SQL
SQL Server (Datos, Configuración y Usuarios)
    ↓ HTTP
Nginx (Reverse Proxy)
```

### Jerarquía de Datos
```
País
  └── Sitio
      └── Data Center
          └── Gateway (nombre + IP)
              └── Racks (agrupados por ID lógico)
                  └── PDUs individuales
```

### Stack Tecnológico
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite 7
- **Backend**: Node.js + Express + Winston logging
- **Proxy**: Nginx con compresión gzip
- **Base de datos**: SQL Server (configuración y usuarios)
- **Monitoreo**: PM2 para gestión de procesos
- **Seguridad**: Sin vulnerabilidades conocidas (actualizado constantemente)

## Instalación

### Prerrequisitos
- Node.js >= 16.0.0
- npm >= 8.0.0
- SQL Server
- Nginx (para producción)
- PM2 (para producción)

### Configuración

1. **Instalar dependencias**:
```bash
npm install
```

2. **Configurar variables de entorno** (`.env`):
```env
# SQL Server
SQL_SERVER_HOST=localhost
SQL_SERVER_DATABASE=energy_monitor_db
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=tu_password
SQL_SERVER_PORT=1433

# Autenticación (REQUERIDO)
SESSION_SECRET=your_session_secret_here_change_in_production

# Servidor
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:5173
```

3. **Construir el frontend**:
```bash
npm run build
```

### Desarrollo

```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run server:dev
```

### Producción

```bash
# Desplegar con PM2
npm install
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
```

## API Endpoints

### Autenticación

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "usuario": "admin",
  "password": "Admin123!"
}
```

#### Logout
```http
POST /api/auth/logout
```

#### Verificar Sesión
```http
GET /api/auth/session
```

### Gestión de Usuarios (Solo Administrador)

```http
GET /api/users                    # Listar usuarios
POST /api/users                   # Crear usuario
PUT /api/users/:id                # Actualizar usuario
DELETE /api/users/:id             # Eliminar usuario (soft delete)
```

### Racks y Métricas

```http
GET /api/racks/energy             # Obtener racks con métricas
GET /api/health                   # Health check
```

### Umbrales

```http
GET /api/thresholds               # Obtener umbrales
PUT /api/thresholds               # Actualizar umbrales
GET /api/rack-thresholds/:rackId  # Umbrales específicos de rack
PUT /api/rack-thresholds/:rackId  # Actualizar umbrales de rack
DELETE /api/rack-thresholds/:rackId # Eliminar umbrales de rack
```

### Mantenimiento

```http
GET /api/maintenance              # Listar entradas de mantenimiento
POST /api/maintenance/rack        # Añadir rack individual
POST /api/maintenance/chain       # Añadir chain completa
DELETE /api/maintenance/rack/:rackId # Eliminar rack
DELETE /api/maintenance/entry/:entryId # Eliminar entrada completa
DELETE /api/maintenance/all       # Finalizar todo el mantenimiento
GET /api/maintenance/template     # Descargar plantilla Excel
POST /api/maintenance/import-excel # Importar desde Excel
```

### Exportación

```http
POST /api/export/alerts           # Exportar alertas a Excel
```

## Funcionalidades Destacadas

### Filtros Geográficos Jerárquicos
- **Jerarquía**: País → Sitio → Data Center → Gateway
- **Actualización Dinámica**: Los filtros inferiores se actualizan según la selección superior
- **Reseteo en Cascada**: Cambiar un filtro superior resetea automáticamente los inferiores
- **UI Optimizada**: Botón "Mostrar más/menos" para listas con >4 elementos
- **Gateway**: Muestra nombre del gateway con IP en tooltip al hacer hover
- **Auto-selección**: Filtro automático para usuarios con un solo sitio asignado

### Unificación de Cantabria
- Los sitios "Cantabria Norte" y "Cantabria Sur" se unifican como "Cantabria"
- Usuarios con cualquiera de estos sitios asignados pueden gestionar ambos
- Filtro geográfico se auto-selecciona como "Cantabria" para estos usuarios
- Permisos funcionan transparentemente para ambos sitios

### Importación Masiva Excel
- Plantilla con campos obligatorios: `rack_id`, `dc`
- Campos opcionales: `chain`, `pdu_id`, `name`, `country`, `site`, `phase`, `node`, `serial`, `reason`
- Hoja debe llamarse "Datos"
- Máximo 1000 racks por archivo
- Validación automática y detección de duplicados

### Sistema de Alertas
- **Amperaje**: Solo máximos (0A = normal, sin alerta)
- **Voltaje**: Máximos y mínimos (0V = crítico, SÍ alerta)
- **Temperatura/Humedad**: Máximos y mínimos
- Alertas por PDU individual y resumen por Rack
- Exclusión automática de racks en mantenimiento

### Permisos por Sitio
- Restricciones aplican a todos los roles
- Validación en frontend (botones deshabilitados) y backend (endpoints protegidos)
- Banner informativo con sitios asignados
- Auto-filtrado geográfico para usuarios con un sitio

## Seguridad

- Headers de seguridad con Helmet.js
- CORS configurado correctamente
- Queries parametrizadas para prevenir SQL injection
- Sesiones con express-session
- Validación de permisos en cada endpoint
- Logging completo de acciones de usuarios

## Rendimiento

- Cache en memoria para datos frecuentes
- Compresión gzip en Nginx
- Polling optimizado: 30s (dashboard), 60s (mantenimiento)
- Debouncing en búsquedas y filtros
- Lazy loading de componentes

## Monitoreo

```bash
# Ver logs en tiempo real
pm2 logs energy-monitoring-api

# Ver estado de procesos
pm2 status

# Reiniciar aplicación
pm2 restart energy-monitoring-api

# Ver uso de recursos
pm2 monit
```

## Troubleshooting

### Problemas de Autenticación
- Verificar que `SESSION_SECRET` está configurado en `.env`
- Verificar conexión a SQL Server
- Verificar que la tabla `usersAlertado` existe

### Problemas de Importación Excel
- Hoja debe llamarse exactamente "Datos"
- Campos obligatorios: `rack_id`, `dc`
- Máximo 1000 racks por archivo
- Archivo debe ser .xlsx o .xls

### Problemas de Base de Datos
- Ejecutar `verify-sql-server.bat` para verificar conexión
- Verificar credenciales en `.env`
- Revisar logs: `pm2 logs energy-monitoring-api`

### Problemas de Permisos
- Verificar que el usuario tiene sitios asignados correctamente
- Verificar que el rol es el apropiado
- Los Administradores con sitios asignados están restringidos a esos sitios

### Problemas con Nginx

#### Error: CreateDirectory() "D:\nginx/temp/client_body_temp" failed

**Causa**: Los directorios temporales de nginx no existen.

**Solución Rápida**:
```powershell
# PowerShell (Ejecutar como Administrador)
.\setup-nginx.ps1
```

O manualmente:
```powershell
# Crear directorios temporales
New-Item -ItemType Directory -Force -Path "D:\nginx\temp\client_body_temp"
New-Item -ItemType Directory -Force -Path "D:\nginx\temp\proxy_temp"
New-Item -ItemType Directory -Force -Path "D:\nginx\temp\fastcgi_temp"
New-Item -ItemType Directory -Force -Path "D:\nginx\temp\uwsgi_temp"
New-Item -ItemType Directory -Force -Path "D:\nginx\temp\scgi_temp"

# Crear directorio para la aplicación
New-Item -ItemType Directory -Force -Path "D:\nginx\pdus\dist"
```

**Batch/CMD**:
```batch
REM Ejecutar como Administrador
setup-nginx.bat
```

**Verificar configuración**:
```bash
cd D:\nginx
nginx.exe -t
```

**Iniciar nginx**:
```bash
cd D:\nginx
nginx.exe
```

**Detener nginx**:
```bash
cd D:\nginx
nginx.exe -s stop
```

Para instrucciones detalladas, consultar: `NGINX_SETUP.txt`

---

**Energy Monitoring System** © 2025

Sistema completo de monitoreo de energía para centros de datos con gestión avanzada de mantenimiento, permisos por sitio, y exportación de datos.
