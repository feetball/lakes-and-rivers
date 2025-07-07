#!/bin/bash

# Build production data files with compression only
echo "Building production data files..."

# Generate compressed data files only
NODE_ENV=production node scripts/generate-static-data.js

# Show resulting file sizes
echo ""
echo "Production files generated:"
ls -lh data/*.gz 2>/dev/null || echo "No compressed files found"

echo ""
echo "To deploy, only the .gz files are needed."
echo "The uncompressed files are not generated in production mode."
