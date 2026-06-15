// ZOOM SCRIPT
// Made by civert0
// FB: https://www.facebook.com/darren276/

(function() {
    "use strict";

    var currentZOOM = parseFloat(localStorage.getItem('mdz_saved_zoom')) || 1.0;
    var MIN_ZOOM = 0.5;
    var MAX_ZOOM = 5.2;
    var STEP = 0.1;

    // ==========================================
    // OBFUSCATION KEY MAP (matches chest_gl.js)
    // ==========================================
    var K = null;
    function detectAPI(c2) {
        if (K) return;
        var obf = ('S' in c2);
        K = {
            types:     obf ? 'S'  : 'types_by_index',
            insts:     obf ? 'q'  : 'instances',
            layout:    obf ? 'wa' : 'running_layout',
            layouts:   obf ? 'Fs' : 'layouts',
            redraw:    obf ? 'X'  : 'redraw',
            drawGL:    obf ? 'nb' : 'drawGL',
            loadTex:   obf ? 'fd' : 'loadTexture',
            setTex:    obf ? 'wc' : 'setTexture',
            setOpacity:obf ? 'Oe' : 'setOpacity',
            quad:      obf ? 'dk' : 'quad',
            gl:        obf ? 'T'  : 'gl',
            endBatch:  obf ? 'ld' : 'endBatch',
            resetMV:   obf ? 'ke' : 'resetModelView',
            updateMV:  obf ? 'Wd' : 'updateModelView'
        };
    }

    // ==========================================
    // RUNTIME HELPERS
    // ==========================================
    function getRT() {
        var c2 = window.cr_getC2Runtime ? window.cr_getC2Runtime() : null;
        if (c2 && !K) detectAPI(c2);
        return c2;
    }

    function getGlobalVar(c2, name) {
        if (!c2 || !c2.ew) return undefined;
        var v = c2.ew(name, null);
        return v ? v.data : undefined;
    }

    function getTypeInsts(c2, typeName) {
        if (!c2 || !c2[K.types]) return [];
        var types = c2[K.types];
        for (var i = 0; i < types.length; i++) {
            if (types[i].name === typeName) return types[i][K.insts] || [];
        }
        return [];
    }

    function isPlayerActive(c2) {
        var pArray = getTypeInsts(c2, "t181");
        if (c2.jg) pArray = pArray.filter(function(p) { return p && c2.jg[p.uid.toString()]; });
        return pArray.length > 0;
    }

    function getPlayerInstance(c2) {
        var fallback = function() {
            var arr = getTypeInsts(c2, "t181");
            return arr.length ? arr[0] : null;
        };
        if (window.MDZ && typeof window.MDZ.getPlayerInstance === 'function') {
            try {
                var inst = window.MDZ.getPlayerInstance();
                if (inst && inst.layer && inst.layer.layout && inst.layer.layout.name === 'Map') return inst;
            } catch(e) {}
        }
        return fallback();
    }

    function isOnLayout(c2, name) {
        return c2 && c2[K.layout] && c2[K.layouts] && c2[K.layouts][name] && c2[K.layout] === c2[K.layouts][name];
    }

    function isInGame(c2) {
        if (!isOnLayout(c2, "Map")) return false;
        var player = getPlayerInstance(c2);
        if (!player) return false;
        if (player.layer && player.layer.layout) return player.layer.layout === c2[K.layouts].Map;
        return true;
    }

    function isStickEditMode(c2) {
        if (!isOnLayout(c2, "Menu")) return false;
        var ms = getGlobalVar(c2, "menu_section");
        return (typeof ms === "string" && ms.toLowerCase() === "stick");
    }
    // ==========================================
    // removed for convinience            getGlobalVar(c2, "notebook_mode") === 1 ||             getGlobalVar(c2, "helpmenu_on") === 1 ||
    // ==========================================
    function isAnyUIOpen(c2) {
        return (
            getGlobalVar(c2, "Inventory_opened") === 1 ||
            getGlobalVar(c2, "Pad_on") === 1 ||
            getGlobalVar(c2, "perkmenu_on") === 1 ||
            getGlobalVar(c2, "Building_mode") === 1 ||
            getGlobalVar(c2, "Action_menu_on") === 1
        );
    }

    // ==========================================
    // ZOOM BUTTON POSITION (screen ratios 0-1)
    // ==========================================
    var ZOOM_POS_KEY = 'mdz_zoom_btn_pos';
    var DEFAULT_POS_RX = 1775 / 1920;
    var DEFAULT_POS_RY = 175 / 1080;
    var defaultPos = { rx: DEFAULT_POS_RX, ry: DEFAULT_POS_RY };
    var zoomBtnPos = (function() {
        try {
            var s = JSON.parse(localStorage.getItem(ZOOM_POS_KEY));
            if (s && typeof s.rx === 'number') return s;
        } catch(e) {}
        return { rx: defaultPos.rx, ry: defaultPos.ry };
    })();
    function saveZoomPos() { localStorage.setItem(ZOOM_POS_KEY, JSON.stringify(zoomBtnPos)); }
    function resetZoomBtnPos() { zoomBtnPos = { rx: DEFAULT_POS_RX, ry: DEFAULT_POS_RY }; saveZoomPos(); }

    // Button size in canvas pixels (at 1024x768 design resolution).
    // Zoom icons are square; 66px matches the map button (t629) height.
    var BTN_SZ = 79, BTN_GAP = 18;

    // ==========================================
    // LAYER SCALING
    // ==========================================
    window.applyGameZoom = function(delta) {
        var rt = getRT();
        if (!rt) return;
        currentZOOM += delta;
        if (currentZOOM < MIN_ZOOM) currentZOOM = MIN_ZOOM;
        if (currentZOOM > MAX_ZOOM) currentZOOM = MAX_ZOOM;
        localStorage.setItem('mdz_saved_zoom', currentZOOM);
        try {
            if (rt.wj && rt.wj.autozoom) rt.wj.autozoom.ci = false;
            if (rt[K.layouts] && rt[K.layouts].Map && rt[K.layouts].Map.ua) {
                var layers = rt[K.layouts].Map.ua;
                for (var i = 0; i < 51; i++) {
                    if (layers[i]) layers[i].scale = currentZOOM;
                }
                rt[K.redraw] = true;
            }
        } catch(err) { console.error("[zoom]", err); }
    };

    // ==========================================
    // GL TEXTURE HELPERS
    // ==========================================
    var imgBank = {};
    var texBank = {};

    function getImg(src) {
        if (!imgBank[src]) { var img = new Image(); img.src = src; imgBank[src] = img; }
        return imgBank[src];
    }
    getImg("images/zoom_in-sheet0.png");
    getImg("images/zoom_out-sheet0.png");

    function getTexGL(glw, src) {
        if (texBank[src]) return texBank[src];
        var img = getImg(src);
        if (img && img.complete && img.naturalWidth > 0) {
            try {
                if (glw[K.loadTex]) { texBank[src] = glw[K.loadTex](img, false, false, false); }
                else {
                    var gl = glw[K.gl], tex = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                    texBank[src] = tex;
                }
            } catch(e) {}
        }
        return texBank[src] || null;
    }

    var _resetBtn = null;
    var _resetBtnVisible = false;
    var _orientBtn = null;
    var _orientBtnVisible = false;
    var ZOOM_ORIENT_KEY = 'mdz_zoom_btn_orient';
    var zoomBtnOrientation = (function() {
        try {
            var value = localStorage.getItem(ZOOM_ORIENT_KEY);
            if (value === 'horizontal' || value === 'vertical') return value;
        } catch (e) {}
        return 'vertical';
    })();

    function saveZoomOrientation() {
        try { localStorage.setItem(ZOOM_ORIENT_KEY, zoomBtnOrientation); } catch (e) {}
    }

    function updateOrientationButtonLabel() {
        if (!_orientBtn) return;
        var txt = _orientBtn.firstElementChild;
        if (txt) txt.textContent = zoomBtnOrientation === 'horizontal' ? 'NGANG' : 'DỌC';
    }

    function toggleZoomOrientation() {
        zoomBtnOrientation = zoomBtnOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        saveZoomOrientation();
        updateOrientationButtonLabel();
        var c2 = getRT(); if (c2) c2[K.redraw] = true;
    }

    function createOrientationButton() {
        if (_orientBtn) return _orientBtn;
        var btn = document.createElement('div');
        btn.id = 'mdz-zoom-orient-btn';
        btn.style.cssText =
            "position:fixed; display:none; pointer-events:auto; cursor:pointer; z-index:99998;" +
            "background:url('images/menu_btn_wood-sheet0.png') -1px -1px no-repeat;" +
            "width:160px; height:39px; image-rendering:pixelated; transform-origin:center center;";

        var btnText = document.createElement('div');
        btnText.style.cssText =
            "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);" +
            "color:#e8d8b0; font-family:Arial,sans-serif; font-size:11px; font-weight:bold;" +
            "text-shadow:1px 1px 1px rgba(0,0,0,0.7); pointer-events:none;" +
            "white-space:nowrap; letter-spacing:1px; text-transform:uppercase;";
        btnText.textContent = zoomBtnOrientation === 'horizontal' ? 'NGANG' : 'DỌC';
        btn.appendChild(btnText);

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleZoomOrientation();
        });

        btn.addEventListener('mouseenter', function() {
            btn.style.backgroundPosition = "-1px -165px";
        });
        btn.addEventListener('mouseleave', function() {
            btn.style.backgroundPosition = "-1px -1px";
        });

        document.body.appendChild(btn);
        _orientBtn = btn;
        return btn;
    }

    function hideOrientationButton() {
        if (_orientBtn && _orientBtnVisible) {
            _orientBtn.style.display = 'none';
            _orientBtnVisible = false;
        }
    }

    function createResetButton() {
        if (_resetBtn) return _resetBtn;
        var btn = document.createElement("div");
        btn.id = "mdz-zoom-reset-btn";
        btn.style.cssText =
            "position:fixed; display:none; pointer-events:auto; cursor:pointer; z-index:99998;" +
            "background:url('images/menu_btn_wood-sheet0.png') -1px -1px no-repeat;" +
            "width:174px; height:46px; image-rendering:pixelated; transform-origin:center center;";

        var btnText = document.createElement("div");
        btnText.style.cssText =
            "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);" +
            "color:#e8d8b0; font-family:Arial,sans-serif; font-size:11px; font-weight:bold;" +
            "text-shadow:1px 1px 1px rgba(0,0,0,0.7); pointer-events:none;" +
            "white-space:nowrap; letter-spacing:1px; text-transform:uppercase;";
        btnText.textContent = "RESET";
        btn.appendChild(btnText);

        btn.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            resetZoomBtnPos();
            zoomBtnOrientation = 'vertical';
            saveZoomOrientation();
            updateOrientationButtonLabel();
            _showResetBtn = false;
            if (_resetBtnTimeout) { clearTimeout(_resetBtnTimeout); _resetBtnTimeout = null; }
            var c2 = getRT(); if (c2) c2[K.redraw] = true;
        });

        btn.addEventListener("mouseenter", function() {
            btn.style.backgroundPosition = "-1px -165px";
        });
        btn.addEventListener("mouseleave", function() {
            btn.style.backgroundPosition = "-1px -1px";
        });

        document.body.appendChild(btn);
        _resetBtn = btn;
        return btn;
    }

    function hideResetButton() {
        if (_resetBtn && _resetBtnVisible) {
            _resetBtn.style.display = 'none';
            _resetBtnVisible = false;
        }
        hideOrientationButton();
    }

    function scheduleResetButton() {
        _showResetBtn = true;
        if (_resetBtnTimeout) { clearTimeout(_resetBtnTimeout); }
        _resetBtnTimeout = setTimeout(function() {
            _showResetBtn = false;
            _resetBtnTimeout = null;
        }, 5000);
    }

    function updateResetButton(c2) {
        var btn = createResetButton();
        if (!c2 || !c2.canvas) { hideResetButton(); return; }
        if (!(_isDragging || _showResetBtn)) { hideResetButton(); return; }
        if (!_inStickEdit) { hideResetButton(); return; }

        var rect = c2.canvas.getBoundingClientRect();
        var cw = c2.canvas.width, ch = c2.canvas.height;
        var sc = Math.min(cw / 1024, ch / 768);
        var sx = rect.width / cw;
        var sy = rect.height / ch;
        var sz = BTN_SZ * sc;
        var gap = BTN_GAP * sc;
        var cx = zoomBtnPos.rx * cw;
        var cy = zoomBtnPos.ry * ch;
        var oy = cy + sz + gap;

        var screenX = cx * sx + rect.left;
        var renderScale = sc * Math.min(sx, sy);
        var btnWidth = 160 * renderScale;
        var btnHeight = 39 * renderScale;
        var extraGap = 10 * renderScale;
        var minScreenX = rect.left + btnWidth / 2 + 8;
        var maxScreenX = rect.right - btnWidth / 2 - 8;
        var leftX = Math.min(Math.max(screenX, minScreenX), maxScreenX);

        var clusterTopY = cy * sy + rect.top - (sz * sy) / 2;
        var clusterBottomY = zoomBtnOrientation === 'horizontal'
            ? cy * sy + rect.top + (sz * sy) / 2
            : oy * sy + rect.top + (sz * sy) / 2;

        var orientationY = clusterBottomY + extraGap + btnHeight / 2;
        var resetY = orientationY + btnHeight + extraGap;

        // If the buttons would go below the canvas, move them above the zoom cluster.
        if (resetY + btnHeight / 2 > rect.bottom - 8) {
            resetY = clusterTopY - extraGap - btnHeight / 2;
            orientationY = resetY - btnHeight - extraGap;
        }

        // Keep buttons inside the canvas vertically if possible.
        var minY = rect.top + btnHeight / 2 + 8;
        if (orientationY - btnHeight / 2 < minY) {
            orientationY = minY;
            resetY = orientationY + btnHeight + extraGap;
        }

        // If reset button still would overflow, clamp it inside the canvas.
        var maxY = rect.bottom - btnHeight / 2 - 8;
        if (resetY > maxY) {
            resetY = maxY;
            orientationY = resetY - btnHeight - extraGap;
            if (orientationY < minY) orientationY = minY;
        }

        var orientBtn = createOrientationButton();
        orientBtn.style.display = 'block';
        orientBtn.style.left = leftX + 'px';
        orientBtn.style.top = orientationY + 'px';
        orientBtn.style.transform = 'translate(-50%,-50%) scale(' + renderScale + ')';
        _orientBtnVisible = true;

        btn.style.display = 'block';
        btn.style.left = leftX + 'px';
        btn.style.top = resetY + 'px';
        btn.style.transform = 'translate(-50%,-50%) scale(' + renderScale + ')';
        _resetBtnVisible = true;
    }

    var _cyanCanvas = document.createElement("canvas");
    _cyanCanvas.width = 1; _cyanCanvas.height = 1;
    var _cctx = _cyanCanvas.getContext("2d");
    _cctx.fillStyle = "#0ff"; _cctx.fillRect(0, 0, 1, 1);
    var _cyanTex = null;
    function getCyanTex(glw) {
        if (_cyanTex) return _cyanTex;
        try { if (glw[K.loadTex]) _cyanTex = glw[K.loadTex](_cyanCanvas, false, false, false); } catch(e) {}
        return _cyanTex;
    }

    // ==========================================
    // RENDER STATE
    // ==========================================
    var _showButtons = false;
    var _inStickEdit = false;
    var _pressedBtn = 0;     // 1 = zoom-in, -1 = zoom-out
    var _isDragging = false;
    var _showResetBtn = false;
    var _resetBtnTimeout = null;
    var _dragOffX = 0, _dragOffY = 0;
    var _zoomInterval = null;
    var HOLD_SPEED = 50;
    var _wasInGame = false;
    var _prevNeedLock = false;
    var _prevNvgActive = false;
    var _nvgStateDirty = true;
    var _prevLevel = null;
    var _prevLevelLoading = false;

    // Hit rects in canvas pixels, updated each draw frame
    var _hitInRect = null;   // { x1, y1, x2, y2 }
    var _hitOutRect = null;
    var _hitAllRect = null;  // combined area for drag

    // ==========================================
    // DRAW ZOOM BUTTONS (canvas-pixel coords)
    // MV is reset to translate(-cw/2,-ch/2) by
    // the hook, so (0,0)=top-left, (cw,ch)=bot-right.
    // We draw directly in canvas pixels — no
    // canvasToLayer needed.
    // ==========================================
    function drawZoomButtons(glw, c2, showEditBorder) {
        var cw = c2.canvas.width, ch = c2.canvas.height;
        var sc = Math.min(cw / 1024, ch / 768);
        var sz = BTN_SZ * sc;
        var gap = BTN_GAP * sc;
        var hGap = gap + 30* sc;

        // Position in canvas pixels
        var cx = zoomBtnPos.rx * cw;
        var cy = zoomBtnPos.ry * ch;

        // ── Zoom-in button (centered at cx, cy) ──
        var texIn = getTexGL(glw, "images/zoom_in-sheet0.png");
        if (texIn) {
            glw[K.setTex](texIn);
            glw[K.setOpacity](_pressedBtn === 1 ? 0.7 : 1);
            glw[K.quad](cx - sz/2, cy - sz/2, cx + sz/2, cy - sz/2,
                        cx + sz/2, cy + sz/2, cx - sz/2, cy + sz/2);
        }

        var oy;
        if (zoomBtnOrientation === 'horizontal') {
            oy = cy;
        } else {
            oy = cy + sz + gap;
        }

        // ── Zoom-out button ──
        var texOut = getTexGL(glw, "images/zoom_out-sheet0.png");
        if (texOut) {
            glw[K.setTex](texOut);
            glw[K.setOpacity](_pressedBtn === -1 ? 0.7 : 1);
            if (zoomBtnOrientation === 'horizontal') {
                glw[K.quad](cx + sz/2 + hGap - sz/2, cy - sz/2, cx + sz/2 + hGap + sz/2, cy - sz/2,
                            cx + sz/2 + hGap + sz/2, cy + sz/2, cx + sz/2 + hGap - sz/2, cy + sz/2);
            } else {
                glw[K.quad](cx - sz/2, oy - sz/2, cx + sz/2, oy - sz/2,
                            cx + sz/2, oy + sz/2, cx - sz/2, oy + sz/2);
            }
        }

        // ── Update hit rects (same canvas pixels) ──
        var hsz = sz / 2;
        if (zoomBtnOrientation === 'horizontal') {
            _hitInRect  = { x1: cx - hsz, y1: cy - hsz, x2: cx + hsz, y2: cy + hsz };
            _hitOutRect = { x1: cx + sz/2 + hGap - hsz, y1: cy - hsz, x2: cx + sz/2 + hGap + hsz, y2: cy + hsz };
            _hitAllRect = { x1: cx - hsz - 10 * sc, y1: cy - hsz - 10 * sc,
                            x2: cx + sz/2 + hGap + hsz + 10 * sc, y2: cy + hsz + 10 * sc };
        } else {
            _hitInRect  = { x1: cx - hsz, y1: cy - hsz, x2: cx + hsz, y2: cy + hsz };
            _hitOutRect = { x1: cx - hsz, y1: oy - hsz, x2: cx + hsz, y2: oy + hsz };
            _hitAllRect = { x1: cx - hsz - 10 * sc, y1: cy - hsz - 10 * sc,
                            x2: cx + hsz + 10 * sc, y2: oy + hsz + 10 * sc };
        }
    }

    // ==========================================
    // HOOK: Map layout → GUI layer (index 55)
    // Zoom buttons render as part of this layer,
    // at the exact same depth as map button,
    // inventory, reload, sleep, etc.
    // ==========================================
    var _mapGuiHooked = false;
    function hookMapGUI(c2) {
        if (_mapGuiHooked) return;
        var mapLayout = c2[K.layouts] && c2[K.layouts].Map;
        if (!mapLayout || !mapLayout.ua || !mapLayout.ua[55]) return;
        var guiLayer = mapLayout.ua[55];
        var origDraw = guiLayer[K.drawGL];
        if (typeof origDraw !== 'function') return;

        guiLayer[K.drawGL] = function(glw) {
            origDraw.call(this, glw);
            if (_showButtons) {
                var cw = c2.canvas.width, ch = c2.canvas.height;
                glw[K.endBatch](0);
                glw[K.resetMV]();
                glw.translate(-cw / 2, -ch / 2);
                glw[K.updateMV]();
                drawZoomButtons(glw, c2, false);
                glw[K.endBatch](0);
            }
        };
        _mapGuiHooked = true;
    }

    // ==========================================
    // HOOK: Menu layout → stick_controls layer (index 15)
    // Shows zoom buttons alongside other HUD buttons
    // in the Options → Stick Position config screen.
    // ==========================================
    var _menuStickHooked = false;
    function hookMenuStick(c2) {
        if (_menuStickHooked) return;
        var menuLayout = c2[K.layouts] && c2[K.layouts].Menu;
        if (!menuLayout || !menuLayout.ua || !menuLayout.ua[15]) return;
        var stickLayer = menuLayout.ua[15];
        var origDraw = stickLayer[K.drawGL];
        if (typeof origDraw !== 'function') return;

        stickLayer[K.drawGL] = function(glw) {
            origDraw.call(this, glw);
            if (_inStickEdit) {
                var cw = c2.canvas.width, ch = c2.canvas.height;
                glw[K.endBatch](0);
                glw[K.resetMV]();
                glw.translate(-cw / 2, -ch / 2);
                glw[K.updateMV]();
                drawZoomButtons(glw, c2, true);
                glw[K.endBatch](0);
            }
        };
        _menuStickHooked = true;
    }

    // ==========================================
    // CLICK / POINTER HANDLING
    // ==========================================
    function canvasCoords(e, c2) {
        var rect = c2.canvas.getBoundingClientRect();
        var touch = e.touches ? e.touches[0] : e;
        return {
            cx: (touch.clientX - rect.left) * (c2.canvas.width / rect.width),
            cy: (touch.clientY - rect.top) * (c2.canvas.height / rect.height)
        };
    }

    function hitRect(r, x, y) { return r && x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; }

    function startZoom(delta) {
        _pressedBtn = delta > 0 ? 1 : -1;
        window.applyGameZoom(delta);
        _zoomInterval = setInterval(function() { window.applyGameZoom(delta); }, HOLD_SPEED);
        var c2 = getRT(); if (c2) c2[K.redraw] = true;
    }


    function stopZoom() {
        _pressedBtn = 0;
        if (_zoomInterval) { clearInterval(_zoomInterval); _zoomInterval = null; }
        var c2 = getRT(); if (c2) c2[K.redraw] = true;
    }

    window.addEventListener("pointerdown", function(e) {
        var c2 = getRT();
        if (!c2 || !c2.canvas || !K) return;
        var coords = canvasCoords(e, c2);

        if (_inStickEdit) {
            if (hitRect(_hitAllRect, coords.cx, coords.cy)) {
                scheduleResetButton();
                _isDragging = true;
                var cw = c2.canvas.width, ch = c2.canvas.height;
                _dragOffX = coords.cx - zoomBtnPos.rx * cw;
                _dragOffY = coords.cy - zoomBtnPos.ry * ch;
                e.preventDefault(); e.stopPropagation();
            }
            return;
        }

        if (!_showButtons) return;
        if (hitRect(_hitInRect, coords.cx, coords.cy)) {
            startZoom(STEP);
            e.preventDefault(); e.stopPropagation();
        } else if (hitRect(_hitOutRect, coords.cx, coords.cy)) {
            startZoom(-STEP);
            e.preventDefault(); e.stopPropagation();
        }
    }, true);

    window.addEventListener("pointermove", function(e) {
        if (!_isDragging) return;
        var c2 = getRT();
        if (!c2 || !c2.canvas) return;
        var coords = canvasCoords(e, c2);
        var cw = c2.canvas.width, ch = c2.canvas.height;
        zoomBtnPos.rx = Math.max(0.03, Math.min(0.97, (coords.cx - _dragOffX) / cw));
        var sz = BTN_SZ * Math.min(cw / 1024, ch / 768);
        var gap = BTN_GAP * Math.min(cw / 1024, ch / 768);
        var maxRY;
        if (zoomBtnOrientation === 'horizontal') {
            maxRY = 1 - (sz / 2) / ch - 0.01;
        } else {
            maxRY = 1 - (1.5 * sz + gap) / ch - 0.01;
        }
        zoomBtnPos.ry = Math.max(0.03, Math.min(maxRY, (coords.cy - _dragOffY) / ch));
        c2[K.redraw] = true;
        e.preventDefault();
    }, true);

    window.addEventListener("pointerup", function(e) {
        if (_isDragging) {
            _isDragging = false; saveZoomPos();
            var c2 = getRT(); if (c2) c2[K.redraw] = true;
            return;
        }
        if (_pressedBtn !== 0) stopZoom();
    }, true);

    window.addEventListener("pointercancel", function() {
        if (_isDragging) { _isDragging = false; saveZoomPos(); }
        if (_pressedBtn !== 0) stopZoom();
    }, true);

    // ==========================================
    // MAIN LOOP: state + hooks
    // ==========================================
    var wasActive = false;
    var _prevStickPos = { x: null, y: null };

    function logicLoop() {
        var c2 = getRT();
        if (!c2 || !K) { requestAnimationFrame(logicLoop); return; }

        hookMapGUI(c2);
        hookMenuStick(c2);

        var inGame = isInGame(c2);
        var stickEdit = isStickEditMode(c2);

        _showButtons = inGame && !isAnyUIOpen(c2);
        _inStickEdit = stickEdit;

        var levelLoading = isLevelLoadingOrChanging(c2);
        var currentLevel = getGlobalVar(c2, 'CurrentLevel');

        if (!inGame && _wasInGame) {
            _nvgStateDirty = true;
            forceClearNvgState(c2);
            _prevLevel = null;
        }
        if (inGame && !_wasInGame) {
            _nvgStateDirty = true;
            forceClearNvgState(c2);
            clearStaleT707Instances(c2);
            window.applyGameZoom(0);
        }

        if (levelLoading && !_prevLevelLoading) {
            _nvgStateDirty = true;
            forceClearNvgState(c2);
            clearStaleT707Instances(c2);
        }

        if (typeof currentLevel === 'number' && currentLevel !== _prevLevel) {
            if (_prevLevel !== null) {
                _nvgStateDirty = true;
                forceClearNvgState(c2);
                clearStaleT707Instances(c2);
            }
            _prevLevel = currentLevel;
        }

        _prevLevelLoading = levelLoading;
        _wasInGame = inGame;

        var stickX = getGlobalVar(c2, 'stick_pos_X');
        var stickY = getGlobalVar(c2, 'stick_pos_Y');
        if (_inStickEdit && isStickResetPosition(c2, stickX, stickY) &&
            !isStickResetPosition(c2, _prevStickPos.x, _prevStickPos.y)) {
            resetZoomBtnPos();
        }
        _prevStickPos.x = stickX;
        _prevStickPos.y = stickY;

        updateResetButton(c2);
        if (_showButtons || _inStickEdit) c2[K.redraw] = true;

        requestAnimationFrame(logicLoop);
    }

    // ==========================================
    // OVERLAY SIZE OVERRIDE (perfect sync) for zoom < 1
    // Hard-locks width/height of fullscreen overlay instances
    // so they always cover the viewport when zoomed out.
    //
    // t240 (night)        – always lock when zoom < 1
    // t971 (color_effect) – always lock when zoom < 1
    // t707 (NVG)          – only lock when nvg_nj == 1 (goggles equipped)
    //                       undo lock when nvg_nj == 0 (fresh game / goggles off)
    // ==========================================

    // Overlay scaling: t240 (night), t971 (color_effect), t707 (NVG)
    // For each, set width/height = 15000 * currentZOOM when zoom < 1 (and for t707, only if NVG is on)
    // Reset to engine default when zoom >= 1 or NVG is off
    function findInstsByType(c2, names, layoutName) {
        var out = [];
        var filterLayout = typeof layoutName === 'string';
        function matchesLayout(inst) {
            if (!filterLayout || !inst || !inst.layer) return true;
            var layout = inst.layer.layout;
            return layout && layout.name === layoutName;
        }
        if (c2.jg) {
            Object.values(c2.jg).forEach(function(inst) {
                if (!inst || !matchesLayout(inst)) return;
                if (inst.type && names.indexOf(inst.type.name) !== -1) out.push(inst);
                else if (inst.layer && names.indexOf(inst.layer.name) !== -1) out.push(inst);
            });
        } else {
            var types = c2[K.types];
            for (var i = 0; i < types.length; i++) {
                if (names.indexOf(types[i].name) !== -1) {
                    var insts = types[i][K.insts] || [];
                    for (var j = 0; j < insts.length; j++) {
                        if (matchesLayout(insts[j])) out.push(insts[j]);
                    }
                }
            }
        }
        return out;
    }

    function hardLockOverlaySize(inst) {
        if (!inst._mdz_locked) {
            inst._mdz_orig_width = inst.width;
            inst._mdz_orig_height = inst.height;
            Object.defineProperty(inst, 'width', {
                get: function() { return 15000 * currentZOOM; },
                set: function() {},
                configurable: true
            });
            Object.defineProperty(inst, 'height', {
                get: function() { return 15000 * currentZOOM; },
                set: function() {},
                configurable: true
            });
            inst._mdz_locked = true;
        }
        if (typeof inst.set_bbox_changed === 'function') inst.set_bbox_changed();
    }

    function unlockOverlaySize(inst) {
        if (inst._mdz_locked) {
            delete inst.width;
            delete inst.height;
            if (inst._mdz_orig_width !== undefined) inst.width = inst._mdz_orig_width;
            if (inst._mdz_orig_height !== undefined) inst.height = inst._mdz_orig_height;
            inst._mdz_locked = false;
            if (typeof inst.set_bbox_changed === 'function') inst.set_bbox_changed();
        }
    }


    function getBoolGlobal(c2, name) {
        var value = getGlobalVar(c2, name);
        return value === 1 || value === true || value === '1' || value === 'true';
    }

    function isT707ActiveInstance(inst) {
        if (!inst) return false;
        if (inst.visible === false) return false;
        if (inst.layer && inst.layer.visible === false) return false;
        if (typeof inst.opacity === 'number' && inst.opacity <= 0.01) return false;
        if (typeof inst.layer !== 'undefined' && inst.layer && inst.layer.opacity === 0) return false;
        return true;
    }

    function isNvgActive(c2, inst) {
        if (!isInGame(c2)) return false;
        var t707insts = findInstsByType(c2, ['t707'], 'Map');
        var hasVisibleT707 = t707insts.some(isT707ActiveInstance);
        if (hasVisibleT707) return true;
        if (t707insts.length) return false;
        if (inst && isT707ActiveInstance(inst)) return true;
        return false;
    }

    function isLevelLoadingOrChanging(c2) {
        return getGlobalVar(c2, 'level_loading') === 1 || getGlobalVar(c2, 'levelchanging') === 1;
    }

    function clearStaleT707Instances(c2) {
        var t707insts = findInstsByType(c2, ['t707'], 'Map');
        if (!t707insts.length) return;
        var hasVisibleT707 = t707insts.some(isT707ActiveInstance);
        if (hasVisibleT707) return;
        t707insts.forEach(function(inst) {
            unlockOverlaySize(inst);
            if (typeof inst.visible !== 'undefined') inst.visible = false;
            if (typeof inst.opacity === 'number') inst.opacity = 0;
        });
        _prevNvgActive = false;
        _nvgStateDirty = true;
    }

    function getStickResetPosition(c2) {
        var x = 160;
        var yMid = getGlobalVar(c2, 'user_device_Y_mid');
        if (typeof yMid !== 'number') {
            var y = getGlobalVar(c2, 'user_device_Y');
            if (typeof y === 'number') yMid = y / 2;
        }
        return {
            x: x,
            y: typeof yMid === 'number' ? yMid - 4 : null
        };
    }

    function isStickResetPosition(c2, x, y) {
        if (typeof x !== 'number' || typeof y !== 'number') return false;
        var pos = getStickResetPosition(c2);
        if (typeof pos.y !== 'number') return x === pos.x && y === 0;
        return x === pos.x && y === pos.y;
    }

    function forceClearNvgState(c2) {
        if (!c2 || !K) return;
        findInstsByType(c2, ['t240'], 'Map').forEach(unlockOverlaySize);
        findInstsByType(c2, ['t971', 'Color_effect', 't1168'], 'Map').forEach(unlockOverlaySize);
        findInstsByType(c2, ['t707'], 'Map').forEach(function(inst) {
            unlockOverlaySize(inst);
            if (typeof inst.visible !== 'undefined') inst.visible = false;
            if (typeof inst.opacity === 'number') inst.opacity = 0;
        });
        _prevNeedLock = false;
        _prevNvgActive = false;
        _nvgStateDirty = true;
    }

    function nukeOverlayFilters() {
        requestAnimationFrame(nukeOverlayFilters);

        var c2 = getRT();
        if (!c2 || !K) return;

        var inGame = isInGame(c2);
        var nvgActive = inGame ? isNvgActive(c2) : false;
        var needLock = currentZOOM < 1.0 || nvgActive;
        if (!needLock && !_nvgStateDirty && _prevNeedLock === needLock && _prevNvgActive === nvgActive) {
            return;
        }

        // t240 (night): hard-lock when zoom < 1
        findInstsByType(c2, ['t240'], 'Map').forEach(function(inst) {
            if (needLock) hardLockOverlaySize(inst);
            else unlockOverlaySize(inst);
        });

        // t971 / Color_effect layer (blood moon / screen color overlay): hard-lock when zoom < 1
        findInstsByType(c2, ['t971', 'Color_effect', 't1168'], 'Map').forEach(function(inst) {
            if (needLock) hardLockOverlaySize(inst);
            else unlockOverlaySize(inst);
        });

        // t707 (NVG): hard-lock whenever NVG is active, because the NVG layer is screen-fixed
        findInstsByType(c2, ['t707'], 'Map').forEach(function(inst) {
            if (nvgActive && isNvgActive(c2, inst)) hardLockOverlaySize(inst);
            else unlockOverlaySize(inst);
        });

        _prevNeedLock = needLock;
        _prevNvgActive = nvgActive;
        _nvgStateDirty = false;
    }

    requestAnimationFrame(logicLoop);
    requestAnimationFrame(nukeOverlayFilters);
})();
