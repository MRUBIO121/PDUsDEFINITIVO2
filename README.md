# Sistema de Monitoreo de Energía - Racks y PDUs

Sistema completo de monitoreo en tiempo real para infraestructura de racks y unidades de distribución de energía (PDUs), diseñado para centros de datos. Utiliza exclusivamente datos reales de la API NENG.

## Características Principales

### Dashboard en Tiempo Real
- **Visualización jerárquica**: País → Sitio → Data Center → Racks
- **Estados dinámicos**: Normal, Advertencia, Crítico con indicadores visuales
- **Actualización automática**: Polling cada 30 segundos
- **Barra superior global**: Muestra conteo total de racks y alertas independiente de filtros
- **Racks con múltiples PDUs**: Vista combinada que agrupa PDUs por rack lógico
- **Integración con API NENG**: Datos reales en tiempo real

### Vista de Alertas
- **Toggle Principal/Alertas**: Cambia entre vista completa y solo alertas activas
- **Contadores dinámicos**: Botones de Crítico y Advertencia con contadores en tiempo real
- **Solo alertas activas**: En vista de alertas se muestran únicamente racks con problemas
- **Contadores inteligentes**: Los totales globales se mantienen estáticos, solo cambian los contadores de alertas

### Modo de Mantenimiento
- **Gestión de mantenimiento**: Página dedicada para activar/desactivar modo mantenimiento por rack o chain completa
- **Mantenimiento individual**: Poner racks individuales en mantenimiento
- **Mantenimiento por chain**: Poner chains completas en mantenimiento (todos los racks de una chain en un DC específico)
- **Importación masiva**: Importar hasta 1000 racks desde archivo Excel con plantilla predefinida
- **Descarga de plantilla**: Genera automáticamente plantilla Excel con estructura correcta
- **Búsqueda avanzada**: Buscar racks por nombre, sitio, país o DC
- **Filtros geográficos**: Filtrar por país, sitio y data center
- **Indicador visual**: Racks en mantenimiento se muestran con borde azul y etiqueta "Mantenimiento"
- **Vista expandible**: Cada entrada de mantenimiento puede expandirse para ver detalles de todos los racks incluidos
- **Eliminación flexible**: Eliminar racks individuales o entradas completas (chain o individual)
- **Exclusión de conteos**: Los racks en mantenimiento aparecen en la vista de alertas pero NO cuentan para ningún indicador de alerta
- **Base de datos persistente**: Los estados de mantenimiento se almacenan en SQL Server con información detallada
- **Auditoría completa**: Registro de quién inició el mantenimiento, cuándo, y la razón

### Filtrado y Búsqueda
- **Filtros geográficos**: País, Sitio, Data Center
- **Filtros de estado**: Crítico, Advertencia
- **Filtros por métrica**: Amperaje, Temperatura, Humedad
- **Búsqueda flexible**: Por sitio, país, DC, nombre del rack, nodo, cadena, número de serie

### Métricas Monitoreadas
- **Amperaje**: Fases monofásicas y trifásicas (0A = normal, solo alerta sobrecarga)
- **Temperatura**: Umbrales mínimos y máximos configurables
- **Humedad**: Umbrales mínimos y máximos configurables
- **Voltaje**: Detecta sin energía y sobrevoltaje (0V = crítico, alerta falta de energía)
- **Potencia**: Métrica adicional disponible

### Configuración de Umbrales
- **Interface intuitiva**: Editor gráfico de umbrales críticos y de advertencia
- **Umbrales por fase**: Configuración separada para sistemas monofásicos y trifásicos
- **Métricas configurables**: Temperatura, Humedad, Amperaje (por fase)
- **Almacenamiento persistente**: Base de datos SQL Server
- **Aplicación inmediata**: Cambios se aplican en tiempo real

### Exportación de Datos
- **Exportar a Excel**: Genera archivo Excel con todas las alertas activas
- **Datos completos**: Incluye todas las métricas y razones de alerta
- **Formato profesional**: Archivo Excel con formato y encabezados apropiados

## Arquitectura del Sistema

```
Frontend (React/TypeScript)
    ↓ HTTP/REST
Backend (Node.js/Express)
    ↓ HTTP/REST
API NENG (Datos Reales)
    ↓ SQL
SQL Server (Umbrales)
    ↓ PostgreSQL
Supabase (Mantenimiento)
    ↓ HTTP
Nginx (Reverse Proxy)
```

### Componentes
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite
- **Backend**: Node.js + Express + Winston logging
- **Proxy**: Nginx con compresión gzip
- **Bases de datos**:
  - SQL Server para configuración de umbrales
  - Supabase PostgreSQL para estados de mantenimiento
- **Monitoreo**: PM2 para gestión de procesos
- **Fuente de datos**: API NENG externa en tiempo real

## Instalación

