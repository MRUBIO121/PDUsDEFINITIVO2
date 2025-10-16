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
- **Amperaje/Corriente**: Soporte para fases monofásicas y trifásicas (solo evalúa umbrales máximos, 0A es valor normal)
- **Temperatura**: Sensores ambientales con umbrales configurables
- **Humedad**: Monitoreo ambiental con umbrales configurables
- **Voltaje**: Monitoreo de voltaje con umbrales configurables (mínimo siempre 0V, evalúa sobrevoltaje)
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
  - Crítico Alto (A) - Solo evalúa sobrecarga
  - Advertencia Alto (A) - Solo evalúa sobrecarga
  - Nota: Los umbrales mínimos se ignoran, 0A es un valor normal
- Trifásica L1:
  - Crítico Alto (A) - Solo evalúa sobrecarga
  - Advertencia Alto (A) - Solo evalúa sobrecarga
  - Nota: Los umbrales mínimos se ignoran, 0A es un valor normal
- Trifásica L2: (mismo formato)
- Trifásica L3: (mismo formato)

**Voltaje**:
- Crítico Alto (V) - Detecta sobrevoltaje peligroso (ej: >250V para sistemas 220V)
- Advertencia Alto (V) - Detecta sobrevoltaje leve (ej: >240V para sistemas 220V)
- Crítico Bajo: Siempre 0V (sin energía es condición normal, no alerta)
- Advertencia Bajo: Siempre 0V (sin energía es condición normal, no alerta)
- Nota: El sistema evalúa principalmente sobrevoltaje que puede dañar equipos

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

**Vista de Entradas de Mantenimiento**:
- Lista de todas las entradas de mantenimiento activas
- Cada entrada muestra: tipo (individual/chain), identificador, DC, sitio, razón, fecha inicio, iniciado por
- Vista expandible/colapsable para ver detalles de cada entrada
- Actualización automática cada 60 segundos
- Contador total de entradas activas

**Tipos de Entradas**:
1. **Individual Rack**: Una sola entrada para un rack específico
2. **Chain Completa**: Una entrada que agrupa todos los racks de una chain en un DC

**Información Detallada por Entrada**:
- **ID único**: Identificador de la entrada de mantenimiento
- **Tipo**: Individual o Chain
- **Rack ID / Chain**: Identificador del rack o nombre de la chain
- **Data Center**: DC donde se encuentra
- **Sitio**: Ubicación física
- **Razón**: Motivo del mantenimiento
- **Iniciado por**: Usuario que activó el mantenimiento
- **Fecha de inicio**: Timestamp de cuándo se activó
- **Lista de racks**: Expandible para ver todos los racks incluidos en la entrada

#### 4.2 Importación Masiva desde Excel

**Descarga de Plantilla**:
1. Hacer clic en botón "Descargar Plantilla Excel" en la página de mantenimiento
2. Se descarga automáticamente archivo `plantilla_mantenimiento_racks.xlsx`
3. La plantilla contiene:
   - Hoja llamada "Datos" (obligatorio)
   - Encabezados predefinidos en la primera fila
   - Estructura correcta de columnas

**Estructura de la Plantilla Excel**:

| Columna | Obligatorio | Descripción | Ejemplo |
|---------|-------------|-------------|---------|
| rack_id | SI | Identificador único del rack | R-001 |
| dc | SI | Data Center | DC1 |
| chain | NO | Chain del rack | C1 |
| pdu_id | NO | ID del PDU | PDU-001 |
| name | NO | Nombre descriptivo | Rack Principal |
| country | NO | País | España |
| site | NO | Sitio/Ciudad | Madrid |
| phase | NO | Fase eléctrica | L1 |
| node | NO | Nodo | N01 |
| serial | NO | Número de serie | SN123456 |
| reason | NO | Razón del mantenimiento | Mantenimiento preventivo |

