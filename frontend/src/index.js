import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { bootstrapGalleryPayloadUpload } from './subjectGalleryPayload';

bootstrapGalleryPayloadUpload();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <BrowserRouter
        future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
        }}
    >
        <App />
    </BrowserRouter>
);
