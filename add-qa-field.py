#!/usr/bin/env python3
import psycopg2
import sys

try:
    conn = psycopg2.connect(
        host="localhost",
        database="smtverify",
        user="smtverify",
        password="smtverify"
    )
    cur = conn.cursor()
    
    # Add qa_name column if it doesn't exist
    cur.execute("""
        ALTER TABLE sessions 
        ADD COLUMN IF NOT EXISTS qa_name TEXT;
    """)
    
    conn.commit()
    print("✓ QA field added to database")
    
    # Verify the column exists
    cur.execute("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='sessions' AND column_name='qa_name';
    """)
    
    if cur.fetchone():
        print("✓ qa_name column verified in sessions table")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"✗ Error: {e}")
    sys.exit(1)