**Proceso de Importación**:
1. Rellenar la plantilla Excel con los datos de los racks
2. IMPORTANTE: La hoja debe llamarse exactamente "**Datos**" (con acento)
3. Máximo 1000 racks por archivo
4. Hacer clic en botón "Importar desde Excel" en la página de mantenimiento
5. Seleccionar el archivo Excel rellenado
6. El sistema procesa el archivo y muestra resumen:
   - Racks importados exitosamente
   - Racks fallidos (con razón del error)
   - Racks duplicados (ya estaban en mantenimiento)
   - Errores detallados por fila

**Validaciones Automáticas**:
- Verificación de hoja "Datos"
- Validación de campos obligatorios (rack_id, dc)
- Detección de duplicados en el archivo
- Detección de racks ya en mantenimiento
- Límite de 1000 racks por importación
- Validación de formato de archivo (.xlsx o .xls)

**Manejo de Errores Comunes**:
- **"Excel file must contain a sheet named Datos"**: La hoja debe llamarse exactamente "Datos" (con D mayúscula y acento en la 'a')
- **"rack_id and dc are required"**: Faltan campos obligatorios en alguna fila
- **"Duplicate rack_id in file"**: El mismo rack_id aparece múltiples veces en el archivo
- **"Rack already in maintenance"**: El rack ya estaba en mantenimiento antes de la importación
- **"Too many racks"**: El archivo contiene más de 1000 racks

**Resultado de la Importación**:
```
Importación completada:
✓ Exitosos: 45 racks
✗ Fallidos: 2 racks
⚠ Duplicados: 3 racks

Errores:
- Fila 5 (R-005): Duplicate rack_id in file
- Fila 12 (R-012): Rack already in maintenance
```

#### 4.3 Activar Mantenimiento Manual

**Rack Individual**:
- Desde la página de mantenimiento o desde el menú de 3 puntos en cada tarjeta
- Al activar:
  - Se crea una entrada de tipo "individual_rack"
  - El rack se marca con borde azul en todas las vistas
  - Aparece etiqueta "Mantenimiento"
  - Se excluye de contadores de alertas
  - Permanece visible en vista de alertas

**Chain Completa**:
- Disponible desde la interfaz de usuario
- Al activar:
  - Se crea una entrada de tipo "chain"
  - Se buscan todos los racks de esa chain en el DC especificado
  - Todos los racks encontrados se añaden a la entrada
  - Filtrado inteligente: solo racks con nombres válidos
  - Consolidación automática: múltiples PDUs del mismo rack físico se agrupan

**Información Requerida**:
- **Para rack individual**: rack_id, reason (opcional), startedBy (opcional)
- **Para chain**: chain, dc, site (opcional), reason (opcional), startedBy (opcional)

#### 4.4 Eliminar de Mantenimiento

**Eliminación Individual de Rack**:
- Botón de eliminar (X) junto a cada rack en la vista expandida
- Confirma antes de eliminar
- Si era el único rack en una entrada de chain, elimina también la entrada
- Si era parte de una chain con más racks, solo elimina ese rack

**Eliminación de Entrada Completa**:
- Botón "Eliminar Entrada Completa" (icono de basura)
- Confirma antes de eliminar
- Elimina la entrada y TODOS sus racks asociados
- Útil para:
  - Eliminar rack individual y su entrada
  - Eliminar chain completa con todos sus racks de una vez

**Confirmaciones**:
- **Rack individual**: "¿Seguro que quieres sacar el rack X de mantenimiento?"
- **Chain completa**: "¿Seguro que quieres sacar toda la chain X de mantenimiento?"

**Efectos de la Eliminación**:
- El rack vuelve a operación normal
- Se evalúa según métricas y umbrales
- Vuelve a contar en indicadores de alertas
- El borde azul y etiqueta "Mantenimiento" desaparecen

#### 4.5 Vista Expandible de Entradas

**Funcionalidad**:
- Cada entrada de mantenimiento puede expandirse/colapsarse
- Botón con icono de chevron (arriba/abajo) para expandir/colapsar
- Al expandir se muestran todos los racks incluidos en la entrada

