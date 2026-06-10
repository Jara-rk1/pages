#!/bin/bash
# Azure App Service startup script
# Initialises the database if missing, then starts gunicorn

cd /home/site/wwwroot

# Create database if it doesn't exist
if [ ! -f games.db ]; then
    python init_db.py
fi

# Start gunicorn (Azure's default WSGI server)
gunicorn --bind=0.0.0.0:8000 --timeout 120 --workers 2 wsgi:app
