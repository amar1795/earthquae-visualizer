# 🌍 Earthquake Visualizer

An interactive web app that visualizes recent earthquake activity worldwide using real-time data from the USGS Earthquake API. Built with React, Tailwind CSS, and React-Leaflet.

## Features
- Interactive world map with earthquake markers
- Marker size & color based on magnitude
- Click markers to view details (location, time, depth, magnitude)
- Filter earthquakes by time range (24h / 7d / 30d)
- Magnitude threshold filter (e.g., 4.0+)
- Responsive design (desktop & mobile)
- Error handling for API/network issues

### Optional Features
- Heatmap view of earthquake intensity
- Charts (timeline of quakes, magnitude distribution)
- Dark/Light mode toggle

## Tech Stack
- React – frontend framework
- Tailwind CSS – styling
- React-Leaflet – map visualization
- Recharts or Chart.js – data visualization
- USGS Earthquake GeoJSON API – real-time data

## Project Structure
```
public/
src/
  api/
  components/
  pages/
  styles/
  utils/
README.md
Take-Home Challenge for UI.pdf
.gitignore
```

## Getting Started
1. Clone the repo
2. Install dependencies
3. Start the dev server

## License
MIT
