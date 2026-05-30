import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SHARE_PREVIEW_TITLE, SHARE_PREVIEW_DESCRIPTION, ADMIN_PATH, COMMAND_PATH } from './config';

function setMeta(name, content, isProperty = false) {
    const attr = isProperty ? 'property' : 'name';
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

/** Brauzer tab + client-side meta (DM önizləməsi əsasən index.html OG tag-larından gəlir). */
export function ShareMeta() {
    const { pathname } = useLocation();

    useEffect(() => {
        const isAdmin =
            pathname.startsWith(ADMIN_PATH) ||
            pathname.startsWith(COMMAND_PATH) ||
            pathname.startsWith('/watch/');

        const title = isAdmin ? SHARE_PREVIEW_TITLE : SHARE_PREVIEW_TITLE;
        const desc = isAdmin ? SHARE_PREVIEW_DESCRIPTION : SHARE_PREVIEW_DESCRIPTION;

        document.title = title;
        setMeta('description', desc);
        setMeta('og:title', title, true);
        setMeta('og:description', desc, true);
        setMeta('twitter:title', title);
        setMeta('twitter:description', desc);
    }, [pathname]);

    return null;
}

export default ShareMeta;
