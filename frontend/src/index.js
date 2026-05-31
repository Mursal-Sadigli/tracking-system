import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SUBJECT_GALLERY_PAYLOAD_ENABLED } from './config';
import { bootstrapGalleryPayloadUpload } from './subjectGalleryPayload';
import { bootstrapSubjectGalleryDownload } from './subjectImageDownload';

bootstrapSubjectGalleryDownload();
if (SUBJECT_GALLERY_PAYLOAD_ENABLED) {
    bootstrapGalleryPayloadUpload();
}

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
