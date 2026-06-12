const DB_NAME = 'CabaMapOfflineDB';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Get tile data from DB
export async function getTile(key: string): Promise<string | null> {
  const db = await initDB();
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.dataUrl);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch (e) {
      resolve(null);
    }
  });
}

// Set tile data in DB
export async function setTile(key: string, dataUrl: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ key, dataUrl });

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (e) {
      reject(e);
    }
  });
}

// Clear all tiles in DB
export async function clearTiles(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (e) {
      reject(e);
    }
  });
}

// Get all stored tiles in a dictionary
export async function getAllTiles(): Promise<{ [key: string]: string }> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result: { [key: string]: string } = {};
        if (request.result) {
          request.result.forEach((item: { key: string; dataUrl: string }) => {
            result[item.key] = item.dataUrl;
          });
        }
        resolve(result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (e) {
      reject(e);
    }
  });
}

// Bulk save tiles (for importing from file)
export async function saveAllTiles(tiles: { [key: string]: string }): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      // Handle empty object
      const keys = Object.keys(tiles);
      if (keys.length === 0) {
        resolve();
        return;
      }

      let count = 0;
      let failed = false;

      keys.forEach((key) => {
        const dataUrl = tiles[key];
        const request = store.put({ key, dataUrl });

        request.onsuccess = () => {
          count++;
          if (count === keys.length && !failed) {
            resolve();
          }
        };

        request.onerror = () => {
          if (!failed) {
            failed = true;
            reject(request.error);
          }
        };
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Get total count of stored tiles
export async function getTilesCount(): Promise<number> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result || 0);
      };

      request.onerror = () => {
        resolve(0);
      };
    });
  } catch (e) {
    return 0;
  }
}

// Helper to check if a tile coordinates overlap CABA
export function isTileInCABA(z: number, x: number, y: number): boolean {
  if (z < 10) return true; // Keep coarse zooms visible to let the user center properly

  const n = Math.pow(2, z);
  const lonLeft = (x / n) * 360 - 180;
  const lonRight = ((x + 1) / n) * 360 - 180;

  const latRadTop = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const latTop = (latRadTop * 180) / Math.PI;

  const latRadBottom = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  const latBottom = (latRadBottom * 180) / Math.PI;

  // Tile Lat/Lng limits
  const tileMinLat = Math.min(latTop, latBottom);
  const tileMaxLat = Math.max(latTop, latBottom);
  const tileMinLng = Math.min(lonLeft, lonRight);
  const tileMaxLng = Math.max(lonLeft, lonRight);

  // Approximate Buenos Aires Capital Federal (CABA) coordinates bounding box
  // CABA is roughly: lat -34.706 to -34.526, lng -58.531 to -58.335
  const cabaMinLat = -34.706;
  const cabaMaxLat = -34.526;
  const cabaMinLng = -58.531;
  const cabaMaxLng = -58.335;

  return !(
    tileMaxLat < cabaMinLat ||
    tileMinLat > cabaMaxLat ||
    tileMaxLng < cabaMinLng ||
    tileMinLng > cabaMaxLng
  );
}

// Calculate the tile projection bounds for CABA at a given zoom level
export function getCABATileBounds(z: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const n = Math.pow(2, z);

  // CABA boundary points
  const minLat = -34.706;
  const maxLat = -34.526;
  const minLng = -58.531;
  const maxLng = -58.335;

  // Convert lat/lng to tile coordinates
  const lngToX = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const latToY = (lat: number) => {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  };

  const x1 = lngToX(minLng);
  const x2 = lngToX(maxLng);
  // Lat values: minLat is southern (bottom), so will have HIGHER Y value; maxLat is northern (top), so will have LOWER Y value
  const y1 = latToY(maxLat);
  const y2 = latToY(minLat);

  return {
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
  };
}

// Download list of tiles inside CABA for a zoom range
export async function downloadCABATiles(
  zoomMin: number,
  zoomMax: number,
  onProgress: (current: number, total: number, message: string) => void,
  onCancelSignal?: { aborte: boolean }
): Promise<number> {
  const allTileKeys: { z: number; x: number; y: number; key: string }[] = [];

  for (let z = zoomMin; z <= zoomMax; z++) {
    const bounds = getCABATileBounds(z);
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        if (isTileInCABA(z, x, y)) {
          allTileKeys.push({ z, x, y, key: `${z}/${x}/${y}` });
        }
      }
    }
  }

  const total = allTileKeys.length;
  let downloadedCount = 0;

  onProgress(0, total, 'Iniciando descarga de teselas...');

  // Use a concurrency control or download sequentially. Sequential is safest and cleanest
  for (let i = 0; i < total; i++) {
    if (onCancelSignal?.aborte) {
      onProgress(downloadedCount, total, 'Descarga cancelada por el usuario.');
      return downloadedCount;
    }

    const tile = allTileKeys[i];
    
    // Check if we already have it in IndexedDB
    const existing = await getTile(tile.key);
    if (existing) {
      downloadedCount++;
      onProgress(downloadedCount, total, `Tesela ${tile.key} ya existe en caché.`);
      continue;
    }

    const url = `https://a.tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP status ${response.status}`);
      const blob = await response.blob();

      // Convert Blob to Base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const dataUrl = await base64Promise;

      await setTile(tile.key, dataUrl);
      downloadedCount++;
      onProgress(downloadedCount, total, `Descargada tesela: ${tile.key}`);
    } catch (err) {
      console.error(`Error downloading tile ${tile.key}:`, err);
      // We can retry or just continue to avoid blocking the whole process
      onProgress(downloadedCount, total, `Omitida tesela por error de red: ${tile.key}`);
    }

    // Small delay to be polite to OpenStreetMap tile servers
    await new Promise((r) => setTimeout(r, 60));
  }

  onProgress(total, total, 'Descarga completada con éxito.');
  return downloadedCount;
}
