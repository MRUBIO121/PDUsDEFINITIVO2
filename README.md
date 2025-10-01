# Sistema de Monitoreo de Energía - Racks y PDUs

Un sistema completo de monitoreo en tiempo real para infraestructura de racks y unidades de distribución de energía (PDUs), diseñado para centros de datos y facilidades críticas. **Utiliza exclusivamente datos reales de la API NENG**, sin simulaciones ni datos mockeados.

## 🚀 Características Principales

### 📊 Dashboard en Tiempo Real
- **Visualización jerárquica**: País → Sitio → Data Center → Racks
- **Estados dinámicos**: Normal, Advertencia, Crítico con indicadores visuales
- **Actualización automática**: Polling cada 30 segundos con conteo global estático
- **Barra superior global**: Muestra conteo total de racks y alertas independiente de filtros o vista activa
- **Racks**: Soporte para múltiples PDUs por rack con vista combinada
- **Datos reales**: Integración directa con API NENG - Sin datos simulados

### 🔍 Filtrado y Búsqueda Avanzada
- **Vista Principal vs Alertas**: Toggle entre vista completa y solo alertas activas
- **Filtros geográficos**: País, Sitio, Data Center
- **Filtros de estado**: Crítico, Advertencia, Normal
- **Filtros por métrica**: Amperaje, Temperatura, Humedad, Voltaje, Potencia
- **Búsqueda flexible**: Por sitio, país, DC, nombre del rack, nodo, cadena, número de serie

### 📈 Métricas Monitoreadas
- **Amperaje/Corriente**: Con soporte para fases monofásicas y trifásicas
- **Temperatura**: Sensores ambientales
- **Humedad**: Monitoreo ambiental

### ⚙️ Configuración de Umbrales
- **Interface intuitiva**: Editor gráfico de umbrales críticos y de advertencia por métrica
- **Umbrales por fase**: Configuración separada para sistemas monofásicos y trifásicos
  **Métricas configurables**: Temperatura, Humedad, Amperaje (por fase)
- **Almacenamiento persistente**: Base de datos SQL Server
- **Validación en tiempo real**: Aplicación inmediata de cambios

### 📱 Interface Responsiva
- **Diseño adaptativo**: Funciona en desktop, tablet y móvil con componentes optimizados
- **Componentes modernos**: React + TypeScript + Tailwind CSS
- **UX optimizada**: Navegación intuitiva con estados de carga, error y resúmenes ejecutivos
- **Dashboard de alertas**: Vista dedicada con resumen detallado por rack y PDU

## 🏗️ Arquitectura del Sistema

```
Frontend (React/TypeScript)
    ↓ HTTP/REST
Backend (Node.js/Express)
    ↓ HTTP/REST (REAL)
API NENG (Externa)
    ↓ SQL
SQL Server (Umbrales)
    ↓ HTTP
Nginx (Reverse Proxy)
```

**🔒 IMPORTANTE**: El sistema utiliza **ÚNICAMENTE DATOS REALES** de la API NENG. No hay datos simulados, mockeados o de prueba. Todas las métricas (amperaje, temperatura, humedad) provienen directamente de los sensores reales conectados a la API NENG.

### Componentes Principales
- **Frontend**: SPA React con TypeScript y Tailwind CSS
- **Backend**: API REST con Node.js y Express (conectado a API NENG real)
- **Proxy**: Nginx para distribución y balanceo de carga
- **Base de datos**: SQL Server para configuración de umbrales
- **Monitoreo**: PM2 para gestión de procesos y logs
- **Fuente de datos**: API NENG externa (datos reales en tiempo real)

## 🛠️ Instalación y Configuración

### Prerrequisitos
- Node.js >= 16.0.0
- npm >= 8.0.0
- SQL Server (para umbrales)
- Nginx (para proxy)
- PM2 (para producción)

### Configuración del Proyecto

1. **Clonar el repositorio**:
```bash
git clone <repository-url>
cd energy-monitoring-system
```

2. **Instalar dependencias**:
```bash
npm install
```

3. **Configurar variables de entorno**:
```bash
cp .env.example .env
# Editar .env con tu configuración
```

Variables principales:
```env
# API NENG - CONFIGURACIÓN OBLIGATORIA (DATOS REALES)
NENG_API_URL=https://api.neng.com/v1/energy/racks
NENG_SENSORS_API_URL=https://api.neng.com/v1/energy/sensors
NENG_API_KEY=tu_clave_real_de_neng_aqui
API_TIMEOUT=10000

# SQL Server (Umbrales)
SQL_SERVER_HOST=localhost
SQL_SERVER_DATABASE=energy_monitor_db
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=your_password
SQL_SERVER_PORT=1433

# Configuración del servidor
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:5173
```

