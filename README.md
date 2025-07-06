# USGS Water Levels Map

A real-time water level monitoring application with interactive chart overlays and comprehensive caching.

## Features

- Interactive map with USGS gauge markers
- Draggable chart overlays with arrows pointing to gauges
- Real-time water level data with flood/record stage reference lines
- Force-directed chart positioning to prevent overlaps
- Global controls for time range (1hr/8hr/24hr/48hr) and chart visibility
- Major waterways overlay toggle
- Hover tooltips on gauge markers
- Redis caching for optimal performance
- Production-ready Docker deployment

## Technology Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **React-Leaflet**: Interactive maps
- **Recharts**: Chart visualization for water level trends
- **Redis**: High-performance caching for API responses
- **Tailwind CSS**: Utility-first CSS framework
- **Docker**: Containerized deployment

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit http://localhost:3000

### Production Deployment

#### Railway.com (Recommended)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Connect your GitHub repository to Railway
2. Add Redis database addon
3. Deploy automatically with zero configuration

See [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md) for detailed instructions.

#### Docker Deployment (Alternative)

##### Prerequisites
- Docker and Docker Compose installed
- Make sure ports 3000, 6379, and 80 are available

##### Deploy with automatic setup
```bash
./deploy.sh
```

##### Manual deployment
```bash
# Build and start all services
docker compose up -d

# Check service status
docker compose ps

# View logs
docker compose logs -f app
```

#### Development with Docker
```bash
# Start development environment
docker compose -f docker-compose.dev.yml up

# Or build and run dev container only
docker build -f Dockerfile.dev -t lakes-rivers-dev .
docker run -p 3000:3000 -v $(pwd):/app lakes-rivers-dev
```

## Architecture

### Services
- **App**: Next.js application (port 3000)
- **Redis**: Cache layer (port 6379)
- **Nginx**: Reverse proxy with rate limiting (port 80)

### APIs Used
- USGS Water Services API - Real-time gauge data
- National Weather Service AHPS - Flood stage data
- Overpass API - Waterway geometry

### Caching Strategy
- Waterway data: 24 hour TTL
- USGS gauge data: 15 minute TTL
- Spatial-aware cache keys for efficient viewport queries

### Installation

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/YOUR_USERNAME/lakes-and-rivers.git
   cd lakes-and-rivers
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Set up Redis (optional but recommended):
   \`\`\`bash
   # Run the setup script for automatic Redis installation
   ./setup-redis.sh
   
   # Or install manually:
   # Ubuntu/Debian: sudo apt-get install redis-server
   # macOS: brew install redis
   # Windows: Use Redis for Windows or Docker
   \`\`\`

4. Configure environment variables:
   \`\`\`bash
   cp .env.example .env.local
   # Edit .env.local with your Redis URL if needed
   \`\`\`

5. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

- **Viewing Sites**: The map automatically loads water monitoring sites within 100 miles of Austin, TX
- **Understanding Colors**:
  - 🔴 Red: High water levels
  - 🟢 Green: Normal water levels  
  - 🟡 Yellow: Low water levels
  - ⚪ Gray: Unknown/No data
- **Interactive Features**:
  - **Hover**: See quick site info on gauge hover
  - **Click**: View detailed information and charts
  - **Charts Toggle**: Enable/disable chart overlays and arrows
  - **Waterways Toggle**: Show/hide major river overlays
  - **Drag Charts**: Move chart overlays around the map
  - **Time Range**: Select 1hr, 8hr, 24hr, or 48hr trend data
- **Map Navigation**: Pan and zoom to explore different areas (new gauges load automatically)
- **Refresh Data**: Use the refresh button to get the latest water level data

## Caching System

The application uses Redis for intelligent caching to improve performance:

- **Waterways Data**: Cached for 24 hours (geographic data changes rarely)
- **USGS Water Data**: Cached for 15 minutes (real-time data updates frequently)
- **Cache Keys**: Based on geographic bounding boxes for efficient spatial caching
- **Graceful Degradation**: Application works without Redis, just with slower API calls

### Cache Management

\`\`\`bash
# Monitor cache activity
redis-cli monitor

# View cached keys
redis-cli keys "*"

# Clear all cache
redis-cli flushall

# Check cache status
redis-cli info memory
\`\`\`

## API Information

This application uses multiple APIs with intelligent caching:

### USGS Water Services API
- **Base URL**: https://waterservices.usgs.gov/nwis/iv/
- **Parameters**: 
  - `00065`: Gage height (feet)
  - `00060`: Streamflow (cubic feet per second)
- **Documentation**: https://waterservices.usgs.gov/rest/
- **Cache Duration**: 15 minutes

### Overpass API (OpenStreetMap)
- **Base URL**: https://overpass-api.de/api/interpreter
- **Purpose**: Major rivers and waterway data
- **Cache Duration**: 24 hours

### NWS Advanced Hydrologic Prediction Service
- **Purpose**: Flood stage and record stage data
- **Format**: XML feeds for river forecasting points

## Project Structure

\`\`\`
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── usgs/         # USGS data with caching
│   │   └── waterways/    # Waterway data with caching
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── WaterMap.tsx       # Main map component
│   ├── MapView.tsx        # Leaflet map view
│   ├── MapChartOverlay.tsx # Draggable chart overlays
│   ├── WaterLevelChart.tsx # Chart visualization
│   └── WaterwayLayer.tsx  # River overlay layer
├── lib/                   # Utility libraries
│   └── redis.ts          # Redis caching utilities
├── services/              # API services
│   ├── usgs.ts           # USGS API service
│   └── waterways.ts      # Waterway API service
└── types/                 # TypeScript types
    └── water.ts          # Water data types
\`\`\`

## Contributing

1. Fork the repository
2. Create a feature branch: \`git checkout -b feature-name\`
3. Make changes and test
4. Commit changes: \`git commit -am 'Add feature'\`
5. Push to branch: \`git push origin feature-name\`
6. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- **USGS**: For providing free access to water monitoring data
- **OpenStreetMap**: For map tiles
- **Leaflet**: For the mapping library
- **Next.js Team**: For the excellent React framework
