import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Download,
  Upload,
  Trash2,
  Edit2,
  PlusCircle,
  Save,
  Check,
  X,
  FileDown,
  FileUp,
  Map,
  Layers,
  ChevronRight,
  Info,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Wifi,
  WifiOff,
  Minimize,
  Eye,
  Settings,
  Grid
} from 'lucide-react';
import { MarkerData, MapPackage } from './types';
import * as tileStore from './utils/tileStore';
import { createOfflineTileLayer } from './utils/CustomTileLayer';

// Default initial markers seeded inside Capital Federal (CABA)
const DEFAULT_MARKERS: MarkerData[] = [
  {
    id: 'm1',
    lat: -34.603722,
    lng: -58.381592,
    title: 'El Obelisco',
    description: 'Punto de encuentro central en la Ciudad de Buenos Aires, ubicado en la intersección de Av. 9 de Julio y Av. Corrientes.',
    color: '#ef4444', // Red
    iconType: 'pin',
    category: 'Puntos de Interés',
    createdAt: Date.now() - 4000000,
  },
  {
    id: 'm2',
    lat: -34.6083,
    lng: -58.3712,
    title: 'Plaza de Mayo',
    description: 'Histórica plaza rodeada por la Casa Rosada, el Cabildo y la Catedral Metropolitana de Buenos Aires.',
    color: '#10b981', // Emerald
    iconType: 'circle',
    category: 'Lugares Históricos',
    createdAt: Date.now() - 3000000,
  },
  {
    id: 'm3',
    lat: -34.6011,
    lng: -58.3816,
    title: 'Teatro Colón',
    description: 'Reconocido mundialmente por su acústica sobresaliente y su asombroso diseño arquitectónico de principios de siglo.',
    color: '#f59e0b', // Amber
    iconType: 'star',
    category: 'Cultura',
    createdAt: Date.now() - 2000000,
  },
  {
    id: 'm4',
    lat: -34.6394,
    lng: -58.3628,
    title: 'Caminito (La Boca)',
    description: 'Pasaje peatonal y calle museo tradicional de gran valor cultural y turístico, famoso por sus casas de colores de chapa.',
    color: '#8b5cf6', // Purple
    iconType: 'flag',
    category: 'Cultura',
    createdAt: Date.now() - 1000000,
  }
];

// Presets for CABA maps downloader
interface TargetPreset {
  id: string;
  name: string;
  zoomMin: number;
  zoomMax: number;
  tilesEst: number;
  sizeEst: string;
  desc: string;
}

const LEVEL_PRESETS: TargetPreset[] = [
  {
    id: 'coarse',
    name: 'Vista General (Rápido)',
    zoomMin: 11,
    zoomMax: 13,
    tilesEst: 15,
    sizeEst: '250 KB',
    desc: 'Ideal para desplazamientos generales y visualización global a gran escala.'
  },
  {
    id: 'medium',
    name: 'Detalle Urbano (Recomendado)',
    zoomMin: 11,
    zoomMax: 15,
    tilesEst: 150,
    sizeEst: '2.3 MB',
    desc: 'Muestra las principales calles, avenidas completas, autopistas y límites de barrios.'
  },
  {
    id: 'detailed',
    name: 'Totalidad de Calles (Completo)',
    zoomMin: 11,
    zoomMax: 16,
    tilesEst: 580,
    sizeEst: '8.8 MB',
    desc: 'Descarga todas las calles secundarias, pasajes y plazas de CABA de manera offline.'
  }
];

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#64748b'  // Slate
];

const CATEGORIES = [
  'Puntos de Interés',
  'Lugares Históricos',
  'Cultura',
  'Servicios',
  'Comercios',
  'Personalizado'
];

