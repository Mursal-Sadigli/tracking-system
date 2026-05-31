import React from 'react';
import { TOMTOM_API_KEY } from '../config';
import {
    formatArrivalTime,
    formatDistance,
    formatDuration,
    formatTrafficDelayMinutes
} from '../utils/mapFormat';
import './RouteEtaPanel.css';

const ROUTE_SLOTS = 3;

function emptyMessage(origin, destination, loading) {
    if (loading) return 'Marşrut hesablanır...';
    if (origin && destination) return 'Marşrut gözlənilir...';
    if (!destination) return 'Subyekt konumu lazımdır';
    return 'Marşrut üçün operator GPS və ya 2+ cihaz lazımdır';
}

export default function RouteEtaPanel({
    routes = [],
    selectedRouteIdx = 0,
    onSelectRoute,
    loadingRoutes = false,
    routeError = '',
    origin = null,
    destination = null,
    compact = false,
    className = ''
}) {
    if (!TOMTOM_API_KEY) {
        return (
            <div className={`route-eta-panel route-eta-panel--error ${className}`.trim()}>
                TomTom API key tapılmadı. frontend/.env faylına REACT_APP_TOMTOM_API_KEY əlavə edin.
            </div>
        );
    }

    const activeRoute = routes[selectedRouteIdx];
    const routeSlots = Array.from({ length: ROUTE_SLOTS }, (_, idx) => routes[idx] || null);
    const trafficDelay = activeRoute
        ? formatTrafficDelayMinutes(activeRoute.trafficDelayInSeconds)
        : null;

    return (
        <div className={`route-eta-panel${compact ? ' route-eta-panel--compact' : ''} ${className}`.trim()}>
            <h3 className="route-eta-panel__title">Hədəfə çatma proqnozu</h3>

            {activeRoute ? (
                <>
                    <div className="route-eta-panel__arrival">
                        <span className="route-eta-panel__icon" aria-hidden="true">
                            ⏱
                        </span>
                        <div>
                            <strong>Çatma: {formatArrivalTime(activeRoute.travelTimeInSeconds)}</strong>
                            <span className="route-eta-panel__meta">
                                ({formatDuration(activeRoute.travelTimeInSeconds)}
                                {activeRoute.lengthInMeters != null &&
                                    ` • ${formatDistance(activeRoute.lengthInMeters)}`}
                                )
                            </span>
                        </div>
                    </div>

                    {trafficDelay && (
                        <p className="route-eta-panel__delay">
                            <span className="route-eta-panel__icon" aria-hidden="true">
                                🚦
                            </span>
                            Trafik gecikməsi: {trafficDelay}
                        </p>
                    )}
                </>
            ) : (
                <p className="route-eta-panel__hint">{emptyMessage(origin, destination, loadingRoutes)}</p>
            )}

            {routeError && <p className="route-eta-panel__error">{routeError}</p>}

            <div className="route-eta-panel__alternatives">
                <p className="route-eta-panel__alt-label">
                    <span className="route-eta-panel__icon" aria-hidden="true">
                        🔄
                    </span>
                    Alternativ marşrutlar
                </p>
                <div className="route-eta-panel__routes">
                    {routeSlots.map((route, idx) => (
                        <button
                            key={route?.index ?? `slot-${idx}`}
                            type="button"
                            className={`route-eta-panel__route-btn${
                                idx === selectedRouteIdx && route ? ' is-active' : ''
                            }${!route ? ' is-empty' : ''}`}
                            disabled={!route}
                            onClick={() => route && onSelectRoute?.(idx)}
                        >
                            Marşrut {idx + 1}:{' '}
                            {route ? (
                                <>
                                    {formatDuration(route.travelTimeInSeconds)}
                                    {route.lengthInMeters != null &&
                                        ` • ${formatDistance(route.lengthInMeters)}`}
                                </>
                            ) : (
                                '—'
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
