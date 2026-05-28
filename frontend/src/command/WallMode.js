import React, { useState, useEffect } from 'react';
import CommandDesk from './CommandDesk';
import './WallMode.css';

function WallMode() {
    const [carouselIndex, setCarouselIndex] = useState(0);

    useEffect(() => {
        const t = setInterval(() => setCarouselIndex((i) => i + 1), 30000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="wall-mode">
            <header className="wall-mode__header">
                <h1>Əməliyyat mərkəzi — Divar rejimi</h1>
                <span className="wall-mode__clock">{new Date().toLocaleString('az-AZ')}</span>
            </header>
            <CommandDesk wallMode key={carouselIndex} />
        </div>
    );
}

export default WallMode;