export default function App() {
  // State management
  const [markers, setMarkers] = useState<MarkerData[]>(() => {
    const saved = localStorage.getItem('caba_markers');
    return saved ? JSON.parse(saved) : DEFAULT_MARKERS;
  });

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pins' | 'offline' | 'data'>('pins');
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [addModeActive, setAddModeActive] = useState<boolean>(false);
  
  // Cache and downloader variables
  const [cachedTilesCount, setCachedTilesCount] = useState<number>(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('medium');
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const downloadCancelSignal = useRef<{ aborte: boolean }>({ aborte: false });

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<any>(null);

  // Search and filter in sidebar
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Flash toasts / notifications
  const [alertToast, setAlertToast] = useState<{ type: 'success' | 'amber' | 'error'; message: string } | null>(null);

  // Editor states
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [editingIconType, setEditingIconType] = useState<'pin' | 'star' | 'circle' | 'square' | 'flag'>('pin');
  const [editingCategory, setEditingCategory] = useState('');
  const [editingLat, setEditingLat] = useState<number>(0);
  const [editingLng, setEditingLng] = useState<number>(0);

  // Auto-sync markers to localStorage
  useEffect(() => {
    localStorage.setItem('caba_markers', JSON.stringify(markers));
  }, [markers]);

  // Update tile count stats on mount and after cache modifications
  const refreshCacheStats = async () => {
    const count = await tileStore.getTilesCount();
    setCachedTilesCount(count);
  };

  useEffect(() => {
    refreshCacheStats();
  }, []);

  // Show status triggers
  const triggerToast = (message: string, type: 'success' | 'amber' | 'error' = 'success') => {
    setAlertToast({ type, message });
    setTimeout(() => {
      setAlertToast(prev => prev?.message === message ? null : prev);
    }, 4500);
  };

  // Check CABA boundaries
  const isLatLngInCABA = (lat: number, lng: number): boolean => {
    const cabaMinLat = -34.706;
    const cabaMaxLat = -34.526;
    const cabaMinLng = -58.531;
    const cabaMaxLng = -58.335;
    return lat >= cabaMinLat && lat <= cabaMaxLat && lng >= cabaMinLng && lng <= cabaMaxLng;
  };

  // Convert Marker types to custom SVG DivIcon
  const getMarkerDivIcon = (color: string, iconType: string, isSelected: boolean) => {
    let svgInner = '';
    switch (iconType) {
      case 'star':
        svgInner = `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>`;
        break;
      case 'flag':
        svgInner = `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        break;
      case 'circle':
        svgInner = `<circle cx="12" cy="12" r="8" fill="currentColor"/>`;
        break;
      case 'square':
        svgInner = `<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>`;
        break;
      default: // 'pin'
        svgInner = `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="currentColor"/><circle cx="12" cy="10" r="3" fill="white"/>`;
        break;
    }

    const borderStyle = isSelected 
      ? 'border-3 border-slate-900 bg-slate-900 scale-125 z-[999]' 
      : 'border-2 border-white';
    
    const shadowStyle = isSelected 
      ? 'shadow-[0_4px_12px_rgba(30,41,59,0.35)]' 
      : 'shadow-md';

    const html = `
      <div class="relative flex items-center justify-center transition-transform duration-200" style="width: 38px; height: 38px;">
        ${isSelected ? `<div class="absolute inset-0 bg-slate-900 rounded-full animate-ping opacity-20"></div>` : ''}
        <div 
          class="flex items-center justify-center rounded-full ${borderStyle} ${shadowStyle} transition-all duration-200" 
          style="width: 30px; height: 30px; background-color: ${color}; color: white;"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" class="w-4 h-4">
            ${svgInner}
          </svg>
        </div>
        ${iconType === 'pin' ? `
          <div 
            class="absolute bottom-1" 
            style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${isSelected ? '#0f172a' : color}; transform: translateY(5px);"
          ></div>
        ` : ''}
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-map-marker-div',
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -38]
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center of CABA (Sarmiento/Corrientes area or Obelisco)
    const cabaCenter: L.LatLngTuple = [-34.603722, -58.381592];

    const map = L.map(mapContainerRef.current, {
      center: cabaCenter,
      zoom: 13,
      minZoom: 11,
      maxZoom: 17,
      zoomControl: false,
      // Restrict dragging / scrolling to slightly larger bounding box of CABA to prevent complete drift
      maxBounds: L.latLngBounds([-34.725, -58.55], [-34.50, -58.30]),
      maxBoundsViscosity: 0.8
    });

    // Custom styled Zoom controls in the top corner
    L.control.zoom({
      position: 'topright'
    }).addTo(map);

    // Click handler on map
    map.on('click', (e: L.LeafletMouseEvent) => {
      // Direct access inside map onClick hook
      if ((window as any).isAddModeActiveGlobal) {
        const { lat, lng } = e.latlng;
        
        if (!isLatLngInCABA(lat, lng)) {
          triggerToast('Error: El punto clickeado está fuera de los límites autorizados de CABA.', 'error');
          return;
        }

        const newId = 'marker_' + Date.now();
        const newMarkerObj: MarkerData = {
          id: newId,
          lat,
          lng,
          title: `Marcador Nuevo #${Math.floor(Math.random() * 900) + 100}`,
          description: 'Añadido en el mapa. Haz clic en el botón de edición de la barra lateral para redactar una descripción detallada.',
          color: '#3b82f6', // Classic blue
          iconType: 'pin',
          category: 'Personalizado',
          createdAt: Date.now()
        };

        setMarkers((prev) => [...prev, newMarkerObj]);
        setSelectedMarkerId(newId);
        setAddModeActive(false);
        triggerToast('¡Marcador creado correctamente en CABA!');
      }
    });

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Bootstrap first background layer
    const layer = createOfflineTileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      minZoom: 11,
      offlineOnly: false,
      attribution: '&copy; OpenStreetMap'
    });
    layer.addTo(map);
    tileLayerRef.current = layer;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update AddMode global listener bridge
  useEffect(() => {
    (window as any).isAddModeActiveGlobal = addModeActive;
  }, [addModeActive]);

  // Handle Offline state swaps on map
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    const layer = createOfflineTileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      minZoom: 11,
      offlineOnly: isOfflineMode,
      attribution: '&copy; OpenStreetMap'
    });
    
    layer.addTo(mapInstanceRef.current);
    tileLayerRef.current = layer;

    // Refresh tiles rendering
    tileLayerRef.current.redraw();
  }, [isOfflineMode]);

  // Redraw Markers whenever markers array or selected marker changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    // Gather list of filtered markers to render
    const filtered = markers.filter(m => {
      const matchQuery = m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         m.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategoryFilter === 'all' || m.category === selectedCategoryFilter;
      return matchQuery && matchCat;
    });

    filtered.forEach((m) => {
      const isSelected = m.id === selectedMarkerId;
      const icon = getMarkerDivIcon(m.color, m.iconType, isSelected);
      const leafletMarker = L.marker([m.lat, m.lng], { icon });

      leafletMarker.on('click', () => {
        setSelectedMarkerId(m.id);
        // Center view on click
        mapInstanceRef.current?.setView([m.lat, m.lng], mapInstanceRef.current.getZoom(), {
          animate: true,
          duration: 0.5
        });
      });

      // Bind simple popup
      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-1 font-sans max-w-[200px] text-slate-800';
      popupDiv.innerHTML = `
        <div class="flex items-center gap-1.5 font-bold text-slate-900 border-b border-slate-100 pb-1 mb-1.5">
          <span class="inline-block w-2 h-2 rounded-full" style="background-color: ${m.color}"></span>
          <span>${m.title}</span>
        </div>
        <p class="text-xs text-slate-600 line-clamp-3 mb-1.5 leading-relaxed">${m.description || 'Sin descripción'}</p>
        <div class="text-[9px] text-slate-400 font-mono select-all flex justify-between gap-1 border-t border-slate-50 pt-1 mt-1">
          <span>LAT: ${m.lat.toFixed(5)}</span>
          <span>LNG: ${m.lng.toFixed(5)}</span>
        </div>
      `;
      leafletMarker.bindPopup(popupDiv, { closeButton: false });

      leafletMarker.addTo(markersLayerRef.current!);

      // Auto open popup when selected
      if (isSelected) {
        leafletMarker.openPopup();
      }
    });

  }, [markers, selectedMarkerId, searchQuery, selectedCategoryFilter]);

  // Sync editor fields with chosen marker
  useEffect(() => {
    if (selectedMarkerId) {
      const active = markers.find(m => m.id === selectedMarkerId);
      if (active) {
        setEditingTitle(active.title);
        setEditingDescription(active.description);
        setEditingColor(active.color);
        setEditingIconType(active.iconType);
        setEditingCategory(active.category || 'Personalizado');
        setEditingLat(active.lat);
        setEditingLng(active.lng);
      }
    }
  }, [selectedMarkerId, markers]);

  // Fly map to a target marker
  const handleFlyTo = (m: MarkerData) => {
    setSelectedMarkerId(m.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([m.lat, m.lng], 15, {
        duration: 1
      });
    }
  };

  // Save edited marker details
  const handleSaveMarkerDetails = () => {
    if (!selectedMarkerId) return;

    if (!isLatLngInCABA(editingLat, editingLng)) {
      triggerToast('Error: Las coordenadas ingresadas se encuentran fuera de CABA.', 'error');
      return;
    }

    setMarkers(prev => prev.map(m => {
      if (m.id === selectedMarkerId) {
        return {
          ...m,
          title: editingTitle.trim() || 'Marcador sin Nombre',
          description: editingDescription.trim(),
          color: editingColor,
          iconType: editingIconType,
          category: editingCategory,
          lat: editingLat,
          lng: editingLng
        };
      }
      return m;
    }));

    triggerToast('Marcador actualizado con éxito.');
  };

  // Delete marker
  const handleDeleteMarker = (id: string) => {
    const confirmDelete = window.confirm('¿Estás seguro de que deseas eliminar este marcador?');
    if (!confirmDelete) return;

    setMarkers(prev => prev.filter(m => m.id !== id));
    if (selectedMarkerId === id) {
      setSelectedMarkerId(null);
    }
    triggerToast('Marcador eliminado correctamente.', 'amber');
  };

  // Download maps from tile server preset
  const handleDownloadTiles = async () => {
    const preset = LEVEL_PRESETS.find(p => p.id === selectedPresetId);
    if (!preset) return;

    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: 100, message: 'Iniciando conexión con el servidor...' });
    downloadCancelSignal.current.aborte = false;

    try {
      const count = await tileStore.downloadCABATiles(
        preset.zoomMin,
        preset.zoomMax,
        (current, total, message) => {
          setDownloadProgress({ current, total, message });
        },
        downloadCancelSignal.current
      );

      await refreshCacheStats();
      
      if (downloadCancelSignal.current.aborte) {
        triggerToast(`Descarga interrumpida. Se guardaron ${count} teselas.`, 'amber');
      } else {
        triggerToast(`¡Excelente! Descargado con éxito. Se guardaron ${count} teselas en DB.`);
      }
    } catch (err) {
      console.error(err);
      triggerToast('Ocurrió un error al intentar descargar teselas del mapa.', 'error');
    } finally {
      setIsDownloading(false);
      // reset progress message after a few seconds
      setTimeout(() => setDownloadProgress(null), 5000);
    }
  };

  // Cancel running tiles download
  const handleCancelDownload = () => {
    downloadCancelSignal.current.aborte = true;
    triggerToast('Cancelando descarga...', 'amber');
  };

  // Wipe cached map tiles
  const handleClearTileCache = async () => {
    const confirmWipe = window.confirm('Esto eliminará todas las teselas descargadas de tu base de datos local. ¿Continuar?');
    if (!confirmWipe) return;

    try {
      await tileStore.clearTiles();
      await refreshCacheStats();
      triggerToast('La base de datos de teselas offline fue vaciada completamente.', 'amber');
    } catch (err) {
      console.error(err);
      triggerToast('Error al vaciar los archivos guardados.', 'error');
    }
  };

  // Export overlay markers as pure JSON file
  const handleExportPinsOnly = () => {
    try {
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(markers, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', 'marcadores_caba_offline.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      triggerToast('Se ha descargado el JSON de marcadores con éxito.');
    } catch (e) {
      console.error(e);
      triggerToast('Error al exportar marcadores.', 'error');
    }
  };

  // Load overlay markers from JSON file
  const handleImportPinsOnly = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result as string;
        const imported = JSON.parse(result);

        if (!Array.isArray(imported)) {
          triggerToast('Error: El formato de archivo no es un array válido de marcadores.', 'error');
          return;
        }

        // Fast sanitary validate
        const validated: MarkerData[] = [];
        imported.forEach((m: any, idx: number) => {
          if (typeof m.lat === 'number' && typeof m.lng === 'number' && m.title) {
            validated.push({
              id: m.id || `imported_${idx}_${Date.now()}`,
              lat: m.lat,
              lng: m.lng,
              title: m.title,
              description: m.description || '',
              color: m.color || '#3b82f6',
              iconType: m.iconType || 'pin',
              category: m.category || 'Importado',
              createdAt: m.createdAt || Date.now()
            });
          }
        });

        if (validated.length === 0) {
          triggerToast('No se encontraron marcadores válidos para importar.', 'error');
          return;
        }

        const mode = window.confirm(`Se encontraron ${validated.length} marcadores. ¿Deseas REEMPLAZAR tu lista actual? (Haga clic en Cancelar para MERGEARLOS con tus pines vigentes)`);
        
        if (mode) {
          setMarkers(validated);
        } else {
          setMarkers(prev => {
            // Avoid duplicate ids
            const existingIds = new Set(prev.map(p => p.id));
            const distinctNew = validated.filter(v => !existingIds.has(v.id));
            return [...prev, ...distinctNew];
          });
        }

        triggerToast(`Se importaron ${validated.length} marcadores satisfactoriamente.`);
      } catch (err) {
        console.error(err);
        triggerToast('Error: El archivo no es un archivo JSON de marcadores válido.', 'error');
      }
    };
    reader.readAsText(file);
    // Reset file input value so same file can be uploaded again
    e.target.value = '';
  };

  // Export Combined Offline Map Package (Tiles dict + Pins database)
  const handleExportFullMapPackage = async () => {
    try {
      triggerToast('Generando paquete completo. Espere un momento...', 'success');
      
      // Get all base64 tile records from IndexedDB
      const cachedTiles = await tileStore.getAllTiles();
      const keys = Object.keys(cachedTiles);

      if (keys.length === 0) {
        const confirmExportEmpty = window.confirm('No tienes ninguna tesela de mapa descargada en tu base de datos offline. ¿Quieres exportar un paquete solo con tus marcadores?');
        if (!confirmExportEmpty) return;
      }

      const mapPackage: MapPackage = {
        name: `CABA Mapa Offline - Exportado ${new Date().toLocaleDateString()}`,
        downloadedAt: Date.now(),
        zoomMin: 11,
        zoomMax: 17,
        tilesCount: keys.length,
        pins: markers,
        tiles: cachedTiles
      };

      const fileData = JSON.stringify(mapPackage);
      const blob = new Blob([fileData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', url);
      downloadAnchor.setAttribute('download', `caba_offline_package_completo_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      triggerToast(`¡Paquete exportado con éxito! Contiene ${keys.length} teselas y ${markers.length} marcadores.`);
    } catch (e) {
      console.error(e);
      triggerToast('Hubo un error compilando el mapa offline.', 'error');
    }
  };

  // Upload Previous Map packages from other users
  const handleImportFullMapPackage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    triggerToast('Procesando archivo recibido, cargando y actualizando base de datos local...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result as string;
        const decodedPackage = JSON.parse(result) as MapPackage;

        if (!decodedPackage.tiles || typeof decodedPackage.tiles !== 'object') {
          triggerToast('Error: El formato no corresponde a un paquete de mapa offline (.json completo).', 'error');
          return;
        }

        const tileKeys = Object.keys(decodedPackage.tiles);
        const pinsCount = decodedPackage.pins?.length || 0;

        const confirmImport = window.confirm(`Estás por cargar un paquete de mapa offline que contiene:\n- ${tileKeys.length} teselas de mapas pre-descargadas\n- ${pinsCount} marcadores georreferenciados\n\n¿Quieres continuar con la importación e incorporarlos a tu base de datos?`);
        
        if (!confirmImport) return;

        // Save imported tiles to DB
        await tileStore.saveAllTiles(decodedPackage.tiles);
        await refreshCacheStats();

        // Save imported pins
        if (decodedPackage.pins && Array.isArray(decodedPackage.pins)) {
          setMarkers(decodedPackage.pins);
        }

        triggerToast(`¡Todo listo! Se importaron ${tileKeys.length} teselas y ${pinsCount} marcadores con éxito.`, 'success');
      } catch (err) {
        console.error(err);
        triggerToast('Error al parsear el archivo del paquete.', 'error');
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = '';
  };

  // Filter markers matches count
  const filteredMarkers = markers.filter(m => {
    const matchQuery = m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       m.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = selectedCategoryFilter === 'all' || m.category === selectedCategoryFilter;
    return matchQuery && matchCat;
  });

  return (
    <div className="absolute inset-0 flex flex-col md:flex-row bg-slate-950 overflow-hidden font-sans select-none antialiased text-slate-200">
      
      {/* Sidebar Section */}
      <aside className="w-full md:w-[420px] md:max-w-[420px] bg-slate-900 border-b md:border-b-0 md:border-r border-slate-850 flex flex-col z-[1000] shadow-2xl shadow-black/40 shrink-0">
        
        {/* Brand App Header */}
        <div className="p-4 bg-slate-950 text-slate-100 flex flex-col gap-2 relative border-b border-slate-850">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600/10 text-blue-400 border border-blue-500/30 rounded-lg">
                <Map className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-widest text-white leading-none">CABA MAP ENGINE</h1>
                <p className="text-[9px] text-slate-500 font-bold font-mono tracking-wider mt-1">SISTEMA OFFLINE INTERACTIVO</p>
              </div>
            </div>
            
            {/* Status Mode Indicator badge */}
            <button 
              onClick={() => {
                setIsOfflineMode(!isOfflineMode);
                triggerToast(isOfflineMode ? 'Trabajando en tiempo real con descarga automática.' : 'Modo Offline Forzado activado. El mapa solo usará teselas guardadas en caché.');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase cursor-pointer select-none transition-all duration-200 ${
                isOfflineMode 
                  ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 shadow-sm' 
                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 shadow-sm'
              }`}
              title="Haz clic para alternar entre el estado Online y el Modo Offline Forzado"
            >
              <span className={`w-1.5 h-1.5 rounded-full inline-block animate-pulse-soft ${isOfflineMode ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {isOfflineMode ? (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Offline</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>Online</span>
                </>
              )}
            </button>
          </div>

          <div className="text-[10.5px] text-slate-400 mt-1 leading-relaxed flex items-center gap-1.5 bg-slate-900/40 p-2 rounded border border-slate-800/40">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Región restringida a CABA. El cargador de mapa externo fuera del límite está deshabilitado.</span>
          </div>
        </div>

        {/* Dynamic Navigation tabs */}
        <div className="flex border-b border-slate-850 bg-slate-950 p-1 gap-1">
          <button
            onClick={() => setActiveTab('pins')}
            className={`flex-1 py-1.5 px-1 text-xs font-bold rounded transition-all flex items-center justify-center gap-1.5 tracking-wider ${
              activeTab === 'pins'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <span className="uppercase text-[10px]">Marcadores</span>
            <span className="ml-1 bg-slate-950 border border-slate-800 text-blue-400 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">{markers.length}</span>
          </button>
          
          <button
            onClick={() => setActiveTab('offline')}
            className={`flex-1 py-1.5 px-1 text-xs font-bold rounded transition-all flex items-center justify-center gap-1.5 tracking-wider ${
              activeTab === 'offline'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span className="uppercase text-[10px]">Caché</span>
            {cachedTilesCount > 0 && (
              <span className="ml-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">
                {cachedTilesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`flex-1 py-1.5 px-1 text-xs font-bold rounded transition-all flex items-center justify-center gap-1.5 tracking-wider ${
              activeTab === 'data'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-yellow-400" />
            <span className="uppercase text-[10px]">Paquetes</span>
          </button>
        </div>

        {/* Tab contents wrapper */}
        <div className="flex-1 overflow-y-auto flex flex-col bg-slate-900/60">
          
          {/* TAB 1: PINS AND MARKERS WORKSPACE */}
          {activeTab === 'pins' && (
            <div className="flex flex-col flex-1">
              
              {/* Search and Filters panel */}
              <div className="p-3 bg-slate-950 border-b border-slate-850 flex flex-col gap-2">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Filtrar por nombre o contenido..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:outline-none focus:border-blue-500 text-slate-100 placeholder-slate-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1 mt-0.5 no-scrollbar">
                  <button
                    onClick={() => setSelectedCategoryFilter('all')}
                    className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded transition-colors ${
                      selectedCategoryFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-850 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Todos
                  </button>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategoryFilter(cat)}
                      className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded whitespace-nowrap transition-colors ${
                        selectedCategoryFilter === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-850 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pins Action Hub */}
              <div className="p-3 border-b border-slate-850 flex items-center justify-between bg-slate-900">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Marcadores de CABA ({filteredMarkers.length})</span>
                <button
                  onClick={() => {
                    setAddModeActive(!addModeActive);
                    if (!addModeActive) {
                      triggerToast('Modo de creación activado. Haz clic en el mapa de CABA para añadir un pin.', 'amber');
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
                    addModeActive
                      ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse-soft'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/10'
                  }`}
                >
                  {addModeActive ? (
                    <>
                      <X className="w-3.5 h-3.5" />
                      <span>Cancelar</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Añadir Pin</span>
                    </>
                  )}
                </button>
              </div>

              {/* Dynamic Add Mode Instruction Box */}
              {addModeActive && (
                <div className="m-3 p-3 bg-amber-950/20 border border-amber-900/40 text-amber-300 rounded text-xs leading-relaxed">
                  <p className="font-bold mb-1 flex items-center gap-1 uppercase tracking-wider text-[10px]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    Colocación activa
                  </p>
                  Haz clic directo en cualquier punto del mapa dentro de los límites de CABA para registrar un marcador en esas coordenadas exactas.
                </div>
              )}

              {/* Marker Editor Drawer (Displays when a pin is selected) */}
              {selectedMarkerId ? (
                <div className="m-3 p-3.5 border border-slate-800 bg-slate-950 rounded-lg flex flex-col gap-3 shadow-inner">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Edit2 className="w-4 h-4 text-blue-400" />
                      Editar Marcador
                    </span>
                    <button
                      onClick={() => setSelectedMarkerId(null)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 transition-colors"
                      title="Cerrar Editor"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Form fields */}
                  <div className="flex flex-col gap-3 text-[11px]">
                    <div>
                      <label className="block font-bold text-slate-450 uppercase tracking-widest text-[9px] mb-1">Nombre / Título</label>
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-2 focus:outline-none focus:border-blue-500 text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-450 uppercase tracking-widest text-[9px] mb-1">Categoría</label>
                        <select
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 focus:outline-none focus:border-blue-500 text-white"
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat} value={cat} className="bg-slate-950">{cat}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-450 uppercase tracking-widest text-[9px] mb-1">Forma</label>
                        <select
                          value={editingIconType}
                          onChange={(e) => setEditingIconType(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 focus:outline-none focus:border-blue-500 text-white"
                        >
                          <option value="pin" className="bg-slate-950">Marcador Estándar</option>
                          <option value="star" className="bg-slate-950 font-sans">Estrella</option>
                          <option value="circle" className="bg-slate-950">Círculo plano</option>
                          <option value="square" className="bg-slate-950">Cuadrado</option>
                          <option value="flag" className="bg-slate-950">Bandera</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-450 uppercase tracking-widest text-[9px] mb-1">Descripción</label>
                      <textarea
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        rows={2}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-2 focus:outline-none focus:border-blue-500 text-white resize-none"
                        placeholder="Descripción para este marcador offline..."
                      />
                    </div>

                    {/* Coordinates input */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-450 uppercase tracking-widest text-[9px] mb-0.5">Latitud</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={editingLat}
                          onChange={(e) => setEditingLat(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-blue-500 text-white font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-450 uppercase tracking-widest text-[9px] mb-0.5">Longitud</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={editingLng}
                          onChange={(e) => setEditingLng(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-blue-500 text-white font-mono text-[11px]"
                        />
                      </div>
                    </div>

                    {/* Preset color selector */}
                    <div>
                      <span className="block font-bold text-slate-450 uppercase tracking-widest text-[9px] mb-1.5">Color del Indicador</span>
                      <div className="flex items-center gap-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditingColor(c)}
                            className={`w-5 h-5 rounded-full border transition-all ${
                              editingColor === c
                                ? 'scale-115 ring-2 ring-blue-500 border-slate-950'
                                : 'border-slate-800 hover:scale-110'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Editor actions */}
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={handleSaveMarkerDetails}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 text-center shadow-md cursor-pointer transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Guardar Cambios
                      </button>
                      <button
                        onClick={() => handleDeleteMarker(selectedMarkerId)}
                        className="bg-rose-955 hover:bg-rose-900 border border-rose-900/40 text-rose-400 font-bold py-2 px-3 rounded text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Eliminar este marcador"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Pins list */}
              <div className="flex-1 divide-y divide-slate-850">
                {filteredMarkers.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                    <MapPin className="w-8 h-8 text-slate-700 stroke-1" />
                    <span>No se encontraron marcadores con los filtros seleccionados.</span>
                  </div>
                ) : (
                  filteredMarkers.map((m) => {
                    const isSelected = selectedMarkerId === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => handleFlyTo(m)}
                        className={`p-3 transition-all duration-150 cursor-pointer flex gap-3 text-xs justify-between group ${
                          isSelected 
                            ? 'bg-slate-950/80 border-l-4 border-blue-500' 
                            : 'hover:bg-slate-850/40 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span 
                              className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_4px_currentColor]" 
                              style={{ backgroundColor: m.color, color: m.color }}
                            />
                            <h3 className="font-bold text-slate-200 truncate text-[11.5px]">{m.title}</h3>
                            <span className="text-[8.5px] bg-slate-950 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                              {m.category || 'General'}
                            </span>
                          </div>
                          
                          <p className="text-slate-450 line-clamp-2 text-[11px] leading-relaxed mb-1 capitalize-first">
                            {m.description || 'Sin descripción redactada.'}
                          </p>

                          <div className="text-[9.5px] text-slate-550 font-mono flex items-center gap-2">
                            <span>Lat: {m.lat.toFixed(5)}</span>
                            <span>Lng: {m.lng.toFixed(5)}</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end justify-between shrink-0">
                          <ChevronRight className={`w-3.5 h-3.5 text-slate-555 transition-transform ${isSelected ? 'translate-x-0.5 text-blue-400' : 'group-hover:translate-x-0.5'}`} />
                          
                          {/* Quick Edit shortcut inside item */}
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMarkerId(m.id);
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60"
                              title="Editar marcador"
                            >
                              <Edit2 className="w-3 h-3" style={{ width: '12px', height: '12px' }} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMarker(m.id);
                              }}
                              className="p-1 rounded bg-rose-950/20 hover:bg-rose-900/30 text-rose-400 hover:text-rose-300 border border-rose-900/50"
                              title="Quitar"
                            >
                              <Trash2 className="w-3 h-3" style={{ width: '12px', height: '12px' }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: OFFLINE DOWNLOADER AND STORAGE MANAGER */}
          {activeTab === 'offline' && (
            <div className="p-4 flex flex-col gap-4 text-xs">
              
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 shadow-inner">
                <h3 className="font-bold text-slate-200 mb-2 flex items-center gap-1.5 text-[12px] uppercase tracking-wider">
                  <Grid className="w-4 h-4 text-blue-450" />
                  Estado de Caches del Mapa
                </h3>
                
                <div className="space-y-1.5 mt-2 text-slate-400 font-medium">
                  <div className="flex justify-between border-b border-slate-850 pb-1.5">
                    <span>Teselas Almacenadas:</span>
                    <span className="font-mono text-slate-100 font-bold">{cachedTilesCount}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-850 pb-1.5">
                    <span>Espacio Estimado ocupado:</span>
                    <span className="font-mono text-slate-105 font-bold">
                      {(cachedTilesCount * 15 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Límite de Cobertura:</span>
                    <span className="text-blue-400 font-bold uppercase text-[10px] tracking-wide">CABA (Restringido)</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={refreshCacheStats}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold py-1.5 border border-slate-800 rounded flex items-center justify-center gap-1 cursor-pointer transition-colors text-[10px] uppercase tracking-wider"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Actualizar
                  </button>
                  <button
                    onClick={handleClearTileCache}
                    className="flex-1 bg-rose-955/20 hover:bg-rose-900/30 text-rose-400 font-bold py-1.5 border border-rose-900/40 rounded flex items-center justify-center gap-1 cursor-pointer transition-colors text-[10px] uppercase tracking-wider"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Vaciar todo
                  </button>
                </div>
              </div>

              {/* Predefined Presets Downloading selection */}
              <div className="flex flex-col gap-2">
                <h4 className="font-bold text-slate-200 text-[12px] flex items-center gap-1.5 uppercase tracking-wider">
                  <Download className="w-4 h-4 text-blue-400" />
                  Descargar Cobertura CABA
                </h4>
                <p className="text-slate-450 leading-relaxed text-[11px]">
                  Descarga previamente un rango de imágenes de mapa de la Ciudad de Buenos Aires para que los buscadores puedan navegar libremente sin contar con conexión a internet.
                </p>

                {/* Presets Cards list */}
                <div className="flex flex-col gap-2 mt-1">
                  {LEVEL_PRESETS.map((p) => {
                    const isSelectedPreset = selectedPresetId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => !isDownloading && setSelectedPresetId(p.id)}
                        className={`p-3 border rounded cursor-pointer transition-all ${
                          isSelectedPreset
                            ? 'border-blue-500 bg-blue-950/20 text-white shadow-md shadow-blue-950/40'
                            : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300'
                        } ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span className="text-xs uppercase tracking-wide">{p.name}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            isSelectedPreset 
                              ? 'bg-blue-950/80 text-blue-450 border-blue-800' 
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}>
                            ~{p.sizeEst}
                          </span>
                        </div>
                        <p className={`text-[10px] leading-relaxed ${
                          isSelectedPreset ? 'text-slate-250' : 'text-slate-450'
                        }`}>
                          {p.desc}
                        </p>
                        <div className="text-[9px] mt-1.5 font-mono flex gap-2 opacity-80 text-slate-500">
                          <span>Zooms: {p.zoomMin} a {p.zoomMax}</span>
                          <span>|</span>
                          <span>Aprox. {p.tilesEst} imágenes</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Downloader controls */}
                <div className="mt-2.5">
                  {isDownloading ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
                      <div className="flex justify-between text-xs font-bold text-slate-205">
                        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          Descargando teselas...
                        </span>
                        <span className="font-mono">
                          {downloadProgress ? `${downloadProgress.current} / ${downloadProgress.total}` : '-'}
                        </span>
                      </div>

                      {/* Custom styled progress bar */}
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-150 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                          style={{ 
                            width: downloadProgress && downloadProgress.total > 0
                              ? `${(downloadProgress.current / downloadProgress.total) * 100}%`
                              : '0%' 
                          }}
                        />
                      </div>

                      <p className="text-[10px] font-mono text-slate-500 truncate capitalize-first">
                        {downloadProgress?.message || 'Procesando...'}
                      </p>

                      <button
                        onClick={handleCancelDownload}
                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 rounded cursor-pointer transition-colors text-center text-[10px] uppercase tracking-wider"
                      >
                        Detener Descarga
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleDownloadTiles}
                      className="w-full p-3 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer text-[11px] uppercase tracking-wider"
                    >
                      <Download className="w-4 h-4" />
                      Iniciar Descarga para Offline
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3 text-slate-350 leading-relaxed text-[11px] flex gap-2">
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <span className="font-bold block text-blue-300 mb-0.5 uppercase tracking-wide text-[10px]">Nota de Operación Offline</span>
                  La aplicación almacena automáticamente cada sector del mapa que exploras manualmente cuando tienes conexión (Online). De este modo, puedes construir tu caché offline simplemente navegando por CABA.
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: SUPPORT/SYNC PANELS - IMPORT AND EXPORTS */}
          {activeTab === 'data' && (
            <div className="p-4 flex flex-col gap-4 text-xs">
              
              {/* Overlay Pins only import/export */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5 shadow-inner">
                <h3 className="font-bold text-slate-200 text-[12px] flex items-center gap-1.5 uppercase tracking-wider">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  Exportar / Importar Pines (.json)
                </h3>
                <p className="text-slate-450 text-[11px] leading-relaxed">
                  Exporta únicamente tu base de datos de marcadores registrados o importa un archivo JSON previo para incorporarlos al mapa interactivo.
                </p>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={handleExportPinsOnly}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold py-2 px-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-[10.5px] uppercase tracking-wider"
                  >
                    <FileDown className="w-4 h-4 text-blue-400" />
                    <span>Descargar JSON</span>
                  </button>

                  <label className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-center text-[10.5px] uppercase tracking-wider">
                    <FileUp className="w-4 h-4 text-white" />
                    <span>Subir JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportPinsOnly}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Combined offline package import/export (The master feature) */}
              <div className="bg-gradient-to-br from-blue-950/40 via-blue-900/10 to-slate-950 text-slate-200 border border-blue-900/30 rounded-lg p-3.5 flex flex-col gap-2.5 shadow-md shadow-blue-950/20">
                <h3 className="font-bold text-[12px] flex items-center gap-1.5 text-blue-400 uppercase tracking-wider">
                  <Layers className="w-4 h-4" />
                  Paquetes Completos del Mapa
                </h3>
                <p className="text-slate-350 text-[11px] leading-relaxed">
                  Permite exportar un solo archivo agrupable que contiene **tanto todas tus teselas de mapa offline guardadas en IndexedDB como tus marcadores**. 
                  <br />
                  De esta forma, otros usuarios pueden cargar tu archivo y tener el mapa completo listo y funcionando 100% de manera offline al instante.
                </p>

                <div className="flex flex-col gap-2 mt-1">
                  <button
                    onClick={handleExportFullMapPackage}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-3 rounded flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors text-[10.5px] uppercase tracking-wider"
                  >
                    <FileDown className="w-4.5 h-4.5 text-white" />
                    <span>Exportar Paquete Completo</span>
                  </button>

                  <label className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-bold py-2.5 px-3 rounded flex items-center justify-center gap-2 cursor-pointer transition-colors text-[10.5px] uppercase tracking-wider text-center">
                    <FileUp className="w-4.5 h-4.5 text-blue-450" />
                    <span>Cargar Paquete de Otro</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportFullMapPackage}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Detailed specs */}
              <div className="text-[10px] text-slate-450 leading-relaxed space-y-1 bg-slate-950 p-3 rounded border border-slate-850/60">
                <p className="font-bold text-slate-305 uppercase tracking-wide">¿Cómo compartir el mapa offline?</p>
                <ol className="list-decimal pl-4 space-y-1 text-[10.5px]">
                  <li>Haz zoom y navega los barrios de CABA en modo Online, o utiliza la pestaña "Descargas" para guardar todo por rangos.</li>
                  <li>Ve a esta pestaña y presiona "Exportar Paquete Completo". Se descargará un archivo consolidado.</li>
                  <li>Envía ese archivo a otro usuario. Él podrá importarlo usando el botón "Cargar Paquete de Otro".</li>
                </ol>
              </div>

            </div>
          )}

        </div>

        {/* Sidebar Footer Details */}
        <div className="p-3 bg-slate-950 border-t border-slate-855 text-[10px] uppercase font-bold tracking-wider text-slate-500">
          <div className="flex justify-between items-center">
            <span>Jurisdicción: <strong className="text-slate-300">CABA</strong></span>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full inline-block animate-pulse-soft" />
              DB local activa
            </span>
          </div>
        </div>

      </aside>

      {/* Main Map Workplace Panel */}
      <main className="flex-1 relative flex flex-col bg-slate-955">
        
        {/* Absolute floating indicators inside the Map */}
        <div className="absolute top-4 left-4 z-[999] flex flex-col gap-2 pointer-events-none">
          
          {/* Active Toast notifications */}
          {alertToast && (
            <div className={`p-3.5 rounded border shadow-2xl max-w-sm pointer-events-auto flex items-start gap-2.5 text-[11px] font-bold tracking-wide uppercase animate-bounce-soft ${
              alertToast.type === 'error' 
                ? 'bg-rose-950/95 text-rose-200 border-rose-900/60' 
                : alertToast.type === 'amber'
                ? 'bg-amber-955/95 text-amber-205 border-amber-800/60'
                : 'bg-slate-950/95 text-slate-100 border-slate-800'
            }`}>
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-450" />
              <p className="leading-snug flex-1">{alertToast.message}</p>
              <button 
                onClick={() => setAlertToast(null)} 
                className="ml-2 p-0.5 hover:bg-white/10 rounded cursor-pointer text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quick Active Overlays & Warnings Info Bubble */}
          <div className="bg-slate-950/90 backdrop-blur-md p-3 rounded shadow-2xl border border-slate-800 pointer-events-auto flex flex-col gap-1.5 max-w-xs text-xs">
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-200">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOfflineMode ? 'bg-amber-400' : 'bg-blue-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isOfflineMode ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
              </span>
              <span>{isOfflineMode ? 'Modo Offline Forzado' : 'Modo Online Activo'}</span>
            </div>
            <p className="text-slate-400 text-[10.5px] leading-relaxed">
              {isOfflineMode 
                ? 'El mapa utiliza únicamente imágenes descargadas previamente en IndexedDB. No se realizará ninguna petición externa.'
                : 'Las imágenes se descargan y guardan en el caché local de forma automática a medida que exploras CABA.'}
            </p>
          </div>
        </div>

        {/* Dynamic add mode crosshair state */}
        {addModeActive && (
          <div className="absolute top-4 right-16 z-[999] bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded shadow-lg text-[10.5px] uppercase tracking-wider animate-pulse-soft flex items-center gap-1.5 pointer-events-auto">
            <Sparkles className="w-4 h-4 text-slate-950" />
            <span>Haz clic en el mapa</span>
          </div>
        )}

        {/* Map Container Ref */}
        <div 
          id="caba-interactive-map"
          ref={mapContainerRef} 
          className={`flex-1 w-full h-full transition-all ${addModeActive ? 'cursor-crosshair' : ''}`}
        />

        {/* Mini HUD coordinates on hover/move */}
        <div className="absolute bottom-4 right-16 z-[999] bg-slate-950/95 backdrop-blur-md px-3 py-1.5 rounded text-[10px] font-mono text-slate-400 shadow-2xl border border-slate-850 flex items-center gap-2.5 pointer-events-none">
          <span className="text-blue-400 font-bold tracking-widest uppercase">HUD Engine</span>
          <span>|</span>
          <span className="text-slate-500">CABA LIMITS ACTIVE</span>
        </div>

      </main>

    </div>
  );
}