**Información por Rack**:
- ID del rack
- PDU ID
- Nombre
- País
- Sitio
- Data Center
- Fase
- Chain
- Node
- Número de serie
- Botón para eliminar rack individual

**Estados Visuales**:
- Indicador de cuántos racks contiene cada entrada
- Contador actualizado en tiempo real
- Icono diferente para entradas individuales vs chains

#### 4.6 Persistencia y Sincronización

**Almacenamiento**:
- Los estados se guardan en SQL Server
- Tabla `maintenance_entries` para entradas principales
- Tabla `maintenance_rack_details` para detalles de cada rack
- Relación uno-a-muchos entre entradas y racks

**Sincronización**:
- Actualización automática cada 60 segundos
- Sincronizado entre todos los usuarios conectados
- Los cambios se reflejan inmediatamente en el dashboard principal
- No se requiere recargar la página

**Auditoría**:
- Registro de quién inició cada entrada de mantenimiento
- Timestamp de cuándo se creó
- Razón del mantenimiento
- Historial completo disponible en base de datos

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
- **Amperaje**: Solo evalúa umbrales máximos (sobrecarga), 0A es valor normal sin alerta
- **Voltaje**: Solo evalúa umbrales máximos (sobrevoltaje), 0V es valor normal sin alerta
- **Temperatura y Humedad**: Evalúan tanto umbrales mínimos como máximos

**Clasificación de alertas**:
1. **Crítico**: Métrica fuera de rango crítico (excede máximo para amperaje/voltaje)
2. **Advertencia**: Métrica fuera de rango de advertencia pero dentro de crítico
3. **Normal**: Métrica dentro de todos los rangos o en valores mínimos válidos (0A, 0V)

**Razones de alerta**:
- Se genera descripción detallada de cada alerta
- Incluye: métrica afectada, valor actual, umbral, fase (si aplica)
- Múltiples razones si hay varias métricas en alerta
- **Nota**: 0A y 0V no generan alertas (son condiciones normales de equipos apagados o sin carga)

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
- Polling optimizado (30 segundos para dashboard, 60 segundos para mantenimiento)
- Uploads optimizados con multer para importación masiva
- Timeout de servidor extendido (5 minutos) para operaciones largas

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

### Problemas con Importación Excel

#### Error: "Excel file must contain a sheet named Datos"
**Causa**: La hoja del Excel no se llama exactamente "Datos"

**Solución**:
1. Abre tu archivo Excel
2. Busca las pestañas en la parte inferior (probablemente dice "Hoja1", "Sheet1", etc.)
3. Haz clic derecho en la pestaña y selecciona "Cambiar nombre"
4. Escribe exactamente: `Datos` (con D mayúscula y acento en la 'a')
5. Guarda el archivo y vuelve a intentar

#### Error: "rack_id and dc are required"
**Causa**: Faltan datos obligatorios en el archivo

**Solución**:
1. Verifica que todas las filas tengan valor en las columnas `rack_id` y `dc`
2. No dejes celdas vacías en estas columnas
3. Los valores deben ser texto, no fórmulas

#### Error: "Duplicate rack_id in file"
**Causa**: El mismo rack_id aparece múltiples veces en el archivo

**Solución**:
1. Revisa el archivo Excel y busca rack_ids duplicados
2. Elimina las filas duplicadas
3. Cada rack_id debe aparecer solo una vez

#### Error: "Rack already in maintenance"
**Causa**: El rack ya estaba en mantenimiento antes de la importación

**Solución**:
1. Verifica en la página de mantenimiento si el rack ya está listado
2. Si quieres actualizarlo, primero elimínalo del mantenimiento
3. Luego vuelve a importar

#### Error: "Too many racks"
**Causa**: El archivo contiene más de 1000 racks

**Solución**:
1. Divide el archivo en múltiples archivos más pequeños
2. Cada archivo debe tener máximo 1000 racks
3. Importa los archivos uno por uno

