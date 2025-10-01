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

## Guía Completa de Funcionalidades

### Nivel 1: Funciones Básicas de Visualización

#### 1.1 Vista de Dashboard Principal
- **Acceso**: Al abrir la aplicación se muestra el dashboard principal
- **Visualización jerárquica**: Los racks se organizan automáticamente en estructura de árbol:
  - Nivel 1: País (ej: España, Francia)
  - Nivel 2: Sitio/Ciudad (ej: Madrid, Barcelona)
  - Nivel 3: Data Center (ej: DC1, DC2)
  - Nivel 4: Racks individuales con sus PDUs
- **Indicadores de estado**: Cada rack muestra un círculo de color:
  - Verde: Normal (todas las métricas dentro de rangos normales)
  - Amarillo: Advertencia (una o más métricas fuera de rango de advertencia)
  - Rojo: Crítico (una o más métricas fuera de rango crítico)
  - Azul: Mantenimiento (rack en modo mantenimiento)

#### 1.2 Información en Tarjetas de Rack
Cada tarjeta de rack muestra:
- **Nombre del rack**: Identificador único
- **Número de PDUs**: Cantidad de unidades de distribución en el rack
- **Estado general**: Indicador visual de color
- **Métricas individuales por PDU**:
  - Corriente/Amperaje (A) por fase
  - Temperatura ambiente (°C)
  - Humedad relativa (%)
  - Node y cadena del PDU
  - Número de serie

#### 1.3 Barra Superior Global
- **Total de PDUs**: Contador estático que muestra el total de PDUs en el sistema
- **PDUs Críticos**: Contador dinámico de PDUs con alertas críticas
- **PDUs Advertencia**: Contador dinámico de PDUs con alertas de advertencia
- **Última actualización**: Timestamp de la última consulta a la API
- **Acceso a Mantenimiento**: Botón para ir a la página de gestión de mantenimiento
- **Acceso a Umbrales**: Botón para configurar umbrales globales

#### 1.4 Actualización Automática
- **Polling cada 30 segundos**: El sistema consulta automáticamente la API NENG
- **Indicador de carga**: Muestra cuando se están actualizando los datos
- **Sincronización en tiempo real**: Las métricas se actualizan sin necesidad de recargar la página

### Nivel 2: Funciones de Filtrado y Búsqueda

#### 2.1 Toggle Principal/Alertas
- **Vista Principal**: Muestra todos los racks del sistema
- **Vista Alertas**: Muestra únicamente racks con alertas activas (críticas o advertencia)
- **Cambio dinámico**: Al cambiar entre vistas, los contadores se actualizan automáticamente
- **Racks en mantenimiento**: Se muestran en vista de alertas pero con indicador especial

#### 2.2 Filtros por Estado
- **Botón Crítico**:
  - Muestra contador de PDUs en estado crítico
  - Al hacer clic, filtra solo racks con alertas críticas
  - Color rojo para identificación visual
- **Botón Advertencia**:
  - Muestra contador de PDUs en estado de advertencia
  - Al hacer clic, filtra solo racks con advertencias
  - Color amarillo para identificación visual
- **Combinación de filtros**: Se pueden activar ambos filtros simultáneamente

#### 2.3 Filtros Geográficos
- **Filtro por País**:
  - Dropdown con lista de todos los países disponibles
  - Filtra todos los sitios y DCs del país seleccionado
- **Filtro por Sitio**:
  - Dropdown con lista de sitios disponibles
  - Se actualiza según el país seleccionado
- **Filtro por Data Center**:
  - Dropdown con lista de DCs disponibles
  - Se actualiza según sitio seleccionado
- **Filtros en cascada**: Los filtros se aplican de forma jerárquica

#### 2.4 Filtros por Métrica
- **Filtro Amperaje**: Muestra solo racks con alertas de corriente
- **Filtro Temperatura**: Muestra solo racks con alertas de temperatura
- **Filtro Humedad**: Muestra solo racks con alertas de humedad
- **Múltiples métricas**: Se pueden combinar varios filtros de métrica

#### 2.5 Búsqueda Avanzada
Búsqueda en tiempo real por:
- **Nombre del rack**: Busca por nombre completo o parcial
- **País**: Filtra por nombre de país
- **Sitio**: Filtra por nombre de sitio
- **Data Center**: Filtra por nombre de DC
- **Node**: Busca por identificador de nodo
- **Cadena**: Busca por número de cadena
- **Número de serie**: Busca por serial del PDU
- **Búsqueda fuzzy**: No requiere coincidencia exacta

