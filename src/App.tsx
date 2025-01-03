import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css';
import { createClient } from '@supabase/supabase-js';
import { FeatureCollection, Geometry, Polygon, Feature } from 'geojson'; // Import FeatureCollection type

const supabaseUrl = '';
const supabaseKey = '';
const supabase = createClient(supabaseUrl, supabaseKey);

const transformCoordinates = (coordinates: number[]) => {
  const transformed = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    transformed.push([coordinates[i], coordinates[i + 1]]);
  }
  return [transformed]; // Wrap in array to match GeoJSON format for a Polygon
};

function App() {
  const mapRef = useRef<mapboxgl.Map | undefined>(undefined); // Explicitly set the type
  const mapContainerRef = useRef(null);
  const [geoData, setGeoData] = useState<FeatureCollection<Geometry>>({
    type: 'FeatureCollection',
    features: [],
  });

  const [freeSpots, setFreeSpots] = useState(0);
  const [takenSpots, setTakenSpots] = useState(0);

  // Fetch data on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      const { data, error } = await supabase.from('parkingData').select('*');
      if (error) {
        console.error('Error fetching initial data:', error);
        return;
      }

      const initialFeatures: Feature<Polygon, { id: number; status: string }>[] = data.map((item) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: transformCoordinates(item.coordinates),
        },
        properties: {
          id: item.id,
          status: item.status,
        },
      }));

      // Calculate free and taken spots
      const taken = data.filter(item => item.status === 'occupied').length;
      const free = data.filter(item => item.status === 'free').length;
      
      setFreeSpots(free);
      setTakenSpots(taken);

      setGeoData({
        type: 'FeatureCollection',
        features: initialFeatures,
      });
    };

    fetchInitialData();

    // Set up real-time subscription to updates
    const channel = supabase
      .channel('parkingData')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parkingData' }, (payload) => {
        const updatedFeature: Feature<Polygon, { id: number; status: string }> = {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: transformCoordinates((payload.new as { coordinates: number[] }).coordinates),
          },
          properties: {
            id: (payload.new as { id: number }).id,
            status: (payload.new as { status: string }).status,
          },
        };

        setGeoData((prevData) => {
          const existingFeatureIndex = prevData.features.findIndex(
            (feature) => feature.properties.id === updatedFeature.properties.id
          );

          if (existingFeatureIndex >= 0) {
            const updatedFeatures = [...prevData.features];
            updatedFeatures[existingFeatureIndex] = updatedFeature;
            return { ...prevData, features: updatedFeatures };
          } else {
            return {
              ...prevData,
              features: [...prevData.features, updatedFeature],
            };
          }
        });

      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Initialize map and add source and layer
  useEffect(() => {
    if (!mapRef.current && geoData.features.length > 0) {
      // Initialize map only when geoData is available
      mapboxgl.accessToken = '';
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        center: [31.499159810172785, 30.017576505538145],
        zoom: 16.12,
      });

      mapRef.current.on('load', () => {
        // Add the source and layer when the map is loaded
        mapRef.current?.addSource('parking', {
          type: 'geojson',
          data: geoData,
        });

        mapRef.current?.addLayer({
          id: 'parking-layer',
          type: 'fill',
          source: 'parking',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'status'], 'occupied'], '#FF0000',
              '#32a852',
            ],
          },
        });
      });
    } else if (mapRef.current) {
      // If map is already initialized, update the source data
      const source = mapRef.current.getSource('parking') as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData(geoData); // Update the data if mapRef exists
      }
    }
      // Recalculate free and taken spots after data change
      const taken = geoData.features.filter(feature => feature.properties.status === 'occupied').length;
      const free = geoData.features.filter(feature => feature.properties.status === 'open').length;
      setFreeSpots(free);
      setTakenSpots(taken);
    
  }, [geoData]); // Only run this effect when geoData is updated

  return (
    <>
      <div id="map-container" ref={mapContainerRef} />
      
      {/* Fixed window for parking spot counts */}
      <div id="spot-counter">
        <div><strong>Free Spots:</strong> {freeSpots}</div>
        <div><strong>Taken Spots:</strong> {takenSpots}</div>
      </div>
    </>
  );
}

export default App;
