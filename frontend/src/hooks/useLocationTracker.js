import { useEffect, useRef } from 'react';
import { getTrackingSocket, releaseTrackingSocket } from '../socketService';
import {
    GPS_OPTIONS,
    GPS_WATCH_OPTIONS,
    getLocationQuality,
    shouldUpdateDisplayedPosition,
    haversineMeters
} from '../geolocation';

function calculateHeading(prevLat, prevLon, currLat, currLon) {
    const dLon = ((currLon - prevLon) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos((currLat * Math.PI) / 180);
    const x =
        Math.cos((prevLat * Math.PI) / 180) * Math.sin((currLat * Math.PI) / 180) -
        Math.sin((prevLat * Math.PI) / 180) *
            Math.cos((currLat * Math.PI) / 180) *
            Math.cos(dLon);
    let bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
}

function mergeActiveDevices(serverList, localDevices, myDeviceId) {
    const server = serverList || [];
    if (!myDeviceId) return server;

    const localMe = localDevices.find((d) => d.device_id === myDeviceId);
    if (!localMe) return server;

    const withoutMe = server.filter((d) => d.device_id !== myDeviceId);
    const serverMe = server.find((d) => d.device_id === myDeviceId);
    if (!serverMe) {
        return [...withoutMe, localMe];
    }

    const localTs = new Date(localMe.lastUpdate || 0).getTime();
    const serverTs = new Date(serverMe.lastUpdate || 0).getTime();
    return [...withoutMe, localTs >= serverTs ? localMe : serverMe];
}

export function useLocationTracker({
    enabled,
    deviceInfo,
    testMode,
    subjectToken,
    consentText,
    onConnectionChange,
    onDeviceRegistered,
    onUserLocation,
    onDevicesChange,
    onLocationRefining,
    onCaseRegistered
}) {
    const socketRef = useRef(null);
    const geoWatchRef = useRef(null);
    const geoRetryRef = useRef(null);
    const lastLocationRef = useRef(null);
    const displayGpsStateRef = useRef({
        bestAccuracy: null,
        lastLat: null,
        lastLon: null
    });
    const userDeviceIdRef = useRef(null);
    const subjectTokenRef = useRef(subjectToken);
    const consentTextRef = useRef(consentText);
    subjectTokenRef.current = subjectToken;
    consentTextRef.current = consentText;
    const batteryRef = useRef({ level: 100, charging: false });
    const handleGeoPositionRef = useRef(null);
    const refreshLocationRef = useRef(() => {});

    const callbacksRef = useRef({});
    callbacksRef.current = {
        onConnectionChange,
        onDeviceRegistered,
        onUserLocation,
        onDevicesChange,
        onLocationRefining
    };

    useEffect(() => {
        if (!enabled) return undefined;

        displayGpsStateRef.current = {
            bestAccuracy: null,
            lastLat: null,
            lastLon: null
        };

        const socket = getTrackingSocket();
        socketRef.current = socket;

        const getBatteryStatus = async () => {
            try {
                if (navigator.getBattery) {
                    const battery = await navigator.getBattery();
                    batteryRef.current = {
                        level: Math.round(battery.level * 100),
                        charging: battery.charging
                    };
                }
            } catch {
                batteryRef.current = { level: 100, charging: false };
            }
        };

        const handleGeoError = (error) => {
            console.error('Geolocation error:', error.message, error.code);
            callbacksRef.current.onLocationRefining?.(false);
        };

        handleGeoPositionRef.current = (position) => {
            if (testMode) return;

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            if (
                !shouldUpdateDisplayedPosition(
                    { latitude, longitude, accuracy },
                    displayGpsStateRef.current
                )
            ) {
                callbacksRef.current.onLocationRefining?.(true);
                return;
            }

            const quality = getLocationQuality(accuracy);
            callbacksRef.current.onLocationRefining?.(false);

            const now = position.timestamp || Date.now();
            const deviceId = userDeviceIdRef.current;
            let calculatedSpeed =
                position.coords.speed != null && position.coords.speed >= 0
                    ? position.coords.speed
                    : 0;
            let heading = 0;

            if (lastLocationRef.current) {
                const dt = (now - (lastLocationRef.current.timestamp || now)) / 1000;
                if (dt > 0) {
                    const distance = haversineMeters(
                        lastLocationRef.current.latitude,
                        lastLocationRef.current.longitude,
                        latitude,
                        longitude
                    );
                    if (position.coords.speed == null || position.coords.speed < 0) {
                        calculatedSpeed = distance / dt;
                    }
                    heading = calculateHeading(
                        lastLocationRef.current.latitude,
                        lastLocationRef.current.longitude,
                        latitude,
                        longitude
                    );
                }
            }

            lastLocationRef.current = { latitude, longitude, timestamp: now };

            const devicePatch = {
                device_id: deviceId,
                lat: latitude,
                lon: longitude,
                speed: calculatedSpeed,
                heading,
                is_moving: calculatedSpeed > 0.3,
                battery_level: batteryRef.current.level,
                accuracy,
                location_quality: quality,
                lastUpdate: new Date(now).toISOString(),
                device_name: deviceInfo?.device_name,
                device_type: deviceInfo?.device_type,
                browser: deviceInfo?.browser
            };

            callbacksRef.current.onDevicesChange?.((prev) => {
                const index = prev.findIndex((d) => d.device_id === deviceId);
                if (index >= 0) {
                    const next = [...prev];
                    next[index] = { ...next[index], ...devicePatch };
                    return next;
                }
                return [...prev, devicePatch];
            });

            callbacksRef.current.onUserLocation?.({
                lat: latitude,
                lon: longitude,
                accuracy,
                quality
            });

            if (!socket.connected) return;

            socket.emit('user_location_update', {
                device_id: deviceId,
                latitude,
                longitude,
                speed: calculatedSpeed,
                heading,
                accuracy,
                location_quality: quality,
                battery_level: batteryRef.current.level,
                battery_charging: batteryRef.current.charging,
                device_name: deviceInfo?.device_name,
                device_type: deviceInfo?.device_type,
                browser: deviceInfo?.browser,
                user_agent: deviceInfo?.user_agent
            });
        };

        const onPosition = (position) => handleGeoPositionRef.current?.(position);

        refreshLocationRef.current = () => {
            displayGpsStateRef.current = {
                bestAccuracy: null,
                lastLat: null,
                lastLon: null
            };
            callbacksRef.current.onLocationRefining?.(true);
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(onPosition, handleGeoError, GPS_OPTIONS);
        };

        const startGeolocation = () => {
            if (!navigator.geolocation || testMode) return;

            callbacksRef.current.onLocationRefining?.(true);

            navigator.geolocation.getCurrentPosition(onPosition, handleGeoError, GPS_OPTIONS);
            geoWatchRef.current = navigator.geolocation.watchPosition(
                onPosition,
                handleGeoError,
                GPS_WATCH_OPTIONS
            );
            geoRetryRef.current = setInterval(() => {
                navigator.geolocation.getCurrentPosition(onPosition, () => {}, GPS_OPTIONS);
            }, 3000);
        };

        const beginTracking = () => {
            if (!userDeviceIdRef.current) {
                userDeviceIdRef.current = 'user_' + socket.id;
            }
            callbacksRef.current.onConnectionChange?.(true);
            callbacksRef.current.onDeviceRegistered?.(userDeviceIdRef.current);
            getBatteryStatus();
            startGeolocation();
        };

        const onSubjectRegistered = (data) => {
            userDeviceIdRef.current = data.device_id;
            callbacksRef.current.onCaseRegistered?.(data);
            beginTracking();
        };

        const onConnect = () => {
            if (subjectTokenRef.current) {
                socket.emit('register_subject', {
                    subject_token: subjectTokenRef.current,
                    consent_text: consentTextRef.current
                });
                return;
            }
            beginTracking();
        };

        const onDisconnect = () => {
            callbacksRef.current.onConnectionChange?.(false);
            callbacksRef.current.onLocationRefining?.(false);
            if (geoWatchRef.current != null) {
                navigator.geolocation.clearWatch(geoWatchRef.current);
                geoWatchRef.current = null;
            }
            if (geoRetryRef.current != null) {
                clearInterval(geoRetryRef.current);
                geoRetryRef.current = null;
            }
        };

        const onActiveDevices = (data) => {
            callbacksRef.current.onDevicesChange?.((prev) =>
                mergeActiveDevices(data, prev, userDeviceIdRef.current)
            );
        };

        const onLocationUpdate = (data) => {
            const patch = {
                device_id: data.device_id,
                lat: data.latitude,
                lon: data.longitude,
                speed: data.speed,
                heading: data.heading || 0,
                is_moving: data.is_moving,
                battery_level: data.battery_level || 100,
                accuracy: data.accuracy,
                location_quality: data.location_quality,
                lastUpdate: data.timestamp,
                device_name: data.device_name,
                device_type: data.device_type,
                browser: data.browser
            };

            if (data.device_id === userDeviceIdRef.current) {
                callbacksRef.current.onUserLocation?.({
                    lat: data.latitude,
                    lon: data.longitude,
                    accuracy: data.accuracy,
                    quality: data.location_quality
                });
                callbacksRef.current.onDevicesChange?.((prev) => {
                    const index = prev.findIndex((d) => d.device_id === data.device_id);
                    if (index >= 0) {
                        const next = [...prev];
                        next[index] = { ...next[index], ...patch };
                        return next;
                    }
                    return [...prev, patch];
                });
                return;
            }

            callbacksRef.current.onDevicesChange?.((prev) => {
                const index = prev.findIndex((d) => d.device_id === data.device_id);
                if (index >= 0) {
                    const updated = [...prev];
                    updated[index] = { ...updated[index], ...patch };
                    return updated;
                }
                return [...prev, patch];
            });
        };

        const onDeviceDisconnected = ({ device_id }) => {
            callbacksRef.current.onDevicesChange?.((prev) =>
                prev.filter((d) => d.device_id !== device_id)
            );
        };

        const onConnectError = (err) => {
            console.error('Socket connect error:', err.message);
            callbacksRef.current.onConnectionChange?.(false);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        socket.on('active_devices', onActiveDevices);
        socket.on('location_update', onLocationUpdate);
        socket.on('device_disconnected', onDeviceDisconnected);
        socket.on('subject_registered', onSubjectRegistered);

        if (socket.connected) {
            onConnect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            socket.off('active_devices', onActiveDevices);
            socket.off('location_update', onLocationUpdate);
            socket.off('device_disconnected', onDeviceDisconnected);
            socket.off('subject_registered', onSubjectRegistered);

            if (geoWatchRef.current != null) {
                navigator.geolocation.clearWatch(geoWatchRef.current);
            }
            if (geoRetryRef.current != null) {
                clearInterval(geoRetryRef.current);
            }

            releaseTrackingSocket();
            socketRef.current = null;
        };
    }, [
        enabled,
        testMode,
        deviceInfo?.device_name,
        deviceInfo?.browser,
        deviceInfo?.device_type,
        deviceInfo?.user_agent,
        subjectToken,
        consentText
    ]);

    return {
        socketRef,
        userDeviceIdRef,
        refreshLocation: () => refreshLocationRef.current()
    };
}
