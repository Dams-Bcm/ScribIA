-- ============================================================================
--  ScribIA v2 — Initialisation MSSQL
--  Exécuter ce script sur le serveur MSSQL avant le premier lancement
--  Compatible SQL Server 2019+ / Azure SQL
-- ============================================================================

-- 1. Créer la base de données
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'scribia')
BEGIN
    CREATE DATABASE scribia;
END
GO

-- 2. Créer le login (authentification SQL Server)
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'scribia_app')
BEGIN
    CREATE LOGIN scribia_app WITH PASSWORD = 'REMPLACEZ_PAR_MOT_DE_PASSE_SECURISE';
END
GO

-- 3. Créer l'utilisateur dans la base et lui donner les droits
USE scribia;
GO

IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'scribia_app')
BEGIN
    CREATE USER scribia_app FOR LOGIN scribia_app;
    ALTER ROLE db_owner ADD MEMBER scribia_app;
END
GO

PRINT 'Base de données ScribIA initialisée avec succès.';
GO
