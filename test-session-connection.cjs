// Script de verificación de conexión a Supabase para sesiones
require('dotenv').config();
const { Pool } = require('pg');

console.log('\n==============================================');
console.log('VERIFICACIÓN DE CONEXIÓN A SUPABASE');
console.log('==============================================\n');

// Verificar variables de entorno
console.log('1. Verificando variables de entorno...');
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sessionSecret = process.env.SESSION_SECRET;

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL no está configurado en .env');
  process.exit(1);
}
console.log(`✅ SUPABASE_URL: ${supabaseUrl}`);

if (!serviceRoleKey || serviceRoleKey === 'your_service_role_key_here') {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurado correctamente en .env');
  console.error('   Debes obtener tu Service Role Key de Supabase y configurarla en .env');
  console.error('   Ver archivo: get-supabase-key.md');
  process.exit(1);
}
console.log(`✅ SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKey.substring(0, 20)}...`);

if (!sessionSecret) {
  console.error('❌ SESSION_SECRET no está configurado en .env');
  process.exit(1);
}
console.log(`✅ SESSION_SECRET: ${sessionSecret.substring(0, 20)}...`);

// Extraer project ref
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ No se pudo extraer el project ref de SUPABASE_URL');
  process.exit(1);
}
console.log(`✅ Project Ref: ${projectRef}\n`);

// Crear pool de conexión
console.log('2. Probando conexión a PostgreSQL...');
const connectionString = `postgresql://postgres.${projectRef}:${serviceRoleKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Probar conexión
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Error conectando a Supabase:');
    console.error(err.message);
    console.error('\nPosibles causas:');
    console.error('- Service Role Key incorrecto');
    console.error('- Problemas de red/firewall');
    console.error('- URL de Supabase incorrecta');
    pool.end();
    process.exit(1);
  }

  console.log(`✅ Conexión exitosa! Hora del servidor: ${result.rows[0].now}\n`);

  // Verificar tabla sessions
  console.log('3. Verificando tabla sessions...');
  pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name = 'sessions'
  `, (err, result) => {
    if (err) {
      console.error('❌ Error verificando tabla sessions:');
      console.error(err.message);
      pool.end();
      process.exit(1);
    }

    if (result.rows.length === 0) {
      console.error('❌ La tabla "sessions" no existe');
      console.error('   Ejecuta la migración: supabase/migrations/20251022120000_create_sessions_table.sql');
      pool.end();
      process.exit(1);
    }

    console.log('✅ Tabla sessions existe\n');

    // Contar sesiones
    pool.query('SELECT COUNT(*) FROM sessions', (err, result) => {
      if (err) {
        console.error('❌ Error contando sesiones:');
        console.error(err.message);
        pool.end();
        process.exit(1);
      }

      console.log(`✅ Sesiones activas: ${result.rows[0].count}\n`);
      console.log('==============================================');
      console.log('✅ TODO CONFIGURADO CORRECTAMENTE');
      console.log('==============================================\n');
      console.log('Próximos pasos:');
      console.log('1. Reinicia el servidor: pm2 restart energy-monitoring-api');
      console.log('2. Intenta iniciar sesión con:');
      console.log('   Usuario: admin');
      console.log('   Contraseña: Admin123!');
      console.log('3. Verifica que no haya errores 401\n');

      pool.end();
      process.exit(0);
    });
  });
});
