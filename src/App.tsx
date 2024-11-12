import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nfexunixjcylaxsuasuc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mZXh1bml4amN5bGF4c3Vhc3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEzNjcwNTAsImV4cCI6MjA0Njk0MzA1MH0.-ESP-AVbSh9JnH7ajPqTxVFxVeeFUZz_eSpteXEvMgA';
const supabase = createClient(supabaseUrl, supabaseKey);

const transformCoordinates = (coordinates : number[]) => {
  const transformed = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    transformed.push([coordinates[i], coordinates[i + 1]]);
  }
  return [transformed]; // Wrap in array to match GeoJSON format for a Polygon
};

function App() {
  const mapRef = useRef();
  const mapContainerRef = useRef();
  const [geoData, setGeoData] = useState({
    type: 'FeatureCollection',
    features: [],
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data, error } = await supabase.from('parkingData').select('*');
      if (error) {
        console.error('Error fetching initial data:', error);
        return;
      }

      const initialFeatures = data.map((item) => ({
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

      setGeoData({
        type: 'FeatureCollection',
        features: initialFeatures,
      });
    };

    fetchInitialData();

    const channel = supabase
      .channel('parkingData')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parkingData' },
        (payload) => {
          const updatedFeature = {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: transformCoordinates(payload.new.coordinates),
            },
            properties: {
              id: payload.new.id,
              status: payload.new.status,
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    mapboxgl.accessToken = 'pk.eyJ1IjoiYWx5eW91c3NlZiIsImEiOiJjbTNkaWJxNzMwM3poMm1xeTQ1cmFlZTVqIn0.vPHATw-9Rs7j3y-iW7oPJA';
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      center: [31.499159810172785, 30.017576505538145],
      zoom: 16.12,
    });

    mapRef.current.on('load', () => {
      mapRef.current.addSource('parking', {
        type: 'geojson',
        data: geoData,
      });

      mapRef.current.addLayer({
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

    return () => {
      mapRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      mapRef.current.getSource('parking').setData(geoData);
    }
  }, [geoData]);

  return <div id="map-container" ref={mapContainerRef} />;
}

export default App;
