# Static Data Generation

This directory contains pre-generated static data files for Texas flood monitoring data, which are loaded into Redis at application startup instead of fetching from APIs.

## How it works

1. **Generation**: Run `npm run generate-static-data` to fetch and save all data to static JSON files
2. **Deployment**: The static files are included in the Docker image 
3. **Startup**: The app loads these files into Redis at startup (much faster than API calls)

## Files generated

- `texas-usgs-stations.json` - All USGS monitoring stations in Texas
- `texas-waterways.json` - All waterway/river data from OpenStreetMap  
- `texas-flood-stages.json` - Flood stage data (currently empty, can be enhanced)
- `generation-summary.json` - Summary of what was generated and when

## Usage

### Generate static data (run this periodically to update data)
```bash
npm run generate-static-data
```

### Check what data exists
```bash
ls -la data/static/
cat data/static/generation-summary.json
```

## Benefits of this approach

- **Fast startup**: No waiting for API calls during container startup
- **Reliable**: No dependency on external API availability during startup  
- **Efficient**: APIs are only called once during generation, not every deploy
- **Cacheable**: Static files can be cached in CI/CD and reused across deploys

## When to regenerate

- Weekly or monthly to get new stations/waterways
- When USGS adds new monitoring stations
- When waterway data needs updating
- Before major deployments

## Docker integration

The static data files are automatically included in the Docker image and loaded into Redis at startup via the `startup.js` script.