**⚠️ CRÍTICO**: Las variables `NENG_API_URL` y `NENG_API_KEY` son **OBLIGATORIAS** y deben contener las credenciales reales de la API NENG. El sistema no funcionará sin estas credenciales válidas.

4. **Configurar base de datos**:
```bash
# Las migraciones SQL están en supabase/migrations/
# Ejecutar en SQL Server Management Studio o mediante script
```

5. **Construir el frontend**:
```bash
npm run build
```

### Desarrollo Local

```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run server:dev
```

### Producción

1. **Desplegar con script automatizado**:
```bash
# Ejecutar script de despliegue (Windows)
deploy.bat

# O manualmente:
npm install
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
```

2. **Configurar Nginx**:
```bash
# Copiar configuración
cp nginx.conf /etc/nginx/sites-available/energy-monitoring
# O en Windows: C:\nginx\conf\nginx.conf
```

3. **Comandos útiles PM2**:
```bash
pm2 status              # Ver estado
pm2 logs                # Ver logs en tiempo real
pm2 restart energy-monitoring-api  # Reiniciar
pm2 stop energy-monitoring-api     # Detener
```

## 📁 Estructura del Proyecto

```
/
├── src/                          # Frontend React
│   ├── components/               # Componentes React
│   │   ├── CountryGroup.tsx     # Agrupación por país
│   │   ├── SiteGroup.tsx        # Agrupación por sitio
│   │   ├── DcGroup.tsx          # Agrupación por DC
│   │   ├── RackCard.tsx         # Tarjeta individual de rack/PDU
│   │   ├── CombinedRackCard.tsx # Tarjeta combinada para racks con múltiples PDUs
│   │   └── ThresholdManager.tsx # Gestor de umbrales con validación por métricas
│   ├── hooks/                   # React Hooks personalizados
│   │   ├── useRackData.ts       # Hook para datos de racks
│   │   └── useThresholds.ts     # Hook para umbrales con actualización automática
│   ├── utils/                   # Utilidades
│   │   ├── dataProcessing.ts    # Procesamiento de datos y agrupación jerárquica
│   │   ├── thresholdUtils.ts    # Utilidades de umbrales y evaluación
│   │   └── uiUtils.ts           # Utilidades de UI y colores de estado
│   └── types/                   # Definiciones TypeScript para datos y umbrales
├── server.cjs                   # Servidor Express con API NENG y SQL Server
├── supabase/migrations/         # Migraciones SQL
├── public/                      # Archivos estáticos
├── dist/                        # Build de producción
├── logs/                        # Logs de aplicación (generado)
├── exports/                     # Archivos Excel exportados (generado)
├── nginx.conf                   # Configuración Nginx
├── ecosystem.config.cjs         # Configuración PM2
├── deploy.bat                   # Script de despliegue automatizado
└── package.json                 # Dependencias unificadas (frontend + backend)
```

## 🌐 API Endpoints

### Racks de Energía
```http
GET /api/racks/energy
```
**Fuente de datos**: API NENG real en tiempo real

Respuesta:
```json
{
  "success": true,
  "data": [
    [
      {
        "id": "rack_001",
        "logicalRackId": "logical_001",
        "name": "Rack A1",
        "country": "España",
        "site": "Madrid",
        "dc": "DC1",
        "phase": "3_phase",
        "current": 15.5,
        "temperature": 24.5,
        "status": "normal",
        "sensorTemperature": 23.8,
        "sensorHumidity": 45.2,
        "reasons": []
      }
    ]
  ],
  "message": "Rack data retrieved successfully (REAL DATA from NENG API)",
  "count": 2847,
  "timestamp": "2025-01-07T10:30:00Z"
}
```

### Health Check
```http
GET /api/health
```
**Respuesta**:
```json
{
  "success": true,
  "message": "Energy Monitoring API is running",
  "version": "1.0.0",
  "dataSource": "REAL NENG API - No mock data",
  "timestamp": "2025-01-07T10:30:00Z"
}
```

### Umbrales de Configuración
```http
GET /api/thresholds
PUT /api/thresholds
```

GET Respuesta:
```json
{
  "success": true,
  "data": [
    {
      "key": "critical_temperature_high",
      "value": 40.0,
      "unit": "°C",
      "description": "Temperatura crítica máxima"
    }
  ]
}
```

