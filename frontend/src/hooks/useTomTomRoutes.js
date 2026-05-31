import { useCallback, useEffect, useRef, useState } from 'react';
import { TOMTOM_API_KEY } from '../config';
import { movedEnough } from '../utils/mapFormat';
import { fetchTomTomRoutes } from '../utils/tomtomApi';

export function useTomTomRoutes(origin, destination, { enabled = true, maxAlternatives = 2 } = {}) {
    const [routes, setRoutes] = useState([]);
    const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
    const [loadingRoutes, setLoadingRoutes] = useState(false);
    const [routeError, setRouteError] = useState('');
    const lastFetchRef = useRef({ key: '', at: 0, origin: null, destination: null });

    const loadRoutes = useCallback(async () => {
        if (!enabled || !TOMTOM_API_KEY || !origin || !destination) {
            setRoutes([]);
            setRouteError('');
            return;
        }

        const key = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lon.toFixed(4)}`;
        const now = Date.now();
        if (lastFetchRef.current.key === key && now - lastFetchRef.current.at < 120_000) {
            return;
        }

        setLoadingRoutes(true);
        setRouteError('');

        try {
            const parsed = await fetchTomTomRoutes(TOMTOM_API_KEY, origin, destination, maxAlternatives);
            if (!parsed.length) {
                setRouteError('Marşrut tapılmadı');
                setRoutes([]);
            } else {
                setRoutes(parsed);
                setSelectedRouteIdx(0);
                lastFetchRef.current = { key, at: now, origin, destination };
            }
        } catch (err) {
            setRouteError(err?.message || 'Marşrut alınmadı');
            setRoutes([]);
        } finally {
            setLoadingRoutes(false);
        }
    }, [enabled, origin, destination, maxAlternatives]);

    useEffect(() => {
        loadRoutes();
    }, [loadRoutes]);

    useEffect(() => {
        if (!enabled || !origin || !destination) return undefined;

        const id = setInterval(() => {
            if (
                movedEnough(origin, lastFetchRef.current.origin) ||
                movedEnough(destination, lastFetchRef.current.destination)
            ) {
                loadRoutes();
            }
        }, 180_000);

        return () => clearInterval(id);
    }, [enabled, origin, destination, loadRoutes]);

    return {
        routes,
        selectedRouteIdx,
        setSelectedRouteIdx,
        loadingRoutes,
        routeError,
        loadRoutes
    };
}
