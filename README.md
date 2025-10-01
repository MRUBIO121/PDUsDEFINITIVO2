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
- **Gestión de mantenimiento**: Página dedicada para activar/desactivar modo mantenimiento por rack
- **Búsqueda avanzada**: Buscar racks por nombre, sitio, país o DC
- **Filtros geográficos**: Filtrar por país, sitio y data center
- **Indicador visual**: Racks en mantenimiento se muestran con borde azul y etiqueta "Mantenimiento"
- **Exclusión de conteos**: Los racks en mantenimiento aparecen en la vista de alertas pero NO cuentan para ningún indicador de alerta
- **Base de datos persistente**: Los estados de mantenimiento se almacenan en Supabase

### Filtrado y Búsqueda
- **Filtros geográficos**: País, Sitio, Data Center
- **Filtros de estado**: Crítico, Advertencia
- **Filtros por métrica**: Amperaje, Temperatura, Humedad
- **Búsqueda flexible**: Por sitio, país, DC, nombre del rack, nodo, cadena, número de serie

### Métricas Monitoreadas
- **Amperaje/Corriente**: Soporte para fases monofásicas y trifásicas
- **Temperatura**: Sensores ambientales con umbrales configurables
- **Humedad**: Monitoreo ambiental con umbrales configurables
- **Voltaje y Potencia**: Métricas adicionales disponibles

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
Retorna todos los racks con sus métricas en tiempo real.

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

### Exportación
```http
POST /api/export/alerts
```
Genera archivo Excel con todas las alertas activas.

## Funcionalidades Detalladas

### Sistema de Alertas
El sistema evalúa automáticamente las métricas contra umbrales configurables y genera alertas en tres niveles:
- **Crítico**: Requiere atención inmediata
- **Advertencia**: Requiere monitoreo
- **Normal**: Dentro de rangos normales

### Modo Mantenimiento
Los racks pueden ser marcados en mantenimiento para:
- Evitar falsas alarmas durante trabajos de mantenimiento
- Mantener visibilidad de los racks (se muestran en vista de alertas)
- Excluir de conteos de alertas (no cuentan en indicadores crítico/advertencia)

### Agrupación Inteligente
Los PDUs se agrupan automáticamente por rack lógico cuando comparten:
- Mismo sitio
- Mismo data center
- Mismo nombre de rack

### Visualización Responsiva
- Diseño adaptativo para desktop, tablet y móvil
- Componentes optimizados con React
- Tailwind CSS para estilos consistentes
- Iconos Lucide React

## Seguridad
- Headers de seguridad con Helmet
- CORS configurado
- Validación de entrada
- Gestión segura de credenciales
- SSL ready

## Rendimiento
- Cache en memoria
- Paginación eficiente
- Compresión gzip
- Polling optimizado (30 segundos)

## Logs y Monitoreo

```bash
# Ver logs en tiempo real
pm2 logs energy-monitoring-api

# Ver logs de alertas
pm2 logs energy-monitoring-api | grep "🚨"

# Ver errores
pm2 logs energy-monitoring-api | grep "❌"
```

## Soporte

Para soporte técnico:
- **Logs de aplicación**: `pm2 logs energy-monitoring-api`
- **Health check**: `http://localhost/api/health`
- **Logs de Nginx**: `/var/log/nginx/energy-monitor-*.log`

---

**Energy Monitoring System** © 2025