### Problemas con la Plantilla Excel

#### La plantilla no se descarga
**Solución**:
1. Verifica que el archivo `plantilla_mantenimiento.xlsx` exista en la raíz del proyecto
2. Si no existe, créalo manualmente usando el script: `node create-excel-template.cjs`
3. Reinicia el servidor: `pm2 restart energy-monitoring-api`

#### La plantilla está corrupta
**Solución**:
1. Elimina el archivo `plantilla_mantenimiento.xlsx`
2. Ejecuta: `node create-excel-template.cjs`
3. Verifica que se creó correctamente
4. Descarga la nueva plantilla desde la aplicación

### Problemas con Chains

#### No se encuentran racks al poner chain en mantenimiento
**Causa**: La chain está vacía o los racks no tienen nombres válidos

**Solución**:
1. Verifica que existan racks con esa chain en el DC especificado
2. Verifica que los racks tengan un `rackName` válido (no vacío, no "undefined")
3. Usa la importación masiva como alternativa para casos complejos

### Problemas de Base de Datos

#### Error de conexión a SQL Server
**Solución**:
1. Verifica las credenciales en el archivo `.env`
2. Verifica que SQL Server esté corriendo
3. Ejecuta el script de verificación: `verify-sql-server.bat` (Windows)
4. Revisa los logs: `pm2 logs energy-monitoring-api`

#### Tablas de mantenimiento no existen
**Solución**:
1. Ejecuta las migraciones de SQL Server manualmente
2. Verifica que las tablas `maintenance_entries` y `maintenance_rack_details` existan
3. Consulta los archivos de migración en `supabase/migrations/` para la estructura

## Soporte

Para soporte técnico:
- **Logs de aplicación**: `pm2 logs energy-monitoring-api`
- **Health check**: `http://localhost/api/health`
- **Logs de Nginx**: `/var/log/nginx/energy-monitor-*.log`
- **Verificar SQL Server**: `verify-sql-server.bat`
- **Regenerar plantilla**: `node create-excel-template.cjs`

## Casos de Uso Comunes

### Poner un rack individual en mantenimiento
1. Ir al dashboard principal
2. Buscar el rack deseado
3. Hacer clic en el menú de 3 puntos
4. Seleccionar "Enviar a Mantenimiento"
5. Opcionalmente especificar razón

### Poner una chain completa en mantenimiento
1. Ir a "Gestión de Mantenimiento"
2. Usar la interfaz para seleccionar chain y DC
3. Especificar razón y usuario
4. Confirmar la operación
5. Todos los racks de la chain se añaden automáticamente

### Importar 50 racks en mantenimiento desde Excel
1. Ir a "Gestión de Mantenimiento"
2. Hacer clic en "Descargar Plantilla Excel"
3. Abrir la plantilla descargada
4. Rellenar las 50 filas con los datos de los racks (mínimo: rack_id y dc)
5. Verificar que la hoja se llama "Datos"
6. Guardar el archivo
7. Hacer clic en "Importar desde Excel"
8. Seleccionar el archivo rellenado
9. Revisar el resumen de importación
10. Verificar en la lista de mantenimiento que los 50 racks fueron añadidos

### Sacar una chain completa de mantenimiento
1. Ir a "Gestión de Mantenimiento"
2. Buscar la entrada de la chain deseada
3. Hacer clic en "Eliminar Entrada Completa" (icono de basura)
4. Confirmar la operación
5. Todos los racks de la chain vuelven a operación normal

### Exportar todas las alertas activas
1. En el dashboard principal, asegurarse de estar en vista "Alertas"
2. Hacer clic en "Exportar Alertas a Excel"
3. Se descarga automáticamente archivo Excel con todas las alertas
4. El archivo incluye todas las métricas y razones de alerta

---

**Energy Monitoring System** © 2025

Sistema completo de monitoreo de energía para centros de datos con gestión avanzada de mantenimiento, importación masiva, y exportación de datos.
