import L from 'leaflet';
import * as tileStore from './tileStore';

// Extend Leaflet's TileLayer to handle offline caching and CABA boundary checks
const OfflineTileLayer = (L.TileLayer as any).extend({
  createTile: function (coords: { x: number; y: number; z: number }, done: (error: any, tile: HTMLImageElement) => void) {
    const tile = document.createElement('img');
    const key = `${coords.z}/${coords.x}/${coords.y}`;

    // Check if tile is inside CABA bounds
    if (!tileStore.isTileInCABA(coords.z, coords.x, coords.y)) {
      // Render beautiful transparent/slate border tile for areas outside CABA
      tile.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'>
        <rect width='256' height='256' fill='%23f8fafc'/>
        <line x1='0' y1='0' x2='256' y2='256' stroke='%23f1f5f9' stroke-width='2'/>
        <line x1='256' y1='0' x2='0' y2='256' stroke='%23f1f5f9' stroke-width='2'/>
        <rect x='10' y='10' width='236' height='236' rx='4' fill='none' stroke='%23e2e8f0' stroke-width='1' stroke-dasharray='4'/>
        <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='11' font-weight='600' fill='%2394a3b8'>Límite de CABA</text>
        <text x='50%' y='58%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='9' fill='%23cbd5e1'>Área No Habilitada / Provincia</text>
      </svg>`;
      
      // Leaflet requires callback to be asynchronous
      setTimeout(() => done(null, tile), 0);
      return tile;
    }

    // Attempt to pull tile from local IndexedDB cache
    tileStore.getTile(key).then((dataUrl) => {
      if (dataUrl) {
        tile.src = dataUrl;
        // Notify leaflet we're done
        setTimeout(() => done(null, tile), 0);
      } else {
        // If the tile is not in cache and "offlineOnly" mode is active
        if (this.options.offlineOnly) {
          tile.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'>
            <rect width='256' height='256' fill='%23f1f5f9'/>
            <circle cx='128' cy='110' r='20' fill='none' stroke='%2394a3b8' stroke-width='2'/>
            <path d='M128 135 v15' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'/>
            <circle cx='128' cy='160' r='2' fill='%2394a3b8'/>
            <text x='50%' y='80%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' font-weight='500' fill='%2364748b'>Falta en caché offline</text>
            <text x='50%' y='185%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%2394a3b8'>Zoom ${coords.z} | ${coords.x}, ${coords.y}</text>
          </svg>`;
          setTimeout(() => done(null, tile), 0);
        } else {
          // fetch from remote server
          const url = this.getTileUrl(coords);
          
          fetch(url)
            .then((res) => {
              if (!res.ok) throw new Error('Network response failure');
              return res.blob();
            })
            .then((blob) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = reader.result as string;
                // Save to local cache in the background
                tileStore.setTile(key, base64).catch((e) => console.error('Cache set error', e));
                
                // Show in leaflet map
                tile.src = base64;
                done(null, tile);
              };
              reader.readAsDataURL(blob);
            })
            .catch((err) => {
              console.warn('Network error loading tile', key, err);
              // Render error placeholder tile
              tile.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'>
                <rect width='256' height='256' fill='%23fff5f5'/>
                <path d='M100 128 L156 128' stroke='%23f87171' stroke-width='3' stroke-linecap='round'/>
                <text x='50%' y='40%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' font-weight='bold' fill='%23ef4444'>Error de Red</text>
                <text x='50%' y='65%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%23f87171'>Requiere Conexión</text>
                <text x='50%' y='83%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%2394a3b8'>${key}</text>
              </svg>`;
              done(null, tile);
            });
        }
      }
    }).catch((e) => {
      console.error('IndexedDB fetch error', e);
      // Fallback
      tile.src = this.getTileUrl(coords);
      done(null, tile);
    });

    return tile;
  }
});

export function createOfflineTileLayer(urlTemplate: string, options: any) {
  return new (OfflineTileLayer as any)(urlTemplate, options);
}
