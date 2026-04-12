#!/bin/bash

# Simple SQL migration script
export PGPASSWORD="smtverify"

psql -h localhost -U smtverify -d smtverify <<EOF
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qa_name text;
SELECT 'QA field added successfully' as status;
EOF
