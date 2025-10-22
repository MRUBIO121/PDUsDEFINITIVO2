/*
  # Create usersAlertado table

  1. New Tables
    - `usersAlertado`
      - `id` (uuid, primary key) - Unique identifier for each user
      - `usuario` (text, unique) - Username for login
      - `password_hash` (text) - Bcrypt hashed password
      - `rol` (text) - User role (Administrador, Operador, Tecnico, Observador)
      - `activo` (boolean) - Whether the user is active or not
      - `fecha_creacion` (timestamptz) - Creation timestamp
      - `fecha_modificacion` (timestamptz) - Last modification timestamp

  2. Security
    - Enable RLS on `usersAlertado` table
    - Add policies for authenticated users to manage users based on their role
    - Only Administrador role can perform CRUD operations on users

  3. Constraints
    - Check constraint on `rol` to allow only valid roles
    - Unique constraint on `usuario` to prevent duplicate usernames

  4. Default Data
    - Insert default admin user with credentials: admin / Admin123!
*/

-- Create the usersAlertado table
CREATE TABLE IF NOT EXISTS usersAlertado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('Administrador', 'Operador', 'Tecnico', 'Observador')),
  activo boolean NOT NULL DEFAULT true,
  fecha_creacion timestamptz DEFAULT now(),
  fecha_modificacion timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usersAlertado_usuario ON usersAlertado(usuario);
CREATE INDEX IF NOT EXISTS idx_usersAlertado_rol ON usersAlertado(rol);
CREATE INDEX IF NOT EXISTS idx_usersAlertado_activo ON usersAlertado(activo);

-- Enable Row Level Security
ALTER TABLE usersAlertado ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can view users
CREATE POLICY "Authenticated users can view usersAlertado"
  ON usersAlertado
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only Administrador role can insert users
CREATE POLICY "Only Administrador can insert users"
  ON usersAlertado
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usersAlertado
      WHERE id = auth.uid()
      AND rol = 'Administrador'
      AND activo = true
    )
  );

-- Policy: Only Administrador role can update users
CREATE POLICY "Only Administrador can update users"
  ON usersAlertado
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usersAlertado
      WHERE id = auth.uid()
      AND rol = 'Administrador'
      AND activo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usersAlertado
      WHERE id = auth.uid()
      AND rol = 'Administrador'
      AND activo = true
    )
  );

-- Policy: Only Administrador role can delete users
CREATE POLICY "Only Administrador can delete users"
  ON usersAlertado
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usersAlertado
      WHERE id = auth.uid()
      AND rol = 'Administrador'
      AND activo = true
    )
  );

-- Insert default admin user
-- Password hash for "Admin123!" using bcrypt with 10 salt rounds
-- This is a placeholder hash and should be updated with a real bcrypt hash
INSERT INTO usersAlertado (usuario, password_hash, rol, activo, fecha_creacion, fecha_modificacion)
VALUES (
  'admin',
  '$2a$10$xyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr',
  'Administrador',
  true,
  now(),
  now()
)
ON CONFLICT (usuario) DO NOTHING;