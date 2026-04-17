-- Add verification fields to scan_records table for manual/auto mode support
ALTER TABLE scan_records ADD COLUMN IF NOT EXISTS internal_id_scanned text;
ALTER TABLE scan_records ADD COLUMN IF NOT EXISTS verification_mode text DEFAULT 'manual';

-- Create index on verification_mode for filtering by mode
CREATE INDEX IF NOT EXISTS scan_records_verification_mode_idx ON scan_records(verification_mode);