PUT Request:
```json
{
  "thresholds": {
    "critical_temperature_high": 42.0,
    "warning_temperature_high": 35.0
  }
}
```

### Exportación de Alertas
```http
POST /api/export/alerts
```
**Genera archivo Excel**: Con todas las alertas activas basadas en datos reales de NENG API.

## 🔧 Características Técnicas

### Frontend
- **Framework**: React 18 con TypeScript
- **Estilos**: Tailwind CSS
- **Iconos**: Lucide React
- **Routing**: React Router DOM v7
- **Estado**: React Hooks (useState, useEffect)
- **Build**: Vite

### Backend
- **Runtime**: Node.js con Express (conectado a API NENG real)
- **Middleware**: CORS, Helmet, Morgan
- **Logging**: Winston con rotación de archivos
- **Base de datos**: SQL Server con mssql
- **Paginación**: Automática con parámetros `skip` y `limit` y logging detallado
- **Evaluación de alertas**: Lógica de umbrales por fase y métrica (temperatura, humedad, amperaje) con soporte completo para valores de 0A

### Despliegue
- **Datos**: Exclusivamente de API NENG externa (sin mock data)
- **Proxy**: Nginx con compresión gzip
- **Process Manager**: PM2 con clustering
- **Logs**: Centralizados con Winston y PM2
- **SSL**: Configuración lista para HTTPS

## 🆕 Cambios y Mejoras Recientes

### v1.4.0 - Datos Reales Exclusivamente
- ✅ **Eliminación de datos mock**: Removidos todos los datos simulados o de prueba
- ✅ **API NENG real**: Integración directa con API NENG real sin fallbacks simulados
- ✅ **Autenticación real**: Uso obligatorio de credenciales reales de NENG
- ✅ **Validación estricta**: Verificación de configuración de API real en startup
- ✅ **Gestión de alertas críticas**: Base de datos de alertas activas en tiempo real

### v1.3.3 - Correcciones Críticas de Evaluación y Conteo de Alertas
- ✅ **Evaluación mejorada de amperaje**: Ahora evalúa correctamente PDUs con amperaje 0A contra umbrales bajos críticos y de advertencia
- ✅ **Conteo preciso de advertencias de temperatura**: Corregida la lógica que incorrectamente clasificaba advertencias de temperatura como críticas
- ✅ **Mensaje de error simplificado**: Cuando no se encuentra ID de rack, ahora muestra simplemente "Error" en lugar del mensaje extenso
- ✅ **Estabilidad mejorada**: Solucionado error JavaScript `ReferenceError: rackGroups is not defined` en SiteGroup

### v1.3.2 - Consistencia en Conteo de PDUs Totales
- ✅ **Conteo unificado en barra superior**: La barra superior ahora muestra el total de PDUs individuales para coincidir con el conteo granular de la página principal
- ✅ **Separación clara de métricas**: Barra superior muestra "PDUs totales" y "PDUs con alertas", mientras que los encabezados de grupos (País, Sitio, DC) mantienen el conteo de "racks lógicos"
- ✅ **Consistencia visual**: Eliminada la discrepancia entre el conteo de la barra superior (1277) y la página principal (1313)

### v1.3.1 - Conteos Consistentes y Globales
- ✅ **Conteos estáticos unificados**: Barra superior, encabezados de países, sitios y DCs muestran conteos totales globales
- ✅ **Consistencia total**: El número de racks totales es idéntico entre la barra superior y todos los encabezados de grupos
- ✅ **Independencia de filtros**: Los conteos totales no cambian con filtros activos, solo los conteos de alertas son dinámicos

### v1.3.0 - Dashboard Completo de Alertas
- ✅ **Conteo global estático**: Barra superior muestra totales globales independientes de filtros
  ✅ **Resumen completo de alertas**: Incluye todas las métricas (amperaje, temperatura, humedad)
- ✅ **Dashboard dual**: Resumen por rack lógico y por PDU individual
- ✅ **Filtros avanzados por métrica**: Filtrado específico por tipo de alerta y métrica

### v1.2.0 - Mejoras de Paginación y Debugging
- ✅ **Paginación mejorada**: Parámetro `limit` explícito con logging detallado por request
- ✅ **Sistema de debugging**: Logs completos para diagnóstico de conectividad y respuestas API
- ✅ **Robustez mejorada**: Mejor manejo de errores y respuestas vacías