### Prerrequisitos
- Node.js >= 16.0.0
- npm >= 8.0.0
- SQL Server (para umbrales)
- Acceso a Supabase (para mantenimiento)
- Nginx (para proxy)
- PM2 (para producción)

### Configuración

1. **Instalar dependencias**:
```bash
npm install
```

2. **Configurar variables de entorno** (`.env`):
```env
# API NENG
NENG_API_URL=https://api.neng.com/v1/energy/racks
NENG_SENSORS_API_URL=https://api.neng.com/v1/energy/sensors
NENG_API_KEY=tu_clave_api_neng

# SQL Server (Umbrales)
SQL_SERVER_HOST=localhost
SQL_SERVER_DATABASE=energy_monitor_db
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=tu_password
SQL_SERVER_PORT=1433

# Supabase (Mantenimiento)
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key

# Servidor
NODE_ENV=production
PORT=3001
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

## Estructura del Proyecto

```
/
├── src/                          # Frontend React
│   ├── components/               # Componentes
│   │   ├── CountryGroup.tsx     # Agrupación por país
│   │   ├── SiteGroup.tsx        # Agrupación por sitio
│   │   ├── DcGroup.tsx          # Agrupación por DC
│   │   ├── CombinedRackCard.tsx # Tarjeta de rack con múltiples PDUs
│   │   ├── ThresholdManager.tsx # Gestor de umbrales
│   │   └── RackThresholdManager.tsx # Gestor de umbrales por rack
│   ├── pages/                   # Páginas
│   │   └── MaintenancePage.tsx  # Página de gestión de mantenimiento
│   ├── hooks/                   # Hooks personalizados
│   │   ├── useRackData.ts       # Hook para datos de racks
│   │   └── useThresholds.ts     # Hook para umbrales
│   ├── utils/                   # Utilidades
│   └── types/                   # Definiciones TypeScript
├── server.cjs                   # Servidor Express
├── supabase/migrations/         # Migraciones de base de datos
├── ecosystem.config.cjs         # Configuración PM2
├── nginx.conf                   # Configuración Nginx
└── package.json                 # Dependencias
```

## API Endpoints

### Racks de Energía
```http
GET /api/racks/energy
```
Retorna todos los racks con sus métricas en tiempo real desde la API NENG.

**Response**:
```json
{
  "success": true,
  "data": [...],
  "timestamp": "2025-10-07T12:00:00.000Z"
}
```

### Health Check
```http
GET /api/health
```
Verifica el estado del servidor y conexión a API NENG.

### Umbrales
```http
GET /api/thresholds
PUT /api/thresholds
```
Gestiona la configuración de umbrales críticos y de advertencia.

### Mantenimiento - Consultas
```http
GET /api/maintenance
```
Obtiene todas las entradas de mantenimiento activas con sus detalles.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "entry_type": "individual_rack | chain",
      "rack_id": "R-001",
      "chain": "C1",
      "site": "Madrid",
      "dc": "DC1",
      "reason": "Mantenimiento programado",
      "started_by": "Usuario",
      "started_at": "2025-10-07T12:00:00.000Z",
      "racks": [...]
    }
  ]
}
```

### Mantenimiento - Rack Individual
```http
POST /api/maintenance/rack
```
Añade un rack individual al modo mantenimiento.

**Request Body**:
```json
{
  "rackId": "R-001",
  "reason": "Mantenimiento preventivo",
  "startedBy": "Usuario"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Rack R-001 added to maintenance",
  "data": {
    "rackId": "R-001",
    "chain": "C1",
    "dc": "DC1",
    "entryId": "uuid"
  }
}
```

### Mantenimiento - Chain Completa
```http
POST /api/maintenance/chain
```
Añade todos los racks de una chain específica en un DC al modo mantenimiento.

**Request Body**:
```json
{
  "chain": "C1",
  "dc": "DC1",
  "site": "Madrid",
  "reason": "Mantenimiento programado de chain",
  "startedBy": "Usuario"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Chain C1 from DC DC1 added to maintenance",
  "data": {
    "entryId": "uuid",
    "racksAdded": 15,
    "chain": "C1",
    "dc": "DC1",
    "site": "Madrid"
  }
}
```

### Mantenimiento - Eliminar Rack Individual
```http
DELETE /api/maintenance/rack/:rackId
```
Elimina un rack específico del modo mantenimiento. Si era parte de una chain y era el último rack, elimina también la entrada de la chain.

**Response**:
```json
{
  "success": true,
  "message": "Rack R-001 removed from maintenance"
}
```

### Mantenimiento - Eliminar Entrada Completa
```http
DELETE /api/maintenance/entry/:entryId
```
Elimina una entrada completa de mantenimiento (rack individual o chain completa con todos sus racks).

**Response**:
```json
{
  "success": true,
  "message": "Chain C1 from DC DC1 removed from maintenance (15 racks)",
  "data": {
    "entryId": "uuid",
    "entryType": "chain",
    "rackId": null,
    "chain": "C1",
    "dc": "DC1",
    "rackCount": 15
  }
}
```

