# Flood Stage Management System

This system ensures accurate and up-to-date flood stage data for all USGS gauge sites in the Texas water monitoring application.

## Overview

Flood stages are critical thresholds that determine when rivers and creeks pose flooding risks. Accurate flood stage data comes from the National Weather Service (NWS) Advanced Hydrologic Prediction Service (AHPS) and must be regularly verified and updated.

## Data Sources

### Primary Sources (High Confidence)
- **NWS AHPS**: Official flood forecasting points with verified thresholds
- **USGS Historical**: Long-term historical data analysis
- **Local Emergency Management**: Municipal and county verified data

### Verification Status
- **High Confidence**: Verified with NWS AHPS within last 6 months
- **Medium Confidence**: Based on historical data or downstream/upstream gauges
- **Low Confidence**: Conservative defaults requiring verification

## Current Status

### Verified Sites (High Confidence)
- `08167000` - Guadalupe River at Comfort (NWS AHPS)
- `08168500` - Guadalupe River at Spring Branch (NWS AHPS)
- `08169000` - Guadalupe River at Canyon Lake (NWS AHPS)
- `08171000` - Blanco River at Wimberley (NWS AHPS)
- `08104900` - South Fork San Gabriel River at Georgetown (NWS AHPS)
- `08158000` - Colorado River at Austin (NWS AHPS)
- `08158922` - Shoal Creek at Austin (NWS AHPS)
- `08158840` - Walnut Creek at Austin (NWS AHPS)
- `08153500` - Pedernales River near Johnson City (NWS AHPS)

### Needs Verification (Medium/Low Confidence)
- `08105300` - San Gabriel River near Weir, TX ⚠️ **Priority**
- All other sites use conservative defaults

## Management Commands

### Daily Operations
```bash
# Quick audit of all sites
npm run flood-audit

# Detailed audit with full output
npm run flood-audit-verbose

# Update verified data
npm run flood-update
```

### Site-Specific Operations
```bash
# Audit specific site
npm run flood-site 08105300

# Manual verification workflow
node scripts/validate-flood-stages.js --site=08105300 --verbose
```

### Automated Monitoring
```bash
# Set up periodic validation
npm run setup-flood-cron

# Manual cron installation
crontab scripts/flood-stage-cron.txt
```

## Verification Workflow

### 1. Identify Unverified Sites
```bash
npm run flood-audit
```
This produces an audit report showing:
- Total sites vs verified sites
- High-priority sites needing verification
- Sites using default conservative values

### 2. Verify with NWS AHPS
For each unverified site:
1. Visit [NWS AHPS](https://water.weather.gov/ahps/)
2. Search for the USGS site or nearby NWS gauge
3. Record official flood stage values
4. Update the verified flood stages in `/src/app/api/flood-stages/route.ts`

### 3. Update Site Data
```javascript
// Add to VERIFIED_FLOOD_STAGES in flood-stages/route.ts
'08105300': { 
  floodStage: 25.0,          // From NWS AHPS
  moderateFloodStage: 28.0,  // From NWS AHPS  
  majorFloodStage: 32.0,     // From NWS AHPS
  actionStage: 22.0,         // From NWS AHPS
  source: 'NWS AHPS',
  verified: '2025-07-06',
  confidence: 'high'
},
```

### 4. Validate Changes
```bash
npm run flood-update-verbose
```

## API Endpoints

### Admin Flood Stage Management
```bash
# Audit all sites (requires authentication)
curl -u "username:password" "http://localhost:3001/api/admin/flood-stages?action=audit"

# Update specific site
curl -u "username:password" -X POST "http://localhost:3001/api/admin/flood-stages" \
  -H "Content-Type: application/json" \
  -d '{"action":"update","siteId":"08105300","floodStages":{...}}'
```

### Public Flood Stage Data
```bash
# Get flood stages for specific site
curl "http://localhost:3001/api/flood-stages?siteId=08105300"
```

## Monitoring and Alerts

### Log Files
- `logs/flood-stage-validation.log` - Validation script output
- `logs/flood-stage-audit.json` - Latest audit results
- `logs/cron-flood-*.log` - Automated validation logs

### Critical Alerts
Monitor for:
- Sites using default conservative values in production
- Sites with "medium" or "low" confidence ratings
- Failed verification attempts
- Outdated verification dates (>6 months)

## Emergency Procedures

### After Major Flood Events
1. Run immediate audit: `npm run flood-audit-verbose`
2. Check high-priority sites first
3. Verify any sites that experienced flooding
4. Update flood stages if NWS revises official values
5. Clear cache to force data refresh

### Production Deployment
1. Always run audit before deployment
2. Ensure no "low confidence" sites in high-risk areas
3. Verify all Austin-area sites are "high confidence"
4. Check flood stage API is responding correctly

## NWS AHPS Reference

### Key NWS Gauge IDs for Texas
- `CMFT2` - Guadalupe River at Comfort
- `SPBT2` - Guadalupe River at Spring Branch  
- `CNYT2` - Canyon Lake
- `WMBT2` - Blanco River at Wimberley
- `GTWT2` - South Fork San Gabriel at Georgetown
- `AUAT2` - Colorado River at Austin
- `SCAT2` - Shoal Creek at Austin
- `WCAT2` - Walnut Creek at Austin
- `JNCT2` - Pedernales River near Johnson City

### Verification URLs
- Main AHPS: https://water.weather.gov/ahps/
- Texas Rivers: https://water.weather.gov/ahps2/index.php?wfo=ewx
- Austin Area: https://water.weather.gov/ahps2/index.php?wfo=ewx&state=tx

## Maintenance Schedule

### Daily (Automated)
- Audit verification status
- Log any new unverified sites
- Check for API failures

### Weekly (Automated)  
- Update verified flood stage data
- Generate verification report
- Alert on high-priority unverified sites

### Monthly (Manual)
- Review all "medium confidence" sites
- Verify with NWS AHPS for updates
- Update any revised official flood stages
- Review and update documentation

### After Flood Events (Manual)
- Immediate audit of affected sites
- Verify flood stages with NWS post-event analysis
- Update any revised thresholds
- Document lessons learned

## Troubleshooting

### Common Issues
1. **Site showing red but river stays blue**
   - Check flood stage verification status
   - Verify site has accurate flood stage data
   - Ensure FloodAwareWaterwayLayer is using updated data

2. **Conservative defaults being used**
   - Run flood audit to identify unverified sites
   - Verify with NWS AHPS
   - Update verified flood stages

3. **Cron jobs not running**
   - Check crontab installation: `crontab -l`
   - Verify log files are being created
   - Check script permissions and paths

### Support Contacts
- NWS Austin: https://www.weather.gov/ewx/
- USGS Texas: https://www.usgs.gov/centers/oklahoma-texas-water-science-center
- Travis County Emergency: https://www.traviscountytx.gov/emergency-services