### Nivel 3: Funciones de Gestión de Umbrales

#### 3.1 Umbrales Globales
Acceso desde botón "Configurar Umbrales" en barra superior:

**Temperatura**:
- Crítico Alto: Límite máximo crítico (°C)
- Advertencia Alto: Límite máximo de advertencia (°C)
- Crítico Bajo: Límite mínimo crítico (°C)
- Advertencia Bajo: Límite mínimo de advertencia (°C)

**Humedad**:
- Crítico Alto: Límite máximo crítico (%)
- Advertencia Alto: Límite máximo de advertencia (%)
- Crítico Bajo: Límite mínimo crítico (%)
- Advertencia Bajo: Límite mínimo de advertencia (%)

**Amperaje por Fase**:
- Monofásica:
  - Crítico Alto (A)
  - Advertencia Alto (A)
  - Crítico Bajo (A)
  - Advertencia Bajo (A)
- Trifásica L1:
  - Crítico Alto (A)
  - Advertencia Alto (A)
  - Crítico Bajo (A)
  - Advertencia Bajo (A)
- Trifásica L2: (mismo formato)
- Trifásica L3: (mismo formato)

**Funcionalidades del editor**:
- Validación en tiempo real
- Prevención de valores inválidos
- Guardado inmediato en base de datos
- Aplicación automática a evaluación de alertas

#### 3.2 Umbrales por Rack
Acceso desde menú de 3 puntos en cada tarjeta de rack:

- **Umbrales personalizados**: Cada rack puede tener sus propios umbrales
- **Prioridad**: Los umbrales de rack tienen prioridad sobre umbrales globales
- **Mismas métricas**: Misma estructura que umbrales globales
- **Override selectivo**: Solo es necesario configurar las métricas que se quieren personalizar

### Nivel 4: Funciones de Gestión de Mantenimiento

#### 4.1 Página de Mantenimiento
Acceso desde botón "Gestión de Mantenimiento" en barra superior:

**Búsqueda de Racks**:
- Campo de búsqueda en tiempo real
- Busca por: nombre de rack, sitio, país, DC
- Resultados instantáneos mientras se escribe

**Filtros**:
- Filtro por País
- Filtro por Sitio
- Filtro por Data Center
- Los filtros se pueden combinar con la búsqueda

**Lista de Racks**:
- Muestra todos los racks disponibles
- Información de cada rack: nombre, sitio, país, DC
- Indicador visual del estado de mantenimiento

#### 4.2 Activar/Desactivar Mantenimiento
Para cada rack en la lista:

**Activar Mantenimiento**:
- Botón "Activar Mantenimiento" visible cuando rack está en operación normal
- Al activar:
  - El rack se marca con estado de mantenimiento en base de datos
  - Se muestra con borde azul en todas las vistas
  - Aparece etiqueta "Mantenimiento"
  - Se excluye de contadores de alertas
  - Permanece visible en vista de alertas

**Desactivar Mantenimiento**:
- Botón "Desactivar Mantenimiento" visible cuando rack está en mantenimiento
- Al desactivar:
  - El rack vuelve a operación normal
  - Se evalúa según métricas y umbrales
  - Vuelve a contar en indicadores de alertas

**Persistencia**:
- Los estados se guardan en Supabase
- Persisten entre recargas de página
- Sincronizados en tiempo real entre todos los usuarios

### Nivel 5: Funciones Avanzadas

#### 5.1 Agrupación Inteligente de PDUs
- **Detección automática**: El sistema agrupa PDUs que pertenecen al mismo rack lógico
- **Criterios de agrupación**:
  - Mismo sitio
  - Mismo data center
  - Mismo nombre de rack
- **Vista combinada**: Los PDUs agrupados se muestran en una sola tarjeta
- **Estado consolidado**: El estado del rack se calcula del estado más crítico de sus PDUs
- **Métricas individuales**: Cada PDU mantiene sus métricas separadas dentro del grupo

#### 5.2 Sistema de Evaluación de Alertas
**Evaluación automática**:
- Cada métrica se compara contra umbrales (globales o personalizados)
- Evaluación por fase para amperaje trifásico
- Soporte para valores 0A (evaluación correcta de amperaje bajo)