### Mantenimiento - Descargar Plantilla Excel
```http
GET /api/maintenance/template
```
Descarga la plantilla Excel pre-configurada para importación masiva de racks.

**Response**: Archivo Excel (`plantilla_mantenimiento_racks.xlsx`)

### Mantenimiento - Importación Masiva Excel
```http
POST /api/maintenance/import-excel
Content-Type: multipart/form-data
```
Importa múltiples racks desde un archivo Excel. Máximo 1000 racks por archivo.

**Request**:
- Form-data con campo `file` conteniendo el archivo Excel (.xlsx o .xls)
- El archivo debe contener una hoja llamada exactamente "Datos"
- Columnas requeridas: rack_id, dc
- Columnas opcionales: chain, pdu_id, name, country, site, phase, node, serial, reason

**Response**:
```json
{
  "success": true,
  "message": "Import completed successfully",
  "data": {
    "successful": 45,
    "failed": 2,
    "duplicates": 3,
    "errors": [
      {
        "row": 5,
        "rack_id": "R-005",
        "error": "Duplicate rack_id in file"
      }
    ]
  }
}
```

### Exportación - Alertas a Excel
```http
POST /api/export/alerts
```
Genera y descarga archivo Excel con todas las alertas activas.

**Response**: Archivo Excel con columnas:
- ID PDU, ID Rack, Nombre PDU
- País, Sitio, Data Center
- Fase, Chain, Node, N° Serie
- Corriente, Temperatura, Humedad, Voltaje, Potencia
- Estado, Razones de Alerta
- Detectada, Última Actualización

## Funcionalidades Principales

### Dashboard y Visualización
- Estructura jerárquica: País → Sitio → DC → Racks
- Estados visuales: Verde (normal), Amarillo (advertencia), Rojo (crítico), Azul (mantenimiento)
- Actualización automática cada 30 segundos
- Contadores globales de PDUs y alertas

### Filtros y Búsqueda
- Por estado: Crítico, Advertencia
- Por ubicación: País, Sitio, Data Center
- Por métrica: Amperaje, Temperatura, Humedad
- Búsqueda por: rack, país, sitio, DC, node, cadena, serial

### Umbrales de Alerta

**Configuración de umbrales**:
- Temperatura y Humedad: Mínimos y máximos configurables
- Amperaje: Solo máximos (0A = normal, sin alerta)
- Voltaje: Máximos y mínimos (0V = crítico, SÍ genera alerta)
- Umbrales globales y por rack individual
- Guardado automático en base de datos

### Gestión de Mantenimiento

**Modos de mantenimiento**:
- Rack individual
- Chain completa (todos los racks de una chain en un DC)
- Importación masiva desde Excel (hasta 1000 racks)
- Los racks en mantenimiento no cuentan en alertas

**Importación masiva Excel**:
- Plantilla con campos obligatorios: rack_id, dc
- Hoja debe llamarse "Datos"
- Máximo 1000 racks por archivo
- Validación automática y detección de duplicados

### Sistema de Alertas

**Evaluación por métrica**:
- **Amperaje**: Solo máximos (0A = normal, sin alerta)
- **Voltaje**: Máximos y mínimos (0V = crítico, SÍ alerta)
- **Temperatura/Humedad**: Máximos y mínimos

**Diferencia clave**:
- **0A**: Normal, sin carga, no genera alerta
- **0V**: Crítico, sin energía, SÍ genera alerta

### Exportación
- Exportar alertas a Excel con todas las métricas
- Formato profesional con auto-ajuste de columnas

## Seguridad y Rendimiento
- Headers de seguridad (Helmet.js)
- CORS configurado
- Queries parametrizadas
- Cache en memoria
- Compresión gzip
- Polling: 30s (dashboard), 60s (mantenimiento)

## Logs y Monitoreo

```bash
# Ver logs en tiempo real
pm2 logs energy-monitoring-api

# Ver logs de alertas
pm2 logs energy-monitoring-api | grep "🚨"

# Ver errores
pm2 logs energy-monitoring-api | grep "❌"

# Ver logs de importación
pm2 logs energy-monitoring-api | grep "📥"

# Ver logs de mantenimiento
pm2 logs energy-monitoring-api | grep "maintenance"
```

## Troubleshooting

**Importación Excel**:
- Hoja debe llamarse "Datos" (con acento)
- Campos obligatorios: rack_id, dc
- Máximo 1000 racks por archivo

**Base de datos**:
- Verificar credenciales en `.env`
- Script verificación: `verify-sql-server.bat`
- Logs: `pm2 logs energy-monitoring-api`

---

**Energy Monitoring System** © 2025

Sistema completo de monitoreo de energía para centros de datos con gestión avanzada de mantenimiento, importación masiva, y exportación de datos.
