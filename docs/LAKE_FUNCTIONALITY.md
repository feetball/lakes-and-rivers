# Lake and Reservoir Functionality

## Overview

The lakes-and-rivers application now supports both river gauges and lake level gauges from USGS, with enhanced visualization for lakes and reservoirs.

## Features Added

### 1. Lake Level Gauge Support

- **Parameter Codes Added**: 
  - `00062` - Lake elevation, above NGVD 1929
  - `00054` - Reservoir storage, total
  - `62614` - Lake elevation above NAVD 1988

- **Site Type Detection**: Sites are automatically classified as `river`, `lake`, `reservoir`, or `stream` based on:
  - Site name keywords (lake, reservoir)
  - Variable name content (elevation, storage)
  - Parameter codes being measured

### 2. Enhanced Visual Representation

#### Lake/Reservoir Rendering
- **Lakes**: Rendered as blue polygons with transparency
- **Reservoirs**: Rendered as darker blue polygons with higher opacity
- **Rivers/Streams**: Continue to use polylines as before

#### Site Markers
- **Rivers/Streams**: Circular markers
- **Lakes/Reservoirs**: Square/rectangular markers for easy identification

### 3. Data Display

#### New Data Fields
- `lakeElevation` - Lake/reservoir elevation in feet
- `reservoirStorage` - Reservoir storage in acre-feet
- `siteType` - Classification of the monitoring site

#### Enhanced Tooltips and Popups
- Display appropriate metrics based on site type:
  - Rivers: Gage height, streamflow, flood stage
  - Lakes: Lake elevation
  - Reservoirs: Lake elevation, storage capacity

### 4. Flood Awareness for Water Bodies

- Lakes and reservoirs are included in flood awareness mode
- Risk assessment considers:
  - Lake elevation trends
  - Storage capacity levels
  - Proximity to other flood-risk gauges

## Usage

### Controls
- "Show Rivers & Lakes" checkbox controls visibility of all waterway types
- Flood awareness mode applies color coding to all water bodies based on gauge data
- Site type is displayed in tooltips and popups

### Visual Indicators
- **Flood Risk Colors**:
  - Red: Extreme risk/high levels
  - Orange: High risk/elevated levels  
  - Yellow: Moderate risk/approaching limits
  - Green: Normal levels
  - Blue: Low levels
  - Gray: Unknown/no data

### Map Features
- Zoom in to see individual lake/reservoir shapes
- Click markers for detailed information
- Hover over water bodies for quick status information

## Technical Implementation

### API Enhancements
- USGS API calls now include lake-specific parameter codes
- Enhanced site classification logic
- Improved data parsing for different measurement types

### Component Updates
- `WaterwayLayer`: Now renders both polylines (rivers) and polygons (lakes)
- `FloodAwareWaterwayLayer`: Enhanced styling for different water body types
- `MapView`: Updated tooltips and markers for lake-specific data

### Data Structure
- Extended `WaterSite` interface with lake-specific fields
- Enhanced `Waterway` interface to include lake and reservoir types
- Improved type safety throughout the application

## Future Enhancements

- Integration with reservoir capacity data
- Historical lake level analysis
- Drought condition monitoring
- Recreational lake status indicators
- Water quality measurements integration
