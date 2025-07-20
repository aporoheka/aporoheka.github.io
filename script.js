// Inicializar el mapa
const map = L.map('map').setView([-34.62, -58.39], 13);
let layerVisible = false;
let savedMarkers = JSON.parse(localStorage.getItem('markers') || '[]');
const boundsCABA = L.latLngBounds(
  L.latLng(-34.705, -58.531),
  L.latLng(-34.526, -58.335)
);

// Capa base
const mainLayer = L.tileLayer('', {
  maxBounds: boundsCABA,
  maxBoundsViscosity: 1.0,  
  minZoom: 12,
  maxZoom: 19,
  attribution: 'by Ez'
});
function cargarCABA() {
  mainLayer.setUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  mainLayer.addTo(map);
  layerVisible = false;
}
function cargarTodo() {
  if (!layerVisible) {
    mainLayer.setUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    layerVisible = true;
  }
}
cargarCABA();

// Marcadores guardados
const markersLayer = L.layerGroup().addTo(map);
function renderMarkers() {
  markersLayer.clearLayers();
  savedMarkers.forEach(data => {
    const marker = L.marker([data.lat, data.lng]).addTo(markersLayer);
    marker.bindPopup(`<b>${data.text}</b><br>${data.comment || ''}`);
  });
}
renderMarkers();

// Agregar marcador manual
map.on('click', function(e) {
  if (!boundsCABA.contains(e.latlng)) return;
  const text = prompt('Título del punto:');
  if (!text) return;
  const comment = prompt('Comentario (opcional):');
  const data = { lat: e.latlng.lat, lng: e.latlng.lng, text, comment };
  savedMarkers.push(data);
  localStorage.setItem('markers', JSON.stringify(savedMarkers));
  renderMarkers();
});

// Exportar / importar
document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(savedMarkers, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'marcadores.json';
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        savedMarkers = imported;
        localStorage.setItem('markers', JSON.stringify(savedMarkers));
        renderMarkers();
      } else {
        alert('Archivo inválido.');
      }
    } catch (err) {
      alert('Error leyendo el archivo.');
    }
  };
  reader.readAsText(file);
});

// Centrado en barrios
document.getElementById('center-mugica').addEventListener('click', () => {
  map.setView([-34.5915, -58.3705], 17);
});
document.getElementById('center-zavaleta').addEventListener('click', () => {
  map.setView([-34.6442, -58.3885], 17);
});
document.getElementById('cargar-resto').addEventListener('click', () => {
  if (!layerVisible) cargarTodo();
});

// Búsqueda de calles
const searchBox = document.getElementById('search-box');
const suggestionsBox = document.getElementById('suggestions');
let timeout = null;

searchBox.addEventListener('input', function () {
  clearTimeout(timeout);
  const query = this.value.trim();
  suggestionsBox.innerHTML = '';

  if (query.length < 3) {
    suggestionsBox.innerHTML = '<div>Completar nombre</div>';
    return;
  }

  timeout = setTimeout(() => {
    const bounds = {
      minLat: -34.66,
      minLon: -58.42,
      maxLat: -34.57,
      maxLon: -58.36
    };

    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5` +
                `&bounded=1&viewbox=${bounds.minLon},${bounds.maxLat},${bounds.maxLon},${bounds.minLat}` +
                `&q=${encodeURIComponent(query)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        suggestionsBox.innerHTML = '';
        if (!data.length) {
          suggestionsBox.innerHTML = '<div>Verificar escritura</div>';
          return;
        }
        data.forEach(result => {
          const div = document.createElement('div');
          div.textContent = result.display_name;
          div.addEventListener('click', () => {
            map.setView([result.lat, result.lon], 17);
            searchBox.value = result.display_name;
            suggestionsBox.innerHTML = '';
          });
          suggestionsBox.appendChild(div);
        });
      })
      .catch(() => {
        suggestionsBox.innerHTML = '<div>Error al buscar. Verificá conexión.</div>';
      });
  }, 400);
});

// Botón limpiar búsqueda
const clearBtn = document.getElementById('clear-search');
function toggleClearButton() {
  clearBtn.style.display = searchBox.value.trim() ? 'inline-block' : 'none';
}
searchBox.addEventListener('input', toggleClearButton);
clearBtn.addEventListener('click', () => {
  searchBox.value = '';
  suggestionsBox.innerHTML = '';
  toggleClearButton();
  searchBox.focus();
});
toggleClearButton();

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => {
    console.log('Service Worker registrado');
  });
}

// Seguimiento + Flecha + Rastro
let userLocationMarker = null;
let locationTrail = [];
let trailLayer = L.layerGroup().addTo(map);

const locateButton = document.createElement('button');
locateButton.id = 'locate-btn';
locateButton.innerText = '📍';
Object.assign(locateButton.style, {
  position: 'absolute',
  bottom: '20px',
  right: '20px',
  zIndex: '1001',
  background: 'white',
  border: '1px solid #ccc',
  padding: '10px',
  borderRadius: '50%',
  boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
  cursor: 'pointer'
});
document.body.appendChild(locateButton);

locateButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocalización no soportada');
    return;
  }

  locateButton.disabled = true;

  navigator.geolocation.getCurrentPosition(initialPosition => {
    const lat1 = initialPosition.coords.latitude;
    const lon1 = initialPosition.coords.longitude;

    if (userLocationMarker) map.removeLayer(userLocationMarker);

    userLocationMarker = L.circleMarker([lat1, lon1], {
      radius: 8,
      color: '#007bff',
      fillColor: '#007bff',
      fillOpacity: 0.8
    }).addTo(map);

    map.setView([lat1, lon1], 17);

    setTimeout(() => {
      navigator.geolocation.getCurrentPosition(newPosition => {
        const lat2 = newPosition.coords.latitude;
        const lon2 = newPosition.coords.longitude;
        const distance = getDistance(lat1, lon1, lat2, lon2);

        locationTrail.push([lat2, lon2]);
        if (locationTrail.length > 20) locationTrail.shift();

        trailLayer.clearLayers();
        for (let i = 1; i < locationTrail.length; i++) {
          const p1 = locationTrail[i - 1];
          const p2 = locationTrail[i];
          const ratio = i / locationTrail.length;
          const color = `hsl(${(1 - ratio) * 30}, 100%, ${80 - ratio * 40}%)`;
          L.polyline([p1, p2], {
            color,
            weight: 4,
            opacity: 0.8,
            dashArray: '5, 8',
            lineCap: 'round'
          }).addTo(trailLayer);
        }

        if (userLocationMarker) map.removeLayer(userLocationMarker);
        if (distance > 5) {
          const angle = getBearing(lat1, lon1, lat2, lon2);
          const arrowIcon = L.divIcon({
            className: '',
            html: `<div style="transform: rotate(${angle}deg); width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 20px solid #007bff; opacity: 0.9;"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          userLocationMarker = L.marker([lat2, lon2], { icon: arrowIcon }).addTo(map);
        } else {
          userLocationMarker = L.circleMarker([lat2, lon2], {
            radius: 8,
            color: '#007bff',
            fillColor: '#007bff',
            fillOpacity: 0.8
          }).addTo(map);
        }

        locateButton.disabled = false;
      }, () => locateButton.disabled = false);
    }, 3000);
  }, error => {
    console.warn('Error al obtener ubicación:', error);
    alert('No se pudo obtener tu ubicación');
    locateButton.disabled = false;
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180, λ2 = lon2 * Math.PI / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}