### v1.1.0 - Racks Lógicos y Filtrado Avanzado  
### v1.1.0 - Racks y Filtrado Avanzado  
- ✅ **Racks**: Múltiples PDUs por rack con `CombinedRackCard` component
- ✅ **Vista de alertas**: Vista dedicada con toggle Principal/Alertas
- ✅ **Filtros por métrica**: Filtrado por tipo de alerta y métrica específica
- ✅ **Búsqueda dirigida**: Búsqueda por campos específicos

### v1.0.0 - Versión Inicial
- ✅ **Monitoreo básico**: Visualización jerárquica de racks y métricas
- ✅ **Configuración de umbrales**: Interface para gestión de límites
- ✅ **Sistema de alertas**: Notificaciones visuales con códigos de colores
- ✅ **Responsive design**: Compatible con dispositivos móviles

## 📊 Logging y Monitoreo

### Verificación de Datos Reales
```bash
# Verificar conexión a API NENG real
pm2 logs energy-monitoring-api | grep "NENG API"

# Verificar que no hay datos mock
pm2 logs energy-monitoring-api | grep -i "mock\|simulat\|fake"
```

### Logs del Sistema
```bash
# Ver logs en tiempo real
pm2 logs energy-monitoring-api

# Ver logs de evaluación de umbrales y PDUs con alertas
pm2 logs energy-monitoring-api | grep "🚨"

# Ver logs específicos de evaluación para PDUs con amperaje 0
pm2 logs energy-monitoring-api | grep "Current=0"

# Ver logs de paginación y debugging específicamente  
pm2 logs energy-monitoring-api | grep "PAGINATION"

# Ver errores y problemas de conectividad
pm2 logs energy-monitoring-api | grep "❌"

# Ver resúmenes de datos y estadísticas
pm2 logs energy-monitoring-api | grep "🎯"
```

### Métricas Disponibles
- Logs de acceso de Nginx
- Logs de aplicación con Winston
- Métricas de PM2 (CPU, memoria, uptime)
- Logs detallados de paginación API y evaluación de umbrales
- Estadísticas de alertas por tipo y métrica

## 🔒 Seguridad

- **Headers de seguridad**: Implementados con Helmet
- **CORS**: Configurado para dominios específicos
- **Validación de entrada**: Sanitización de parámetros
- **SSL**: Configuración lista para certificados
- **Tokens de API**: Gestión segura de credenciales NENG

## 🚀 Rendimiento

- **Caching**: Cache en memoria de datos de racks
- **Paginación eficiente**: Procesamiento por lotes de API externa con logging detallado
- **Compresión**: Gzip habilitado en Nginx
- **API real**: Conexión directa a NENG API sin overhead de simulación

## 🔒 Integridad de Datos

- ✅ **Sin datos simulados**: El sistema rechaza cualquier intento de usar datos mock
- ✅ **Validación de API**: Verifica conectividad con NENG API en cada request
- ✅ **Autenticación obligatoria**: Requiere credenciales reales válidas
- ✅ **Logging transparente**: Todos los logs indican origen de datos real
- **Componentes optimizados**: `CombinedRackCard` para racks lógicos múltiples
- **Componentes optimizados**: `CombinedRackCard` para racks múltiples
- **Debouncing**: En búsquedas y filtros
- **Conteo eficiente**: Uso de Sets para conteo único de racks con alertas

## 📋 Próximas Mejoras

- [ ] **Notificaciones push**: Alertas en tiempo real y webhooks
- [ ] **Exportación de datos**: CSV/Excel de métricas
- [ ] **Gráficos históricos**: Tendencias temporales
- [ ] **API de webhooks**: Integración con sistemas externos
- [ ] **Dashboard administrativo**: Gestión de usuarios, permisos y configuración avanzada
- [ ] **Alertas por email/SMS**: Notificaciones automáticas críticas
- [ ] **Validación avanzada de datos**: Detección automática de lecturas inválidas de sensores
- [ ] **Histórico de cambios de umbrales**: Auditoría completa de modificaciones de configuración

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama de feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit de cambios (`git commit -am 'Añade nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia ISC.

## 📞 Soporte

Para soporte técnico o consultas:
- **Logs de aplicación**: `pm2 logs energy-monitoring-api`
- **Logs de Nginx**: `/var/log/nginx/energy-monitor-*.log`
- **Health check**: `http://localhost/api/health` (incluye verificación de fuente de datos real)
- **Verificación NENG API**: Los logs muestran el estado de conexión con la API real

---

**Energy Monitoring System - Powered by Real NENG API Data** © 2025