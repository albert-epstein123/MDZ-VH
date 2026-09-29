/**
 * perf_mdz.js — MDZ Real-Time Performance Monitor
 * Hooks window.requestAnimationFrame + window.setInterval so every
 * named callback is timed and shown with avg/peak ms + HOT/LEAK warnings.
 */
(function () {

    // ── 1. Capture originals FIRST (before any re-registration) ──────────────────
    var _raf = window.requestAnimationFrame.bind(window);
    var _si  = window.setInterval.bind(window);
    var _now = performance.now.bind(performance);

    // ── 2. rAF Hook ──────────────────────────────────────────────────────────────
    var rafProfiles = {};

    // Extract the script filename from a stack trace string
    function sourceFromStack(stack) {
        if (!stack) return '';
        // Look for the first line that references a .js file that isn't perf_mdz
        var lines = stack.split('\n');
        for (var li = 1; li < lines.length; li++) {
            var m = lines[li].match(/([\w._-]+\.js)/);
            if (m && m[1] !== 'perf_mdz.js') return m[1];
        }
        return '';
    }

    window.requestAnimationFrame = function (cb) {
        var key = (cb && cb.name) ? cb.name : 'anonymous';
        // Capture source file at registration time
        var src = '';
        try { src = sourceFromStack(new Error().stack); } catch (e) {}
        return _raf(function (ts) {
            var t0 = _now();
            try { cb(ts); } catch (e) {}
            var dt = _now() - t0;
            var p = rafProfiles[key];
            if (!p) {
                p = rafProfiles[key] = { avg: dt, peak: dt, last: dt, n: 1, src: src };
            } else {
                p.avg  = p.avg * 0.9 + dt * 0.1;   // EMA α=0.1
                p.last = dt;
                p.n++;
                if (dt > p.peak) p.peak = dt;
                if (!p.src && src) p.src = src;
            }
        });
    };

    // ── 3. setInterval Hook ──────────────────────────────────────────────────────
    var siProfiles = {};
    var siCounter  = 0;

    window.setInterval = function (cb, delay) {
        var key = ((cb && cb.name) ? cb.name : ('interval_' + (++siCounter))) +
                  '@' + ((delay | 0) || 0) + 'ms';
        var args = Array.prototype.slice.call(arguments, 2);
        return _si(function () {
            var t0 = _now();
            try { cb.apply(undefined, args); } catch (e) {}
            var dt = _now() - t0;
            var p = siProfiles[key];
            if (!p) {
                p = siProfiles[key] = { avg: dt, peak: dt, last: dt, n: 1 };
            } else {
                p.avg  = p.avg * 0.9 + dt * 0.1;
                p.last = dt;
                p.n++;
                if (dt > p.peak) p.peak = dt;
            }
        }, delay);
    };

    // ── 4. Long-Task Observer ────────────────────────────────────────────────────
    var longTasks = [];
    try {
        if ('PerformanceObserver' in window) {
            new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (e) {
                    longTasks.push(e.duration);
                    if (longTasks.length > 8) longTasks.shift();
                });
            }).observe({ type: 'longtask', buffered: true });
        }
    } catch (e) {}

    // ── 5. Heap trend (2 s sample via original setInterval) ──────────────────────
    var heapSamples = [];
    _si(function () {
        if (performance.memory) {
            heapSamples.push(performance.memory.usedJSHeapSize);
            if (heapSamples.length > 12) heapSamples.shift();
        }
    }, 2000);

    function heapTrend() {
        var n = heapSamples.length;
        if (n < 4) return { txt: 'sampling…', col: '#888' };
        var deltaMB = (heapSamples[n - 1] - heapSamples[0]) / 1048576;
        var rising  = true;
        for (var i = 1; i < n; i++) {
            if (heapSamples[i] < heapSamples[i - 1] * 0.97) { rising = false; break; }
        }
        var sign = deltaMB >= 0 ? '+' : '';
        if (rising && deltaMB > 5)   return { txt: '▲ LEAK? '   + sign + deltaMB.toFixed(1) + ' MB', col: '#ff4444' };
        if (rising && deltaMB > 1.5) return { txt: '▲ growing ' + sign + deltaMB.toFixed(1) + ' MB', col: '#ffcc44' };
        return { txt: 'stable ' + sign + deltaMB.toFixed(1) + ' MB', col: '#55cc88' };
    }

    // ── 6. DOM node count (1 s sample) ───────────────────────────────────────────
    var domCount = 0, domDelta = 0, prevDom = 0;
    _si(function () {
        var c = document.querySelectorAll('*').length;
        domDelta = c - prevDom;
        prevDom  = c;
        domCount = c;
    }, 1000);

    // ── 7. FPS state ─────────────────────────────────────────────────────────────
    var fps     = 0;
    var frameMs = 0;
    var fpsRing = [];
    var fpsIdx  = 0;
    var prevTs  = _now();
    for (var fi = 0; fi < 60; fi++) fpsRing.push(60);

    // ── 8. Panel ─────────────────────────────────────────────────────────────────
    var panel, contentEl;
    var PANEL_ID = 'mdz-perf-panel';

    function buildPanel() {
        var el = document.createElement('div');
        el.id = PANEL_ID;
        el.style.cssText = [
            'position:fixed', 'top:10px', 'left:10px', 'z-index:2147483647',
            'background:rgba(3,7,18,0.93)',
            'border:1px solid rgba(0,220,180,0.22)',
            'border-radius:6px',
            'padding:8px 11px 10px',
            'font:11px/1.5 "Consolas","Courier New",monospace',
            'color:#c4e8df',
            'pointer-events:none',
            'user-select:none',
            'min-width:270px',
            'max-width:330px',
            'box-shadow:0 2px 22px rgba(0,0,0,0.8)'
        ].join(';');

        var hdr = document.createElement('div');
        hdr.textContent = 'MDZ PERF MONITOR';
        hdr.style.cssText = 'color:#00ffc8;font-weight:bold;font-size:10px;letter-spacing:1.5px;' +
                            'margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid rgba(0,255,200,0.18)';
        el.appendChild(hdr);

        var c = document.createElement('div');
        el.appendChild(c);
        document.body.appendChild(el);
        return { panel: el, content: c };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────
    function msCol(ms) {
        return ms < 4 ? '#55e888' : ms < 10 ? '#ffcc44' : '#ff5555';
    }

    function secHdr(title) {
        return '<div style="border-top:1px solid rgba(0,255,200,0.13);padding-top:4px;' +
               'margin:5px 0 3px;color:#00ffc8;font-size:9.5px;letter-spacing:.8px">' + title + '</div>';
    }

    // ── Render ────────────────────────────────────────────────────────────────────
    function renderContent() {
        if (!contentEl) return;
        var lines = [];

        // FPS
        var fpsCol = fps >= 55 ? '#55ff88' : fps >= 30 ? '#ffcc44' : '#ff4444';
        lines.push(
            '<div style="display:flex;align-items:baseline;gap:14px;margin-bottom:4px">' +
            'FPS <span style="color:' + fpsCol + ';font-size:16px;font-weight:bold">' + fps + '</span>' +
            ' <span style="color:#6a9">frame</span> <span style="color:#bbb">' + frameMs.toFixed(1) + 'ms</span>' +
            '</div>'
        );

        // RAM + trend
        var mem = performance.memory;
        if (mem) {
            var usedMB = (mem.usedJSHeapSize  / 1048576).toFixed(1);
            var limMB  = (mem.jsHeapSizeLimit / 1048576).toFixed(0);
            var pct    = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
            var ramCol = pct > 0.75 ? '#ff4444' : pct > 0.5 ? '#ffcc44' : '#55cc88';
            var filled = Math.round(pct * 20);
            var bar    = '<span style="color:' + ramCol + '">' + '█'.repeat(Math.max(0, filled)) + '</span>' +
                         '<span style="color:#1a2e2a">' + '░'.repeat(Math.max(0, 20 - filled)) + '</span>';
            var tr     = heapTrend();
            lines.push(
                '<div style="margin-bottom:1px">' +
                '<span style="color:#6a9">Heap</span> ' +
                '<span style="color:' + ramCol + '">' + usedMB + ' MB</span>' +
                '<span style="color:#445"> / </span><span style="color:#778">' + limMB + ' MB</span>' +
                ' <span style="color:' + tr.col + ';font-size:10px">' + tr.txt + '</span>' +
                '</div>'
            );
            lines.push('<div style="font-size:10px;letter-spacing:-0.5px;margin-bottom:4px">' + bar + '</div>');
        } else {
            lines.push('<div style="color:#555;font-size:10px;margin-bottom:4px">RAM API needs Chrome/WebView</div>');
        }

        // DOM
        var dcol = domDelta > 5 ? '#ff4444' : domDelta > 0 ? '#ffcc44' : '#55cc88';
        lines.push(
            '<div><span style="color:#6a9">DOM</span> <span style="color:#ccc">' + domCount + ' nodes</span>' +
            (domDelta !== 0
                ? ' <span style="color:' + dcol + ';font-size:10px">' + (domDelta > 0 ? '+' : '') + domDelta + '/s</span>'
                : '') +
            '</div>'
        );

        // rAF callbacks
        lines.push(secHdr('RAF LOOPS  avg / peak'));
        var rkeys = Object.keys(rafProfiles);
        if (rkeys.length === 0) {
            lines.push('<div style="color:#445;font-size:10px">hooking… (1 frame delay)</div>');
        } else {
            rkeys.sort(function (a, b) { return rafProfiles[b].avg - rafProfiles[a].avg; });
            for (var i = 0; i < rkeys.length; i++) {
                var k  = rkeys[i];
                var p  = rafProfiles[k];
                var ac = msCol(p.avg);
                var hot  = p.avg  > 8    ? ' <span style="color:#ff9944">HOT</span>'                              : '';
                var warn = p.peak > 16.7 ? ' <span style="color:#ff4444">⚠ peak ' + p.peak.toFixed(1) + 'ms</span>' : '';
                var srcTag = p.src ? ' <span style="color:#446655;font-size:9px">[' + p.src + ']</span>' : '';
                lines.push(
                    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1px">' +
                    '<span style="color:#7899aa;font-size:10px">' + k + '()' + srcTag + '</span>' +
                    '<span style="font-size:10px"><span style="color:' + ac + '">' + p.avg.toFixed(2) + 'ms</span>' + hot + warn + '</span>' +
                    '</div>'
                );
            }
        }

        // setInterval callbacks
        var skeys = Object.keys(siProfiles);
        if (skeys.length > 0) {
            lines.push(secHdr('INTERVALS  avg / peak'));
            skeys.sort(function (a, b) { return siProfiles[b].avg - siProfiles[a].avg; });
            for (var j = 0; j < skeys.length; j++) {
                var sk = skeys[j];
                var sp = siProfiles[sk];
                var sc = msCol(sp.avg);
                var sw = sp.peak > 16 ? ' <span style="color:#ff4444">⚠ ' + sp.peak.toFixed(1) + 'ms</span>' : '';
                lines.push(
                    '<div style="display:flex;justify-content:space-between;margin-bottom:1px">' +
                    '<span style="color:#7899aa;font-size:10px">' + sk + '</span>' +
                    '<span style="color:' + sc + ';font-size:10px">' + sp.avg.toFixed(2) + 'ms' + sw + '</span>' +
                    '</div>'
                );
            }
        }

        // Long tasks
        if (longTasks.length > 0) {
            lines.push(
                '<div style="border-top:1px solid rgba(255,80,60,0.3);padding-top:4px;' +
                'margin:5px 0 3px;color:#ff6644;font-size:9.5px;letter-spacing:.8px">LONG TASKS (&gt;50ms)</div>'
            );
            var recent = longTasks.slice(-4);
            for (var lt = 0; lt < recent.length; lt++) {
                lines.push('<div style="color:#ff7744;font-size:10px;margin-bottom:1px">⚠ blocked ' + recent[lt].toFixed(0) + 'ms</div>');
            }
        }

        contentEl.innerHTML = lines.join('');
    }

    // ── Tick (uses _raf directly — not self-profiled) ─────────────────────────────
    function tick(ts) {
        var dt = ts - prevTs;
        prevTs  = ts;
        frameMs = dt;
        if (dt > 0) {
            fpsRing[fpsIdx % 60] = 1000 / dt;
            fpsIdx++;
        }
        var s = 0;
        for (var i = 0; i < 60; i++) s += fpsRing[i];
        fps = Math.round(s / 60);

        renderContent();
        _raf(tick);
    }

    // ── Init ─────────────────────────────────────────────────────────────────────
    function init() {
        var built = buildPanel();
        panel     = built.panel;
        contentEl = built.content;
        _raf(tick);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
console.log("perf_mdz.js is loaded");
})();
