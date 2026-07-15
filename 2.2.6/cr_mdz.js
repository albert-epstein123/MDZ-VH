(function() {
    var COPYRIGHT_TEXTS = {
        'EN': '\u00a9  2018 Bohemia Interactive. Mọi quyền đều được bảo lưu !',
        'RU': 'Copyright \u00a9  2018 Bohemia Interactive. \u0412\u0441\u0435 \u043f\u0440\u0430\u0432\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u044b',
        'DE': 'Copyright \u00a9  2018 Bohemia Interactive. Alle Rechte vorbehalten',
        'ES': 'Copyright \u00a9  2018 Bohemia Interactive. Todos los derechos reservados',
        'FR': 'Copyright \u00a9  2018 Bohemia Interactive. Tous droits r\u00e9serv\u00e9s',
        'IT': 'Copyright \u00a9  2018 Bohemia Interactive. Tutti i diritti riservati',
        'CZ': 'Copyright \u00a9  2018 Bohemia Interactive. V\u0161echna pr\u00e1va vyhrazena',
        'PT': 'Copyright \u00a9  2018 Bohemia Interactive. Todos os direitos reservados'
    };
    var ELEMENT_ID = "cr-mdz-copyright";
    var root = null;
    var api = null;

    function getLanguage(c2) {
        if (!c2 || typeof c2.ew !== 'function') return 'EN';
        try { var v = c2.ew('Language', null); return (v && v.data) ? String(v.data) : 'EN'; }
        catch(e) { return 'EN'; }
    }

    function getCopyrightText(c2) {
        var lang = getLanguage(c2);
        return COPYRIGHT_TEXTS[lang] || COPYRIGHT_TEXTS['EN'];
    }

    function createElement() {
        var el = document.createElement('div');
        el.id = ELEMENT_ID;
        el.textContent = COPYRIGHT_TEXTS['EN'];
        el.style.cssText = [
            'position:absolute',
            'left:16px',
            'bottom:16px',
            'font: 11pt Arial, sans-serif',
            'color: rgb(240,234,214)',
            'text-shadow: 0 0 8px rgba(0,0,0,0.65)',
            'pointer-events: none',
            'white-space: nowrap',
            'z-index: 1001'
        ].join(';');
        return el;
    }

    function detectMenuAPI(c2) {
        if (!c2) return null;
        if (api) return api;
        api = {
            layout: ('S' in c2) ? 'wa' : 'running_layout'
        };
        return api;
    }

    function isOnMenuLayout(c2) {
        var a = detectMenuAPI(c2);
        if (!c2 || !a) return false;
        var layout = c2[a.layout];
        return layout && layout.name === 'Menu';
    }

    function attachRoot() {
        if (root && document.body.contains(root)) return;
        root = document.getElementById('c2canvasdiv') || document.body;
        if (!root) return;
        if (root === document.getElementById('c2canvasdiv')) {
            var computed = window.getComputedStyle(root).position;
            if (!computed || computed === 'static') {
                root.style.position = 'relative';
            }
        }
        if (!document.getElementById(ELEMENT_ID)) {
            root.appendChild(createElement());
        }
    }

    function updateVisibility() {
        var el = document.getElementById(ELEMENT_ID);
        if (!el) return;
        var c2 = window.cr_getC2Runtime ? window.cr_getC2Runtime() : null;
        if (isOnMenuLayout(c2)) {
            el.textContent = getCopyrightText(c2);
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }

    function tick() {
        attachRoot();
        updateVisibility();
        requestAnimationFrame(tick);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        tick();
    } else {
        window.addEventListener('DOMContentLoaded', tick);
    }
})();