**Clasificación de alertas**:
1. **Crítico**: Métrica fuera de rango crítico
2. **Advertencia**: Métrica fuera de rango de advertencia pero dentro de crítico
3. **Normal**: Métrica dentro de todos los rangos

**Razones de alerta**:
- Se genera descripción detallada de cada alerta
- Incluye: métrica afectada, valor actual, umbral, fase (si aplica)
- Múltiples razones si hay varias métricas en alerta

#### 5.3 Exportación de Datos
Acceso desde botón "Exportar Alertas a Excel" en barra superior:

**Contenido del archivo Excel**:
- Todas las alertas activas en el momento de la exportación
- Columnas incluidas:
  - País
  - Sitio
  - Data Center
  - Nombre del Rack
  - Estado (Crítico/Advertencia)
  - Razones de alerta (lista detallada)
  - Corriente (A)
  - Temperatura (°C)
  - Humedad (%)
  - Voltaje (V)
  - Potencia (W)
  - Fase
  - Node
  - Cadena
  - Número de Serie

**Formato**:
- Archivo .xlsx (Excel)
- Encabezados con formato
- Auto-ajuste de columnas
- Descarga automática al navegador

#### 5.4 Menú Contextual de Rack
Acceso desde botón de 3 puntos en cada tarjeta:

**Opciones disponibles**:
1. **Configurar Umbrales**: Abre editor de umbrales específicos del rack
2. **Enviar a Mantenimiento**: Marca el rack en modo mantenimiento (atajo rápido)
3. **Cerrar**: Cierra el menú

**Funcionalidad**:
- Menú desplegable tipo dropdown
- Se cierra al hacer clic fuera
- Se cierra al seleccionar una opción

#### 5.5 Indicadores Visuales Avanzados

**Animaciones**:
- Estados crítico y advertencia tienen animación de pulso
- Transiciones suaves al cambiar estados
- Indicadores de carga durante actualización

**Códigos de color consistentes**:
- Verde: Normal (#10B981)
- Amarillo: Advertencia (#F59E0B)
- Rojo: Crítico (#EF4444)
- Azul: Mantenimiento (#3B82F6)
- Gris: Sin datos o error

**Bordes visuales**:
- Borde izquierdo grueso en tarjetas críticas (rojo)
- Borde izquierdo grueso en tarjetas advertencia (amarillo)
- Borde completo en racks en mantenimiento (azul)

**Badges y etiquetas**:
- Contador de PDUs en cada rack
- Etiqueta "Mantenimiento" en racks correspondientes
- Tooltips informativos en botones

### Nivel 6: Funciones del Sistema

#### 6.1 Gestión de Errores
- **Errores de API**: Se muestran mensajes claros al usuario
- **Timeouts**: Manejo de timeouts de conexión con reintentos automáticos
- **Validación de datos**: Verificación de integridad de datos recibidos
- **Fallbacks**: Comportamiento graceful cuando hay errores

#### 6.2 Caché y Optimización
- **Caché en memoria**: Datos de racks en caché para rendimiento
- **Debouncing**: Búsquedas y filtros con debounce para evitar sobrecarga
- **Lazy loading**: Carga eficiente de componentes
- **Memoización**: Componentes React optimizados con useMemo

#### 6.3 Logging y Auditoría
- **Logs detallados**: Backend registra todas las operaciones
- **Auditoría de cambios**: Cambios de umbrales y mantenimiento registrados
- **Métricas de uso**: Tracking de consultas y operaciones
- **Debugging**: Logs categorizados para facilitar troubleshooting

#### 6.4 Seguridad
- **Validación de entrada**: Sanitización de todos los inputs
- **Headers de seguridad**: Helmet.js implementado
- **CORS**: Configurado para dominios autorizados
- **Autenticación API**: Tokens seguros para API NENG
- **SQL Injection**: Protección con queries parametrizadas

#### 6.5 Responsive Design
- **Breakpoints**: Diseño adaptativo para todas las resoluciones
- **Mobile-first**: Optimizado para dispositivos móviles
- **Touch-friendly**: Elementos táctiles con tamaño apropiado
- **Performance móvil**: Optimizaciones para conexiones lentas

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
