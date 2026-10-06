// ============================================================
// MDZ LIGHTING v3.1 - time-of-day colour grade, directional shadows, light
// shafts, drifting fog, vignette and grain for MiniDayZ+ 2.3.3 (Construct 2,
// obfuscated runtime).
//
// How it hooks in: the layout draws its layers in order into one render
// target, and this wraps the layer draw to add passes in between:
//   wet      after ground_enviroment in rain: soaked ground and puddles.
//   water    after the Water layer: the water tilemap's tiles as a mask,
//            the frame rippled there with sun/moon glints, and kept blue
//            under the warm grades.
//   shadows  before the first layer above Buildings_base_top (ground, items
//            and building floors are down; people, zombies, trees are not).
//            Every caster's silhouette is drawn into its own texture, leaning
//            away from the sun, then laid over the ground once - so shadows
//            that overlap do not get darker. Rocks, stumps and bushes painted
//            into the ground tilemap cast them too.
//   grade    before the first layer above the game's own lighting layers
//            (night / Color_effect / Sunset_Dawn): the frame so far, native
//            night darkness included, is copied and drawn back through the
//            grade shader. Everything above that (the HUD) lands on top
//            untouched.
// Our shaders live in the game's own program list, so they go through the
// engine's batcher like any built-in effect.
//
// Everything is local rendering: nothing is sent over the network, and each
// player's copy reads its own in-game clock.
//
// API: window.MDZLighting.set({...}) / .get() / .enable(bool)
//      .previewHour(h | null) / .reset() / .status()
// ============================================================
(function () {
    'use strict';
    if (window.MDZLighting) return;
    // A hidden dedicated server simulates the world; it has no player's image to render.
    if (/[?&]dedicated=1(?:&|$)/.test(location.search) && /[?&]render=0(?:&|$)/.test(location.search)) return;
    // index.html?nomods=1 is the stock game for the test harness.
    // (window.MDZ_LIGHTING_FORCE lets a test load it into such a page anyway)
    try { if (/[?&]nomods=1(&|$)/.test(location.search) && !window.MDZ_LIGHTING_FORCE) return; } catch (e) {}

    const VERSION = '3.3';
    const CFG_KEY = 'mdz_lighting_cfg';
    const isMobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent || '');
    const DEFAULTS = {
        enabled: false,
        strength: 1.0,   // 0..1, how much of the grade is mixed in
        shadows: 1.0,    // multipliers on the time-of-day values (0 = off)
        fog: 1.0,
        rays: 1.0,
        raysMode: 'objects', // 'objects': shafts blocked by trees and buildings, through the gaps; 'static': the original bands
        showFps: false,  // frames per second in the top right corner
        grain: 1.0,
        vignette: 1.0,
        light: 1.0,      // pool of light around the player at night
        wind: 1.0,       // plants swaying (0 = still)
        lamps: 1.0,      // fires, flares and muzzle flashes lighting the night
        puddles: 1.0,    // wet ground and puddles in rain
        water: 1.0,      // ripples and glints on the water (0 = the game's own)
        fireflies: 1.0,  // fireflies at dusk and night by trees, bushes and water
        flySize: 0.7,    // firefly size
        glow: 1.0,       // glow on lit-up things: bunker lights, hazmat visors, radioactive goo
        snowfall: 1.0,   // falling snow and blizzard streaks on the snow island
        footprints: true, // tracks in the snow
        frost: 1.0,      // breath and frost at the screen edges when the body is cold
        snowCover: true, // snow lying on top of trees, cars and roofs on the snow island
        leaves: 1.0,     // leaves now and then falling from the trees
        flyPixel: true,  // fireflies drawn as pixel art on the game's pixel grid
        cleanShadows: true, // dynamic shadows replace the ones painted into the sprites (and the game's drawn building shadows)
        fogMode: 'both', // 'both' (under objects + over them), 'ground' (object-aware only), 'top' (classic, over everything)
        shine: 1.0,      // sheen and glints on cars and roofs
        ao: 1.0,         // contact shadows: a soft dark rim where cars, walls and buildings meet the ground
        aberration: 1.0, // colour split on a hit and at low blood
        nvg: 1.0,        // night-vision look while wearing NVG: green phosphor, scanlines, tube edge (0 = the game's own)
        menuSaver: true, // 30 fps while a menu covers the game (pause, inventory, perks, map)
        lightning: true, // flashes in heavy rain
        vision: 0,       // line of sight: walls and shut doors block the view; how dark the ground is where you can't see (0 = off)
        visionRange: 1.0, // how far you see (x 380 world px)
        visionHide: true, // zombies, animals, people and loot out of sight are hidden
        quality: isMobile ? 1 : 2, // 0 low, 1 medium, 2 high (fog detail, soft shadows)
        autoQuality: true, // step the quality down while the game runs slow
        tileShadows: true, // rocks, stumps and bushes painted in the ground tilemap cast shadows too
        fpsCap: isMobile ? 60 : 0, // frame limit (0 = none); phones with 90/120 Hz screens otherwise draw everything twice as often
        weather: true,   // rain thickens fog, kills the sun shafts, softens shadows
        hour: null       // preview: a fixed hour instead of the game clock
    };
    // Round 6: the player's requested custom Performance defaults. Saved custom settings are preserved.
    Object.assign(DEFAULTS, {"strength":1,"shadows":0.8,"fog":0.6,"rays":0.6,"grain":0,"vignette":0.8,"light":1,"wind":0,"lamps":1,"puddles":0,"water":0.6,"fireflies":0.5,"glow":0.6,"snowfall":0.5,"snowCover":false,"leaves":0.4,"shine":0,"ao":0,"quality":0,"vision":0.2,"visionRange":1.5});
    // A page can change the defaults before this loads (the Shader Graphics
    // menu starts with the whole thing switched off):
    //   window.MDZ_LIGHTING_DEFAULTS = { enabled: false }
    try {
        const o = window.MDZ_LIGHTING_DEFAULTS;
        if (o && typeof o === 'object') for (const k of Object.keys(DEFAULTS)) if (Object.prototype.hasOwnProperty.call(o, k) && k !== 'hour') DEFAULTS[k] = o[k];
    } catch (e) {}
    const cfg = Object.assign({}, DEFAULTS);
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); } catch (e) {}
    // (a preview hour is never saved: next session follows the game clock again)
    // Server visibility never overwrites the player's offline preferences.
    const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(Object.assign({}, cfg, MPV.personal || {}, { hour: null }))); } catch (e) {} };
    cfg.hour = null;
    const MPV = { policy: null, personal: null, stamp: '' };
    const VIS_LOCK_KEYS = ['vision','visionRange','visionHide'];
    function syncMultiplayerVision() {
        let p=null;try { const n=window.MDZNet&&window.MDZNet.inst;p=n&&typeof n.visibilityPolicy==='function'?n.visibilityPolicy():null; }catch(e){}
        if(p&&p.locked){
            if(!MPV.personal){MPV.personal={};for(const k of VIS_LOCK_KEYS)MPV.personal[k]=cfg[k];}
            const stamp=p.darkness+'|'+p.range;
            MPV.policy=p;cfg.vision=p.darkness;cfg.visionRange=p.range;cfg.visionHide=true;
            if(MPV.stamp!==stamp){MPV.stamp=stamp;V.at=0;V.error='';}
        }else if(MPV.personal){Object.assign(cfg,MPV.personal);MPV.personal=null;MPV.policy=null;MPV.stamp='';V.at=0;}
    }
    // firefly size default went 1.5 -> 0.7: move a saved old default once
    if (!cfg.flySizeV2) { if (cfg.flySize === 1.5) cfg.flySize = 0.7; cfg.flySizeV2 = true; }
    // Frame limit. Wraps requestAnimationFrame: a frame that comes too soon
    // after the last one that ran is passed on to the next. Every callback of
    // an allowed frame runs in that frame, so other scripts' loops stay in step.
    // The frame limit right now: the chosen one, or 30 while a menu covers
    // the game (battery saver). MENU is kept up to date by the layout hook.
    const MENU = { open: false, at: 0 };
    const frameCap = () => {
        const c = +cfg.fpsCap || 0;
        return cfg.menuSaver !== false && MENU.open && (!c || c > 30) ? 30 : c;
    };
    const FPS = { raw: null, lastRan: -1e9, frameAllowed: -1, ids: new Map(), next: 1, early: typeof window.cr_getC2Runtime !== 'function' };
    if (typeof window.requestAnimationFrame === 'function') {
        FPS.raw = window.requestAnimationFrame.bind(window);
        const rawCancel = (window.cancelAnimationFrame || function () {}).bind(window);
        window.requestAnimationFrame = function (cb) {
            const id = FPS.next++;
            const run = t => {
                const cap = frameCap();
                if (cap > 0 && t !== FPS.frameAllowed) {
                    if (t - FPS.lastRan < 1000 / cap - 2) { FPS.ids.set(id, FPS.raw(run)); return; }
                    FPS.lastRan = t; FPS.frameAllowed = t;
                }
                FPS.ids.delete(id);
                cb(t);
            };
            FPS.ids.set(id, FPS.raw(run));
            return id;
        };
        window.cancelAnimationFrame = function (id) {
            if (FPS.ids.has(id)) { rawCancel(FPS.ids.get(id)); FPS.ids.delete(id); } else rawCancel(id);
        };
    }
    // One-tap looks. Anything not named keeps its value.
    const PRESETS = {
        extreme: { leaves: 1.5, snowfall: 1.5, frost: 1.2, glow: 1.5, strength: 1, shadows: 1.4, fog: 1.3, rays: 1.5, grain: 1, vignette: 1.2, light: 1.2, wind: 1.6, lamps: 1.3, puddles: 1.3, water: 1.5, fireflies: 1.6, shine: 1.6, ao: 1.3, quality: 2 },
        cinematic: { strength: 1, shadows: 1.2, fog: 1.2, rays: 1.3, grain: 1, vignette: 1.1, light: 1, wind: 1.2, lamps: 1.1, puddles: 1, water: 1.2, fireflies: 1.2, shine: 1.2, ao: 1.15, quality: 2 },
        balanced: { strength: 1, shadows: 1, fog: 1, rays: 1, grain: 1, vignette: 1, light: 1, wind: 1, lamps: 1, puddles: 1, water: 1, fireflies: 1, shine: 1, ao: 1, quality: isMobile ? 1 : 2 },
        subtle: { strength: 0.6, shadows: 0.7, fog: 0.5, rays: 0.5, grain: 0.4, vignette: 0.6, light: 0.8, wind: 0.7, lamps: 0.8, puddles: 0.7, water: 0.7, fireflies: 0.6, shine: 0.6, ao: 0.7 },
        performance: { leaves: 0.4, snowfall: 0.5, snowCover: false, glow: 0.6, strength: 1, shadows: 0.8, fog: 0.6, rays: 0.6, grain: 0, vignette: 0.8, light: 1, wind: 0, lamps: 1, puddles: 0, water: 0.6, fireflies: 0, shine: 0, ao: 0, quality: 0 }
    };

    PRESETS.performanceCustom=Object.assign({},PRESETS.performance,{"strength":1,"shadows":0.8,"fog":0.6,"rays":0.6,"grain":0,"vignette":0.8,"light":1,"wind":0,"lamps":1,"puddles":0,"water":0.6,"fireflies":0.5,"glow":0.6,"snowfall":0.5,"snowCover":false,"leaves":0.4,"shine":0,"ao":0,"quality":0,"vision":0.2,"visionRange":1.5});
    // ---------------------------------------------------------------
    // Time-of-day look. Each key is an hour; values blend between keys.
    //   tint     colour multiplied into the image
    //   lift     colour added into the dark parts (negative darkens them)
    //   exp/sat/con  exposure, saturation, contrast
    //   rays / rayCol   light shaft strength and colour
    //   fog / fogCol    fog density and colour
    //   vig / grain     vignette and film grain
    //   pool     light around the player (the game's own night stays as is)
    //   shLen    shadow length, in heights of the object casting it
    //   shAlpha / shCol  shadow strength and colour
    // ---------------------------------------------------------------
    const K = (h, o) => Object.assign({ h }, o);
    const NIGHT = { tint: [0.72, 0.88, 1.30], lift: [0.015, 0.04, 0.09], exp: 1.08, sat: 0.55, con: 1.12, rays: 0.22, rayCol: [0.55, 0.70, 1.00], fog: 0.22, fogCol: [0.16, 0.22, 0.34], vig: 0.55, grain: 0.05, pool: 0.35, shLen: 0.9, shAlpha: 0.30, shCol: [0.02, 0.03, 0.07] };
    const KEYS = [
        K(0, NIGHT),
        K(4, NIGHT),
        K(5.5, { tint: [0.96, 0.86, 0.95], lift: [0.03, 0.03, 0.06], exp: 1.05, sat: 0.80, con: 1.05, rays: 0.20, rayCol: [1.00, 0.78, 0.70], fog: 0.55, fogCol: [0.66, 0.68, 0.78], vig: 0.45, grain: 0.035, pool: 0.15, shLen: 1.9, shAlpha: 0.22, shCol: [0.07, 0.05, 0.10] }),
        K(7.5, { tint: [1.08, 1.00, 0.90], lift: [0.02, 0.015, 0.0], exp: 1.02, sat: 0.98, con: 1.06, rays: 0.38, rayCol: [1.00, 0.90, 0.70], fog: 0.30, fogCol: [0.86, 0.85, 0.80], vig: 0.35, grain: 0.025, pool: 0, shLen: 1.25, shAlpha: 0.40, shCol: [0.10, 0.07, 0.05] }),
        K(11, { tint: [1.04, 1.02, 0.96], lift: [0, 0, 0], exp: 1.0, sat: 1.08, con: 1.06, rays: 0.16, rayCol: [1.00, 0.96, 0.84], fog: 0.0, fogCol: [0.90, 0.90, 0.88], vig: 0.28, grain: 0.018, pool: 0, shLen: 0.45, shAlpha: 0.36, shCol: [0.06, 0.06, 0.07] }),
        K(15.5, { tint: [1.06, 1.01, 0.92], lift: [0.01, 0.005, 0], exp: 1.0, sat: 1.08, con: 1.08, rays: 0.22, rayCol: [1.00, 0.92, 0.75], fog: 0.0, fogCol: [0.90, 0.86, 0.80], vig: 0.30, grain: 0.02, pool: 0, shLen: 0.75, shAlpha: 0.40, shCol: [0.08, 0.06, 0.05] }),
        K(17.5, { tint: [1.12, 0.99, 0.82], lift: [0.01, -0.005, -0.02], exp: 1.0, sat: 1.06, con: 1.12, rays: 0.50, rayCol: [1.00, 0.80, 0.50], fog: 0.08, fogCol: [0.96, 0.84, 0.66], vig: 0.36, grain: 0.025, pool: 0, shLen: 1.35, shAlpha: 0.45, shCol: [0.12, 0.06, 0.02] }),
        K(19.3, { tint: [1.18, 0.96, 0.74], lift: [0.0, -0.02, -0.045], exp: 1.0, sat: 1.0, con: 1.2, rays: 0.75, rayCol: [1.00, 0.74, 0.40], fog: 0.12, fogCol: [0.95, 0.78, 0.56], vig: 0.42, grain: 0.03, pool: 0.05, shLen: 2.1, shAlpha: 0.50, shCol: [0.13, 0.06, 0.02] }),
        K(20.7, { tint: [0.86, 0.80, 1.05], lift: [0.03, 0.03, 0.08], exp: 1.06, sat: 0.80, con: 1.08, rays: 0.16, rayCol: [0.62, 0.70, 1.00], fog: 0.20, fogCol: [0.34, 0.38, 0.54], vig: 0.48, grain: 0.04, pool: 0.25, shLen: 1.1, shAlpha: 0.28, shCol: [0.03, 0.03, 0.08] }),
        K(22, NIGHT)
    ];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
    const mixKey = (a, b, t) => {
        const o = {};
        for (const k in a) if (k !== 'h') o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], t)) : lerp(a[k], b[k], t);
        return o;
    };
    function lookAt(hour) {
        hour = ((hour % 24) + 24) % 24;
        for (let i = 0; i < KEYS.length; i++) {
            const a = KEYS[i], b = KEYS[(i + 1) % KEYS.length];
            const bh = b.h <= a.h ? b.h + 24 : b.h;
            let h = hour; if (h < a.h) h += 24;
            if (h >= a.h && h <= bh) return mixKey(a, b, smooth((h - a.h) / (bh - a.h)));
        }
        return mixKey(KEYS[0], KEYS[0], 0);
    }
    // Direction the light travels, in world/screen axes (y down) - shadows
    // fall the same way. Morning sun from the upper right, noon from above,
    // evening from the upper left; the moon from the upper left. Sun and moon
    // blend across dawn and dusk so shadows swing instead of snapping.
    const MOON = [0.8, 1.0];
    function lightDir(hour) {
        hour = ((hour % 24) + 24) % 24;
        const t = clamp01((hour - 5.5) / 14);
        const sun = [-Math.cos(t * Math.PI), 0.55 + 0.45 * Math.sin(t * Math.PI)];
        const w = hour < 12 ? smooth((hour - 4.5) / 1.5) : 1 - smooth((hour - 20) / 1.5);
        const x = lerp(MOON[0], sun[0], w), y = lerp(MOON[1], sun[1], w);
        const n = Math.hypot(x, y) || 1;
        return [x / n, y / n];
    }

    // ---------------------------------------------------------------
    // Shaders. vTex is the copied frame; suv is the screen position with the
    // origin at the top left. Noise is periodic every 64 lattice cells so the
    // world offsets can be wrapped on the JS side without seams, which keeps
    // the numbers small enough for mediump phones.
    // ---------------------------------------------------------------
    const GRADE_FRAG = (quality) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define OCTAVES ${quality >= 2 ? 4 : quality === 1 ? 3 : 2}
#define WARP ${quality >= 2 ? 1 : 0}
#define MAX_LIGHTS ${quality >= 1 ? 12 : 8}
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform vec4 uGradeA;  // tint rgb, exposure
uniform vec4 uGradeB;  // lift rgb, saturation
uniform vec4 uGradeC;  // contrast, vignette, grain, time (wrapped)
uniform vec4 uRayA;    // across origin, along origin, dir x, dir y
uniform vec4 uRayB;    // strength, span px x, span px y, band width px
uniform vec3 uRayCol;
uniform vec4 uLight;   // centre (suv), radius, strength
uniform vec4 uScreen;  // aspect, flipY, mix, unused
uniform vec4 uLights[MAX_LIGHTS];   // centre (suv), radius (screen heights), intensity
uniform vec3 uLightCol[MAX_LIGHTS];
uniform float uLightCount;
uniform lowp sampler2D samplerBack;  // light mask: the game's own light sprites, tinted
uniform vec4 uMask;    // strength, glow, lightning flash, unused
uniform lowp sampler2D samplerShade;  // shadows thrown by the lights (alpha)
uniform vec4 uShade;   // on, texel x, texel y, unused
uniform lowp sampler2D samplerSun;   // sun-shadow silhouettes (alpha)
uniform vec4 uRayO;    // on, step towards the light x, y (uv), 1/strength
uniform vec4 uCA;      // colour split: strength (uv), unused x3
uniform vec4 uNvg;     // night vision: amount, time (wrapped), P45 (blue) 0..1, unused

float hashG(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash1(float p) { p = mod(p, 64.0); p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash2(vec2 p) { p = mod(p, 64.0); vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise1(float p) { p = mod(p, 64.0); float i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(hash1(i), hash1(i + 1.0), f); }
float vnoise2(vec2 p) {
    p = mod(p, 64.0);
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < OCTAVES; i++) { v += a * vnoise2(p); p = p * 2.0 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(void) {
    vec4 src = texture2D(samplerFront, vTex);
    // colour split (hit, low blood): red and blue pulled apart, more at the edges
    if (uCA.x > 0.00001) {
        vec2 dc = vTex - 0.5;
        vec2 o = dc * uCA.x * (0.5 + 2.0 * dot(dc, dc));
        src.r = texture2D(samplerFront, vTex + o).r;
        src.b = texture2D(samplerFront, vTex - o).b;
    }
    vec2 suv = vec2(vTex.x, mix(vTex.y, 1.0 - vTex.y, uScreen.y));
    vec3 c = src.rgb;

    // colour grade
    float l0 = luma(c);
    // Snow (and shadowed snow): bright-to-mid pixels with next to no colour.
    // A warm tint multiplied into them turns a snowfield into desert sand, so
    // they keep only a hint of it; a cool (night) tint still applies in full.
    float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    float snow = smoothstep(0.35, 0.65, l0) * (1.0 - smoothstep(0.05, 0.14, chroma));
    float warm = clamp((uGradeA.r - uGradeA.b) / 0.3, 0.0, 1.0);
    vec3 tintN = vec3(dot(uGradeA.rgb, vec3(0.3333)));
    c *= mix(uGradeA.rgb, mix(tintN, uGradeA.rgb, 0.3), snow * warm) * uGradeA.w;
    c += uGradeB.rgb * (1.0 - smoothstep(0.0, 0.6, l0));
    c = mix(vec3(luma(c)), c, uGradeB.w);
    c = (c - 0.5) * uGradeC.x + 0.5;

    // light shafts: bands across the light direction, broken up along it
    if (uRayB.x > 0.001) {
        vec2 dir = uRayA.zw, perp = vec2(-dir.y, dir.x);
        vec2 lp = (suv - 0.5) * uRayB.yz;
        float across = uRayA.x + dot(lp, perp) / uRayB.w;
        float along = uRayA.y + dot(lp, dir) / (uRayB.w * 4.0);
        float band = smoothstep(0.52, 1.0, vnoise1(across)) + 0.6 * smoothstep(0.62, 1.0, vnoise1(across * 2.0 + 17.0));
        float broken = 0.45 + 0.55 * vnoise1(along + 31.0);
        // brighter on the side the light comes from
        float side = clamp(0.85 - dot(suv - 0.5, dir) * 1.1, 0.0, 1.0);
        float r = band * broken * side * uRayB.x;
        // object-aware: a shaft reaching this spot is cut where something
        // stands between it and the light - they come through the gaps
        if (uRayO.x > 0.5) {
            float occ = texture2D(samplerSun, vTex).a * 2.0;
            for (int k = 1; k <= 6; k++) occ += texture2D(samplerSun, vTex + uRayO.yz * float(k)).a;
            r *= 1.0 - clamp(occ / 8.0 * uRayO.w, 0.0, 1.0);
        }
        vec3 rc = mix(uRayCol, vec3(luma(uRayCol)), snow * warm * 0.6);
        c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - rc * r);
    }

    // pool of light around the player
    if (uLight.w > 0.001) {
        vec2 d = (suv - uLight.xy) * vec2(uScreen.x, 1.0);
        float pool = 1.0 - smoothstep(0.0, uLight.z, length(d));
        c += c * pool * uLight.w;
    }

    // point lights (fires, flares, muzzle flashes): warm the lit ground and
    // add a soft glow; the game's own night darkness is already in c
    vec3 lit = vec3(0.0);
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (float(i) >= uLightCount) break;
        vec4 L = uLights[i];
        float fall = 1.0 - smoothstep(0.0, L.z, length((suv - L.xy) * vec2(uScreen.x, 1.0)));
        lit += uLightCol[i] * (fall * fall * L.w);
    }
    // several lights on one spot level off instead of adding up to white
    lit = lit / (1.0 + max(lit - 0.8, 0.0));
    // What stands between a light and the ground keeps its light off it: the
    // shadow a fire or lamp throws. Darkens in proportion to how lit the spot
    // is (our light + the game's own glow there), so it shows next to a fire
    // and not out in the dark.
    vec3 mRaw = uMask.x > 0.001 ? min(texture2D(samplerBack, vTex).rgb, vec3(1.5)) * uMask.x : vec3(0.0);
    mRaw = mRaw / (1.0 + max(mRaw - 0.5, 0.0));
    float occ = 0.0;
    if (uShade.x > 0.5) {
        vec2 o = uShade.yz * 1.6;   // soft edges: five taps
        occ = texture2D(samplerShade, vTex).a * 0.4 + 0.15 * (texture2D(samplerShade, vTex + vec2(o.x, 0.0)).a + texture2D(samplerShade, vTex - vec2(o.x, 0.0)).a
            + texture2D(samplerShade, vTex + vec2(0.0, o.y)).a + texture2D(samplerShade, vTex - vec2(0.0, o.y)).a);
    }
    float here = clamp(max(lit.r, max(lit.g, lit.b)) * 1.4 + max(mRaw.r, max(mRaw.g, mRaw.b)) * 1.8, 0.0, 1.0);
    vec3 shade = vec3(1.0) - occ * here * 0.55 * vec3(1.0, 0.94, 0.82);   // as strong as a sun shadow, a little cool
    vec3 base = src.rgb * shade;
    c *= shade;
    lit *= 1.0 - occ * 0.92;
    c = c + c * lit * 1.8 + lit * 0.10;
    float lw = max(lit.r, max(lit.g, lit.b));
    if (uMask.x > 0.001) {
        vec3 m = mRaw * (1.0 - occ * 0.92);
        lw += max(m.r, max(m.g, m.b));
        // lamplight wins over the moonlight grade: fall back towards the
        // ungraded surface, then light it in the lamp's colour
        c = mix(c, base, clamp(max(m.r, max(m.g, m.b)), 0.0, 1.0) * 0.6);
        c = c + base * m * (2.4 + 1.6 * uShade.w) + m * uMask.y;
        // rain and fog catch the light: the beam shows in the air too
        if (uMask.w > 0.001) c += mRaw * uMask.w * 0.9;
    }
    // stacked lights on bright ground (snow, concrete) roll off softly
    // instead of burning to flat white - only where something is lit
    if (lw > 0.001) {
        vec3 over = max(c - 0.72, 0.0);
        vec3 soft = min(c, vec3(0.72)) + 0.28 * (vec3(1.0) - exp(-over / 0.28));
        c = mix(c, soft, clamp(lw * 2.0, 0.0, 1.0));
    }

    // lightning
    if (uMask.z > 0.001) c = c + (c * 1.1 + vec3(0.06, 0.07, 0.10)) * uMask.z;

    // vignette
    vec2 v = (suv - 0.5) * vec2(uScreen.x * 0.75, 1.0);
    c *= 1.0 - uGradeC.y * smoothstep(0.35, 0.95, length(v));

    // grain
    c += (hashG(floor(suv * vec2(900.0 * uScreen.x, 900.0)) + uGradeC.w) - 0.5) * uGradeC.z;

    c = mix(src.rgb, clamp(c, 0.0, 1.0), uScreen.z);

    // night vision: an image intensifier - brightness only, lifted hard in the
    // dark, painted in phosphor green; lights bloom towards white; grain,
    // fine scanlines and the round edge of the tube
    if (uNvg.x > 0.001) {
        float L = luma(c);
        // lifted, then an S-curve so bright ground (snow) keeps its detail
        float g = 1.0 - exp(-L * 2.4);
        g = mix(g, g * g * (3.0 - 2.0 * g), 0.6);
        // P45 (the blue NVG): white-blue phosphor instead of green
        vec3 phDark = mix(vec3(0.01, 0.045, 0.02), vec3(0.015, 0.025, 0.05), uNvg.z);
        vec3 phMid = mix(vec3(0.28, 0.72, 0.26), vec3(0.5, 0.64, 0.8), uNvg.z);
        vec3 phHigh = mix(vec3(0.82, 1.0, 0.78), vec3(0.9, 0.95, 1.0), uNvg.z);
        vec3 ph = mix(phDark, phMid, smoothstep(0.0, 0.7, g));
        ph = mix(ph, phHigh, smoothstep(0.72, 1.0, g) * 0.7);
        ph += (hashG(floor(suv * vec2(420.0 * uScreen.x, 420.0)) + uNvg.y) - 0.5) * 0.11;
        ph *= 0.9 + 0.1 * step(0.5, fract(gl_FragCoord.y * 0.5));
        float tube = length((suv - 0.5) * vec2(uScreen.x, 1.0));
        ph *= 1.0 - 0.8 * smoothstep(0.55, 0.9, tube);
        c = mix(c, clamp(ph, 0.0, 1.0), uNvg.x);
    }
    gl_FragColor = vec4(c * src.a, src.a);
}`;
    // A caster's silhouette: only its alpha counts.
    const SIL_FRAG = () => `
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform lowp float opacity;
void main(void) {
    lowp float a = texture2D(samplerFront, vTex).a * opacity;
    gl_FragColor = vec4(a, a, a, a);
}`;
    // Wet ground: the ground layers darkened and deepened by rain, with
    // world-anchored puddles reflecting the sky, a bright rim, and raindrops
    // sparkling on them. Drawn before people, trees and roofs.
    const WET_FRAG = (quality) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define OCTAVES ${quality >= 1 ? 3 : 2}
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform vec4 uWet;     // wetness, sparkle time, flipY, rain now
uniform vec4 uPud;     // puddle origin (lattice), span (lattice)
uniform vec3 uSky;     // what the puddles reflect
float hashG(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash2(vec2 p) { p = mod(p, 64.0); return hashG(p); }
float vnoise2(vec2 p) {
    p = mod(p, 64.0);
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < OCTAVES; i++) { v += a * vnoise2(p); p = p * 2.0 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
void main(void) {
    vec4 src = texture2D(samplerFront, vTex);
    vec2 suv = vec2(vTex.x, mix(vTex.y, 1.0 - vTex.y, uWet.z));
    float w = uWet.x;
    vec3 c = src.rgb;
    // soaked: darker, a little richer
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, 1.0 + 0.25 * w) * (1.0 - 0.18 * w);
    // puddles grow as the ground soaks
    vec2 p = uPud.xy + suv * uPud.zw;
    float n = fbm(p);
    float th = 0.74 - 0.08 * w;
    float pud = smoothstep(th, th + 0.05, n) * w;
    c = mix(c, c * 0.42 + uSky * 0.16, pud * 0.9);
    float rim = (smoothstep(th - 0.03, th, n) - smoothstep(th, th + 0.03, n)) * w;
    c += uSky * rim * 0.10;
    // raindrops hitting the puddles
    vec2 q = p * 24.0;
    float sp = step(0.993, hashG(floor(q) + floor(uWet.y * 11.0) * 7.31)) * pud * uWet.w;   // drops only while it rains
    c += uSky * sp * 0.35;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0) * src.a, src.a);
}`;
    // One of the game's light sprites, tinted: its own colour and shape, added up.
    const MASK_FRAG = () => `
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform lowp float opacity;
uniform mediump vec3 uTint;
uniform lowp float uAsAlpha;   // 1: the image is a black cone (headlights, flashlight) - its alpha is the light
void main(void) {
    lowp vec4 t = texture2D(samplerFront, vTex);
    gl_FragColor = vec4(mix(t.rgb, vec3(t.a), uAsAlpha) * uTint * opacity, t.a * opacity);
}`;
    // Water: the frame so far, rippled where the water mask is, with glints
    // of sun or moon on the crests. World-anchored noise, periodic every 64
    // cells like the fog (all multipliers are whole numbers so the wrap on
    // the JS side has no seam).
    const WATER_FRAG = (quality) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define GLINT_DETAIL ${quality >= 2 ? 1 : 0}
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform lowp sampler2D samplerBack;  // water mask
uniform vec4 uWatA;    // world origin (lattice, wrapped), span (lattice)
uniform vec4 uWatB;    // swell offsets: a.xy, b.xy (lattice, wrapped)
uniform vec4 uWatC;    // glint offsets: a.xy, b.xy (lattice, wrapped)
uniform vec4 uWatD;    // ripple size in texture units x, y; flipY; glint threshold
uniform vec4 uGlint;   // glint colour rgb, crest sheen
uniform vec3 uComp;    // per-channel colour compensation
uniform vec4 uIce;     // amount, floe drift x, y, unused
float hashG(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash2(vec2 p) { p = mod(p, 64.0); return hashG(p); }
float vnoise2(vec2 p) {
    p = mod(p, 64.0);
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(void) {
    vec4 src = texture2D(samplerFront, vTex);
    float m = texture2D(samplerBack, vTex).a;
    if (m < 0.004) { gl_FragColor = src; return; }
    vec2 suv = vec2(vTex.x, mix(vTex.y, 1.0 - vTex.y, uWatD.z));
    vec2 p = uWatA.xy + suv * uWatA.zw;
    // two swells crossing: a small shift of what is under the water
    float n1 = vnoise2(p + uWatB.xy);
    float n2 = vnoise2(p * 2.0 + uWatB.zw + 17.0);
    vec2 tuv = vTex + (vec2(n1, n2) - 0.5) * 2.0 * uWatD.xy;
    float m2 = texture2D(samplerBack, tuv).a;
    vec3 c = mix(src.rgb, texture2D(samplerFront, tuv).rgb, m2);
    // the water keeps its own colour under warm light
    c *= uComp;
    // sheen on the crests, glints where two fine wave sets peak together
    float crest = max(n1 + n2 - 1.05, 0.0);
    float g = vnoise2(p * 9.0 + uWatC.xy);
#if GLINT_DETAIL
    g *= vnoise2(p * 13.0 + uWatC.zw + 23.0);
    float th = uWatD.w;
#else
    float th = uWatD.w * 1.45;
#endif
    float sp = smoothstep(th, th + 0.05, g);
    c += uGlint.rgb * (sp + crest * uGlint.w);
    // cold water on the snow island: steel blue, with floes of ice drifting on it
    if (uIce.x > 0.01) {
        c = mix(c, c * vec3(0.78, 0.9, 1.0) * 0.92, uIce.x * 0.7);
        float fl = vnoise2(p * 2.0 + uIce.yz) * 0.6 + vnoise2(p * 4.0 + uIce.yz * 2.0 + 41.0) * 0.4;
        float floe = smoothstep(0.72, 0.745, fl) * uIce.x;
        float rim = (smoothstep(0.69, 0.72, fl) - smoothstep(0.72, 0.745, fl)) * uIce.x;
        c = mix(c, vec3(0.80, 0.86, 0.9) + (vnoise2(p * 5.0) - 0.5) * 0.08, floe * 0.9);
        c = mix(c, c * 0.72, rim * 0.6);
    }
    gl_FragColor = vec4(mix(src.rgb, clamp(c, 0.0, 1.0), m), src.a);
}`;
    // Fog density, drawn into a small texture (fog is soft - a quarter of the
    // screen resolution looks the same and costs a sixteenth). World-anchored
    // fbm drifting with the wind, thicker towards the screen edges, parted
    // around the player and other characters walking through it.
    const FOGGEN_FRAG = (quality) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define OCTAVES ${quality >= 2 ? 4 : quality === 1 ? 3 : 2}
#define WARP ${quality >= 2 ? 1 : 0}
#define MAX_CLEAR 8
varying mediump vec2 vTex;
uniform vec4 uFogA;    // fog origin (lattice), span (lattice)
uniform vec4 uFogB;    // density, edge bias, warp time, flipY
uniform vec4 uFogS;    // aspect, clear count, unused, unused
uniform vec4 uClear[MAX_CLEAR]; // centre (suv), radius (screen heights), strength
float hash2(vec2 p) { p = mod(p, 64.0); vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise2(vec2 p) {
    p = mod(p, 64.0);
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < OCTAVES; i++) { v += a * vnoise2(p); p = p * 2.0 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
void main(void) {
    vec2 suv = vec2(vTex.x, mix(vTex.y, 1.0 - vTex.y, uFogB.w));
    vec2 p = uFogA.xy + suv * uFogA.zw;
#if WARP
    p += 0.9 * vec2(vnoise2(p + vec2(uFogB.z, 0.0)), vnoise2(p + vec2(5.2, uFogB.z)));
#endif
    float n = fbm(p);
    vec2 e = (suv - 0.5) * vec2(uFogS.x, 1.0);
    float edge = uFogB.y * clamp(length(e) * 1.2, 0.0, 1.0);
    float f = uFogB.x * smoothstep(0.30, 0.80, n + edge - 0.15);
    for (int i = 0; i < MAX_CLEAR; i++) {
        if (float(i) >= uFogS.y) break;
        vec4 C = uClear[i];
        float d = length((suv - C.xy) * vec2(uFogS.x, 1.0));
        f *= mix(1.0, smoothstep(C.z * 0.35, C.z, d), C.w);
    }
    gl_FragColor = vec4(f, f, f, 1.0);
}`;
    // The fog texture laid over the frame in its colour (premultiplied).
    const FOGCOMP_FRAG = () => `
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform mediump vec4 uFogC;   // colour rgb, share
void main(void) {
    mediump float f = clamp(texture2D(samplerFront, vTex).r * uFogC.a, 0.0, 0.92);
    gl_FragColor = vec4(uFogC.rgb * f, f);
}`;
    // Line of sight: what a wall hides, drawn solid into the vision texture.
    const VISGEN_FRAG = () => `
varying mediump vec2 vTex;
void main(void) {
    gl_FragColor = vec4(1.0);
}`;
    // The vision texture (softened) plus the edge of the range, laid over the
    // ground as a dark tint (premultiplied).
    const VISCOMP_FRAG = () => `
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform mediump vec4 uVisA;   // strength, texel u, texel v, -
uniform mediump vec4 uVisB;   // eye u, v; 1 / range in u, v
uniform mediump vec4 uVisC;   // colour rgb, where the range edge starts to darken (0..1)
uniform mediump vec4 uVisD;   // aim direction x/y, cone half-angle cosine, focus enabled
void main(void) {
    mediump vec2 px = uVisA.yz;
    mediump float m = texture2D(samplerFront, vTex).r;
    m=max(m,texture2D(samplerFront,vTex+vec2(px.x,0.0)).r);
    m=max(m,texture2D(samplerFront,vTex-vec2(px.x,0.0)).r);
    m=max(m,texture2D(samplerFront,vTex+vec2(0.0,px.y)).r);
    m=max(m,texture2D(samplerFront,vTex-vec2(0.0,px.y)).r);
    // GLWrap.Yv samples an FBO with v=0 at the bottom. World y grows down.
    // Leave shadow texture sampling in FBO coordinates, and convert only geometry.
    mediump vec2 worldUV=vec2(vTex.x,1.0-vTex.y);
    mediump vec2 delta=(worldUV-uVisB.xy)*uVisB.zw;
    mediump float r = smoothstep(uVisC.a, 1.0, length(delta));
    mediump float angle=dot(normalize(delta+vec2(0.000001)),uVisD.xy);
    mediump float cone=(1.0-smoothstep(uVisD.z-0.06,uVisD.z,angle))*uVisD.w;
    mediump float a = max(max(clamp(m, 0.0, 1.0), r),cone) * uVisA.x;
    gl_FragColor = vec4(uVisC.rgb * a, a);
}`;
    // A firefly: a bright core and a soft halo, added on (blend ONE, ONE).
    const FLY_FRAG = () => `
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform lowp float opacity;
uniform mediump vec3 uTint;
uniform mediump float uPix;   // 1: a 5x5 pixel-art firefly (bright centre, dimmer cross, faint corners)
void main(void) {
    mediump float a;
    if (uPix > 0.5) {
        mediump vec2 g = abs(floor(vTex * 5.0) - 2.0);
        mediump float s = g.x + g.y;
        a = s < 0.5 ? 1.3 : s < 1.5 ? 0.6 : (s < 2.5 && max(g.x, g.y) < 1.5) ? 0.26 : s < 2.5 ? 0.12 : 0.0;
    } else {
        mediump float r = length(vTex - 0.5) * 2.0;
        mediump float core = 1.0 - smoothstep(0.0, 0.3, r);
        mediump float halo = 1.0 - smoothstep(0.0, 1.0, r);
        a = core * 1.3 + halo * halo * 0.6;
    }
    gl_FragColor = vec4(uTint * a * opacity, 0.0);
}`;
    // Shine on a car or a roof, added on: a soft sheen on the side facing the
    // light, and hard glints on bright, colourless pixels (glass, chrome,
    // metal edges). Wet surfaces shine more.
    const SHINE_FRAG = () => `
precision mediump float;
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform lowp float opacity;
// per-sprite values come as the engine's own batched effect parameters
// (no flush per sprite): p0, p1, ...
uniform float p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10;
#define uRect vec4(p0, p1, p2, p3)   // this frame's UV rect on its sheet: left, top, width, height
#define uSun vec4(p4, p5, p6, p7)    // light direction x, y (screen), soft, hard
#define uCol vec3(p8, p9, p10)
void main(void) {
    vec4 t = texture2D(samplerFront, vTex);
    if (t.a < 0.02) { gl_FragColor = vec4(0.0); return; }
    vec2 l = (vTex - uRect.xy) / uRect.zw;
    vec3 c = t.rgb / max(t.a, 0.001);
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
    float facing = clamp(0.55 - dot(l - 0.5, uSun.xy) * 1.3, 0.0, 1.0);
    float soft = facing * facing * uSun.z * (0.35 + 0.65 * lum);
    float metal = smoothstep(0.45, 0.85, lum) * (1.0 - smoothstep(0.12, 0.45, sat));
    float hard = metal * metal * smoothstep(0.3, 0.85, facing + 0.2) * uSun.w;
    gl_FragColor = vec4(uCol * (soft + hard) * t.a * opacity, 0.0);
}`;
    // Glow: a colour-keyed bloom. Samples a disc around each pixel of the
    // sprite, keeps only the keyed colour (red lights, a visor, radioactive
    // green), and adds it on as a soft halo plus a brighter core.
    const GLOW_FRAG = (quality) => `
precision mediump float;
#define TAPS ${quality >= 1 ? 16 : 8}
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform lowp float opacity;
uniform vec4 uRect;    // the frame's own UV rect: left, top, right, bottom
uniform vec4 uGlowA;   // radius x, radius y (uv), strength, core
uniform vec4 uKey;     // mode (0 red, 1 green, 2 cyan, 3 yellow), min brightness, min purity, unused
uniform vec3 uGlowCol;
float keyOf(vec2 uv) {
    if (uv.x < uRect.x || uv.y < uRect.y || uv.x > uRect.z || uv.y > uRect.w) return 0.0;
    vec4 t = texture2D(samplerFront, uv);
    if (t.a < 0.2) return 0.0;
    vec3 c = t.rgb / t.a;
    // how pure the key colour is (lamps, faces, goo ~0.5-1; rust, dirt and
    // the suits ~0.1-0.4) and how bright: dull art never glows
    float v, pur;
    if (uKey.x < 0.5) { v = c.r; pur = (c.r - max(c.g, c.b)) / max(c.r, 0.01); }
    else if (uKey.x < 1.5) { v = c.g; pur = (c.g - max(c.r, c.b)) / max(c.g, 0.01); }
    else if (uKey.x < 2.5) { v = min(c.g, c.b); pur = (v - c.r) / max(v, 0.01); }
    else { v = min(c.r, c.g); pur = (v - c.b) / max(v, 0.01); }   // yellow
    return smoothstep(uKey.z, uKey.z + 0.15, pur) * smoothstep(uKey.y, uKey.y + 0.15, v) * t.a;
}
void main(void) {
    float core = keyOf(vTex);
    float halo = 0.0;
    for (int i = 0; i < TAPS; i++) {
        float a = float(i) * 2.39996;              // golden angle
        float r = sqrt((float(i) + 0.5) / float(TAPS));
        halo += keyOf(vTex + vec2(cos(a), sin(a)) * r * uGlowA.xy) * (1.0 - r * 0.7);
    }
    halo /= float(TAPS) * 0.6;
    float g = (halo * uGlowA.z + core * uGlowA.w) * opacity;
    gl_FragColor = vec4(uGlowCol * g, 0.0);
}`;
    // Snow sparkle: glints on the snow (the frame so far holds only the ground)
    // where a pixel is bright and colourless. World-anchored 2 px cells twinkle.
    const SPARKLE_FRAG = () => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform vec4 uSpA;    // world origin (cells, wrapped), span (cells)
uniform vec4 uSpB;    // colour rgb, time
float hashG(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(void) {
    vec3 c = texture2D(samplerFront, vTex).rgb;
    vec2 suv = vec2(vTex.x, 1.0 - vTex.y);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    float snow = smoothstep(0.55, 0.72, l) * (1.0 - smoothstep(0.06, 0.14, chroma));
    vec2 cell = floor(mod(uSpA.xy + suv * uSpA.zw, 4096.0));
    float h = hashG(cell);
    float tw = sin(uSpB.w * (1.5 + h * 3.0) + h * 40.0);
    float g = step(0.982, h) * pow(max(tw, 0.0), 6.0);
    gl_FragColor = vec4(uSpB.rgb * g * snow, 0.0);
}`;
    // Frost creeping in from the screen edges: a frosted haze made of pixel
    // grains (so it matches the pixel art), with an irregular inner edge.
    const FROST_FRAG = () => `
precision mediump float;
varying mediump vec2 vTex;
uniform vec4 uFrost;   // amount, aspect, light, unused
uniform vec2 uRes;     // screen size in pixels
float hashG(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hashG(i), hashG(i + vec2(1.0, 0.0)), f.x), mix(hashG(i + vec2(0.0, 1.0)), hashG(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(void) {
    vec2 q = (vTex - 0.5) * vec2(uFrost.y, 1.0);
    float e = length(q) / length(vec2(uFrost.y, 1.0) * 0.5);            // 0 centre, 1 corners
    vec2 cell = floor(vTex * uRes / 3.0);                                // 3 px grains
    float g = hashG(cell);
    float blot = vn(cell * 0.08) * 0.65 + vn(cell * 0.21 + 9.0) * 0.35;  // irregular edge
    float reach = 1.0 - uFrost.x * 0.4;
    float fr = smoothstep(reach, reach + 0.3, e + (blot - 0.5) * 0.3);
    float grain = step(0.45, g) * 0.6 + step(0.9, g) * 0.4;             // mottled, a few bright crystals
    float a = fr * (0.22 + 0.4 * grain) * min(1.0, uFrost.x * 1.3);
    vec3 col = mix(vec3(0.80, 0.88, 1.0), vec3(1.0), grain) * uFrost.z;
    gl_FragColor = vec4(col * a, a);
}`;
    // Snow lying on a sprite: on its top edges (transparent above) and on the
    // lit tops of leaf clumps (brighter than the pixel above).
    const SNOWCAP_FRAG = () => `
precision mediump float;
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform lowp float opacity;
// per-sprite values come as the engine's own batched effect parameters
// (no flush per sprite): p0, p1, ...
uniform float p0, p1, p2, p3, p4, p5, p6, p7, p8, p9;
#define uRect vec4(p0, p1, p2, p3)   // the frame's UV rect: left, top, right, bottom
#define uCap vec4(p4, p5, p6, p7)    // amount, texel y (up, signed), light, mode (0 tree, 1 seen from above)
#define uTexel vec2(p8, p9)          // texel size
float alphaAt(vec2 uv) {
    if (uv.y < uRect.y || uv.y > uRect.w) return 0.0;
    return texture2D(samplerFront, uv).a;
}
float hashG(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(void) {
    vec4 t = texture2D(samplerFront, vTex);
    if (t.a < 0.5) { gl_FragColor = vec4(0.0); return; }
    vec2 up = vec2(0.0, uCap.y);
    float a1 = alphaAt(vTex - up), a2 = alphaAt(vTex - up * 2.0);
    float edge = (1.0 - step(0.5, a1)) + (1.0 - step(0.5, a2)) * step(0.5, hashG(floor(vTex / abs(uCap.y) * vec2(1.0, 1.0))));
    vec3 c = t.rgb / t.a;
    vec4 ab = texture2D(samplerFront, vTex - up);
    float l = dot(c, vec3(0.299, 0.587, 0.114)), la = ab.a > 0.5 ? dot(ab.rgb / ab.a, vec3(0.299, 0.587, 0.114)) : 0.0;
    float clump = smoothstep(0.06, 0.14, l - la) * step(0.5, ab.a) * step(0.25, l);
    float cap = clamp(edge, 0.0, 1.0) * 0.95 + clump * 0.55;
    // cars, roofs, tents, barricades are seen from above: snow lies all over
    // them in pixel specks, thicker on the lighter (upward) surfaces
    if (uCap.w > 0.5) {
        float g = hashG(floor(vTex / uTexel));
        cap = max(cap * 0.8, (step(0.55, g) * 0.75 + step(0.88, g) * 0.25) * smoothstep(0.1, 0.4, l));
    }
    float a = cap * uCap.x * opacity;
    gl_FragColor = vec4(vec3(0.94, 0.97, 1.0) * uCap.z * a, a);
}`;
    // Water inside a sprite (the fountain): its dark teal water pixels are
    // redrawn rippling, with twinkling glints.
    const SWATER_FRAG = () => `
precision mediump float;
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
// per-sprite values come as the engine's own batched effect parameters
// (no flush per sprite): p0, p1, ...
uniform float p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10;
#define uRect vec4(p0, p1, p2, p3)   // frame rect: left, top, right, bottom
#define uWat vec4(p4, p5, p6, p7)    // time, texel x, texel y, amount
#define uGl vec3(p8, p9, p10)        // glint colour
float hashG(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wk(vec4 t) {
    if (t.a < 0.5) return 0.0;
    vec3 c = t.rgb / t.a;
    return step(0.045, c.g - c.r) * step(0.03, c.b - c.r) * step(c.g, 0.5);
}
void main(void) {
    vec4 t = texture2D(samplerFront, vTex);
    if (wk(t) < 0.5) { gl_FragColor = vec4(0.0); return; }
    vec2 px = floor(vTex / uWat.yz);
    vec2 off = vec2(sin(px.y * 0.55 + uWat.x * 2.1), cos(px.x * 0.45 + uWat.x * 1.7)) * uWat.yz;
    vec2 uv2 = clamp(vTex + off, uRect.xy, uRect.zw);
    vec4 t2 = texture2D(samplerFront, uv2);
    vec3 c = wk(t2) > 0.5 ? t2.rgb / t2.a : t.rgb / t.a;
    float rip = smoothstep(1.3, 1.9, sin(px.x * 0.4 + uWat.x * 1.9) + sin(px.y * 0.6 - uWat.x * 1.4));
    float h = hashG(px);
    float glint = step(0.965, h) * pow(max(sin(uWat.x * (2.0 + h * 3.0) + h * 30.0), 0.0), 5.0);
    c += uGl * (rip * 0.18 + glint * 0.9);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0) * t.a * uWat.w;
}`;
    // All silhouettes laid over the ground once, softened on medium/high.
    const COMP_FRAG = (quality) => `
precision mediump float;
#define BLUR ${quality >= 2 ? 1 : 0}
varying mediump vec2 vTex;
uniform lowp sampler2D samplerFront;
uniform vec4 uShadow;  // shade rgb (what a full shadow multiplies the ground by), strength
uniform vec2 uPx;      // blur step in texture units
void main(void) {
    float a = texture2D(samplerFront, vTex).a;
#if BLUR
    a = a * 0.36 + 0.16 * (texture2D(samplerFront, vTex + vec2(uPx.x, 0.0)).a + texture2D(samplerFront, vTex - vec2(uPx.x, 0.0)).a
                         + texture2D(samplerFront, vTex + vec2(0.0, uPx.y)).a + texture2D(samplerFront, vTex - vec2(0.0, uPx.y)).a);
#endif
    a *= uShadow.a;
    // multiplied into the ground (blend ZERO, SRC_COLOR): each surface keeps
    // its own colour, only darker and a little cooler - snow gets grey-blue
    // shadows instead of brown ones
    gl_FragColor = vec4(mix(vec3(1.0), uShadow.rgb, a), 1.0);
}`;
    // The engine's own vertex shaders (GLWrap init): 2D, or 3D in front-to-back mode.
    const VERT2 = 'attribute highp vec2 aPos;\nattribute mediump vec2 aTex;\nvarying mediump vec2 vTex;\nuniform highp mat4 matP;\nuniform highp mat4 matMV;\nvoid main(void) {\n\tgl_Position = matP * matMV * vec4(aPos.x, aPos.y, 0.0, 1.0);\n\tvTex = aTex;\n}';
    const VERT3 = 'attribute highp vec3 aPos;\nattribute mediump vec2 aTex;\nvarying mediump vec2 vTex;\nuniform highp mat4 matP;\nuniform highp mat4 matMV;\nvoid main(void) {\n\tgl_Position = matP * matMV * vec4(aPos.x, aPos.y, aPos.z, 1.0);\n\tvTex = aTex;\n}';
    const GRADE_UNIFORMS = ['uGradeA', 'uGradeB', 'uGradeC', 'uRayA', 'uRayB', 'uRayCol', 'uLight', 'uScreen'];
    const PROGRAMS = {
        grade: { name: 'mdz_lighting', frag: GRADE_FRAG, uniforms: GRADE_UNIFORMS.concat(['uLights', 'uLightCol', 'uLightCount', 'uMask', 'samplerShade', 'uShade', 'samplerSun', 'uRayO', 'uCA', 'uNvg']) },
        sil: { name: 'mdz_shadow_sil', frag: SIL_FRAG, uniforms: [] },
        comp: { name: 'mdz_shadow_comp', frag: COMP_FRAG, uniforms: ['uShadow', 'uPx'] },
        mask: { name: 'mdz_light_mask', frag: MASK_FRAG, uniforms: ['uTint', 'uAsAlpha'] },
        wet: { name: 'mdz_wet_ground', frag: WET_FRAG, uniforms: ['uWet', 'uPud', 'uSky'] },
        foggen: { name: 'mdz_fog_gen', frag: FOGGEN_FRAG, uniforms: ['uFogA', 'uFogB', 'uFogS', 'uClear'] },
        fogcomp: { name: 'mdz_fog_comp', frag: FOGCOMP_FRAG, uniforms: ['uFogC'] },
        sparkle: { name: 'mdz_snow_sparkle', frag: SPARKLE_FRAG, uniforms: ['uSpA', 'uSpB'] },
        frost: { name: 'mdz_frost', frag: FROST_FRAG, uniforms: ['uFrost', 'uRes'] },
        snowcap: { name: 'mdz_snowcap', frag: SNOWCAP_FRAG, uniforms: [], params: 10 },
        spritewater: { name: 'mdz_sprite_water', frag: SWATER_FRAG, uniforms: [], params: 11 },
        glow: { name: 'mdz_glow', frag: GLOW_FRAG, uniforms: ['uRect', 'uGlowA', 'uKey', 'uGlowCol'] },
        fly: { name: 'mdz_firefly', frag: FLY_FRAG, uniforms: ['uTint', 'uPix'] },
        shine: { name: 'mdz_shine', frag: SHINE_FRAG, uniforms: [], params: 11 },
        water: { name: 'mdz_water', frag: WATER_FRAG, uniforms: ['uWatA', 'uWatB', 'uWatC', 'uWatD', 'uGlint', 'uComp', 'uIce'] },
        visgen: { name: 'mdz_vision_gen', frag: VISGEN_FRAG, uniforms: [] },
        viscomp: { name: 'mdz_vision_comp', frag: VISCOMP_FRAG, uniforms: ['uVisA', 'uVisB', 'uVisC', 'uVisD'] }
    };

    // Layers whose sprites cast shadows: things standing up in the world.
    // (Buildings keep the game's own drawn shadows; Survivors2 holds bodies
    // lying down; items and ground decals are flat.)
    const CASTERS = ['Trees', 'Forests', 'vehicles', 'Zeds', 'Obstacle_enviroment', 'Buildings_bg', 'Buildings',
        'player', 'player_pants', 'player_hands', 'player_clothing', 'player_vests', 'player_helmets', 'player_backpacks', 'player_weapons',
        'Survivors', 'S_pants', 'S_clothing', 's_vests', 's_helmets', 's_backpack', 's_weapons'];
    // A character is several sprites stacked in one box (body, pants, hands,
    // clothing...): they all take the lowest foot found at that spot.
    const PART_LAYERS = { player: 1, player_pants: 1, player_hands: 1, player_clothing: 1, player_vests: 1, player_helmets: 1, player_backpacks: 1, player_weapons: 1,
        Survivors: 1, S_pants: 1, S_clothing: 1, s_vests: 1, s_helmets: 1, s_backpack: 1, s_weapons: 1 };
    // the tap-to-move walk marker; doors (part of a building's wall), bridge
    // pieces (flat), quest icons, crash/city markers
    const NO_SHADOW_TYPES = { t506: 1, t349: 1, t977: 1, t828: 1, t404: 1, t344: 1, t434: 1, t974: 1 };
    // The game has no depth sorting: it moves scenery between Buildings_bg
    // (under the player) and Buildings (over the player) by where the LOCAL
    // player stands. So whether something casts can't follow its layer, or
    // shadows pop on and off as you walk round a car. A building's roof sits
    // exactly on its floor piece in Buildings_base, and that floor carries the
    // game's own drawn shadow (Buildings_shadows): those never cast ours.
    const FLIP_LAYERS = { Buildings: 1, Buildings_bg: 1 };
    // frames that are not a solid object: the generator's range ring, the
    // player's breath in the cold (it also changes every frame)
    // Glows are light, not objects: bot/companion lights, item light, tower
    // beam, car headlights (light_b- is a street lamp and stays)
    const NO_SHADOW_IMG = /^fadianji-sheet2|^player_breathe|^light_(?!b-)|^car_light/;
    // the blue night-vision tile of the NVG P45 item (added to the APK build's data.js)
    const NVG_P45_TILE = 't1433';
    const WALL_H = 50;      // height given to long top-down strips (walls, fences)
    const CAR_H = 22, BIG_VEHICLE_H = 30;   // cars are drawn from above: their shadow is their outline swept this high
    const BUILDING_H = 44;  // and so are building roofs
    // bullets, pellets, arrows, shells, the flare rocket: never a shadow
    const PROJECTILE_RE = /bullet|pellet|test_shell|arrow_bullet|flare_gun_rocket/;
    const CAR_RE = /^car_|^car\d_x|^kacar/;
    // light-source shadows: people, zombies and animals only
    const ENTITY_CAST = Object.assign({ Zeds: 1, Survivors2: 1 }, PART_LAYERS);
    // casters that move by themselves: drawn every frame over the cached rest
    const DYN_LAYERS = Object.assign({ Zeds: 1, Survivors2: 1, vehicles: 1 }, PART_LAYERS);
    const imageName = inst => ((inst.mc && inst.mc.N && inst.mc.N.src) || '').split('/').pop();
    function casterKind(inst) {
        const t = inst.type;
        if (t.__mdzCast !== undefined) return t.__mdzCast;
        const n = imageName(inst);
        if (!n) return 'stand';   // not known yet: ask again next frame
        t.__mdzBox = /btr|truck|hammer/.test(n) ? BIG_VEHICLE_H : CAR_H;
        return (t.__mdzCast = PROJECTILE_RE.test(n) ? 'none' : CAR_RE.test(n) ? 'car' : 'stand');
    }
    const replacePainted = () => cfg.cleanShadows !== false;

    // ---------------------------------------------------------------
    // Runtime access (2.3.3 obfuscated names, verified against c2runtime.js)
    //   runtime.H glwrap, .wa running layout, .X redraw flag
    //   layout.ua layers, layout.el() its render target
    //   layer.Ca/Da/Ha/Ga view left/top/right/bottom, .Lc() scale, .ib() angle
    //   glwrap: .T gl, .tb programs, .gj current program, .gp matP,
    //   .Vk create program, .hf flush batch, .ld switch program,
    //   .le set render target, .clear, .wc set texture, .wh set blend,
    //   .ay default blend, .Oe opacity, .Yv fullscreen quad, .dk quad,
    //   .Cd quad with a UV rect, .ke/.scale/.Kp/.translate/.Wd modelview,
    //   .td create empty texture, .deleteTexture
    //   layout.nb / layer.nb draw, layer.mq viewport update for a skipped layer
    //   sprite: .$n texture, .mc frame (.jk on a sheet, .Ct its UV rect),
    //   .Wb quad (eb,fb tl  Kb,Lb tr  yb,zb br  wb,xb bl), .la() refresh it
    // ---------------------------------------------------------------
    const runtime = () => (typeof window.cr_getC2Runtime === 'function' ? window.cr_getC2Runtime() : null);
    const glwOf = rt => rt && (rt.H || rt.glwrap) || null;
    const layoutOf = rt => rt && (rt.wa || rt.running_layout) || null;
    const layersOf = L => L && (L.ua || L.layers) || [];
    const instancesOf = t => t && (t.instances || t.q) || [];
    const typesOf = rt => rt && (rt.S || rt.types_by_index) || [];
    const GLW_NEEDS = ['Vk', 'hf', 'ld', 'le', 'clear', 'wc', 'wh', 'ay', 'Oe', 'Yv', 'dk', 'Cd', 'ke', 'scale', 'Kp', 'translate', 'Wd', 'td', 'deleteTexture', 'OG'];

    const S = {
        installed: false, error: '', shadowError: '', frames: 0, shadowFrames: 0, shadowCount: 0,
        gradeDone: false, shadowDone: false, fs: null,
        progs: {}, texs: {},
        layoutRef: null, boundary: null, shadowBoundary: null, casters: [], playerLayer: null, nvgLayer: null,
        globals: null, globalsAt: 0, player: null, playerAt: 0,
        rain: 0, hour: 12, lastT: 0, t0: performance.now(),
        camX: null, camY: null, rayAcross: 0, rayAlong: 0,
        debug: false, debugDrawn: null, lastDrawn: [],
        wet: 0, snow: 0, snowing: false, winter: 0, cold: 0, flash: 0, strikeAt: 0, nextStrike: 0, wetError: '', waterError: '', waterTypes: null, waterDrawn: 0,
        qCap: 2, paceT: 0, paceSlow: 0, fpsAvg: 0,
        windT: 0, windNow: 0, windOff: false, windError: '', windTypesMarked: false, spriteHooked: false, tilemapHooked: false
    };

    function globalsList(rt) {
        if (!rt) return [];
        if (Array.isArray(rt.all_global_vars)) return rt.all_global_vars;
        for (const key of Object.keys(rt)) {
            const a = rt[key];
            if (Array.isArray(a) && a.length > 20 && a.every(v => v && typeof v.name === 'string' && Object.prototype.hasOwnProperty.call(v, 'data'))) return a;
        }
        return [];
    }
    function readGlobals(rt, now) {
        // Saves replace the records, so look them up again every couple of seconds.
        if (!S.globals || now - S.globalsAt > 2000) {
            const want = { Timer_ALL: 1, Timer_Hours: 1, Timer_Minutes: 1, Rain: 1, Player_temperature: 1, helpmenu_on: 1, Inventory_opened: 1, perkmenu_on: 1, menu_achieves_open: 1 };
            S.globals = {};
            for (const g of globalsList(rt)) if (want[g.name]) S.globals[g.name] = g;
            S.globalsAt = now;
        }
        return S.globals;
    }
    function gameHour(rt, now) {
        const g = readGlobals(rt, now);
        if (g.Timer_ALL && isFinite(+g.Timer_ALL.data)) return (((+g.Timer_ALL.data) % 1440) + 1440) % 1440 / 60;
        if (g.Timer_Hours) return (+g.Timer_Hours.data || 0) + (+(g.Timer_Minutes && g.Timer_Minutes.data) || 0) / 60;
        return 12;
    }
    // The local player (t193 moves; remote-player dolls are marked by the MP mod).
    function localPlayer(rt, now) {
        if (S.player && now - S.playerAt < 1000 && !S.player.dead) return S.player;
        S.playerAt = now; S.player = null;
        const t = typesOf(rt).find(x => x && x.name === 't193');
        for (const i of instancesOf(t)) if (i && !i.__mdzRemoteVisual && !i.__mdzHurtbox) { S.player = i; break; }
        return S.player;
    }
    function resolveLayers(L) {
        if (S.layoutRef === L) return;
        S.layoutRef = L; S.boundary = null; S.shadowBoundary = null; S.casters = []; S.playerLayer = null; S.nvgLayer = null;
        if (!L || L.name !== 'Map') return;
        const layers = layersOf(L), byName = n => layers.find(l => l.name === n) || null;
        // the grade runs right after the game's own lighting layers
        S.boundary = byName('Sunset_Dawn') || byName('Color_effect') || byName('night');
        // shadows go over the ground, items and building floors
        S.shadowBoundary = byName('Buildings_base_top') || byName('items_on_ground');
        // puddles go on the terrain only
        // the last ground layer before the ground details (grass, rocks, stumps
        // in ground_enviroment) - those, water, floors and items cover the wet
        {
            const ge = byName('ground_enviroment');
            S.wetBoundary = (ge && layers.filter(l => l.index < ge.index).pop()) || byName('asphalt');
        }
        // ripples and glints on what the Water layer drew
        S.waterBoundary = byName('Water');
        S.casters = CASTERS.map(byName).filter(Boolean);
        S.baseLayer = byName('Buildings_base');
        S.playerLayer = byName('player') || byName('Trees');
        S.entLayers = ENTITY_LAYERS.map(byName).filter(Boolean);
        S.groundLayer = byName('bg');
        S.printLayer = byName('sand') || S.groundLayer;
        S.treesLayer = byName('Trees');
        S.flySpots = null;
        S.nvgLayer = byName('nvg');
    }

    // ---------------------------------------------------------------
    // GL programs + textures
    // ---------------------------------------------------------------
    function buildProgram(glw, key) {
        const gl = glw.T, def = PROGRAMS[key], old = S.progs[key], q = Q();
        glw.hf(); // run everything queued against the current program first
        // (params: float uniforms p0.. the engine sets inside its draw batch)
        const ea = def.params ? Array.from({ length: def.params }, (_, i) => ['p' + i]) : [];
        const prog = glw.Vk({ src: def.frag(q), ea }, glw.Ya ? VERT3 : VERT2, def.name);
        // Vk leaves the new program bound; matP is otherwise only sent on resize.
        if (prog.Sw) gl.uniformMatrix4fv(prog.Sw, false, glw.gp);
        const loc = {};
        for (const u of def.uniforms) loc[u] = gl.getUniformLocation(prog.Gm, u);
        // put the engine's program back so its cached state is true again
        const cur = glw.gj || glw.tb[glw.Al] || glw.tb[0];
        if (cur) gl.useProgram(cur.Gm);
        let idx;
        if (old && glw.tb[old.idx] === old.prog) {
            idx = old.idx;
            if (glw.Al === idx) { glw.ld(0); glw.hf(); }
            glw.tb[idx] = prog;
            try { gl.deleteProgram(old.prog.Gm); } catch (e) {}
        } else {
            glw.tb.push(prog);
            idx = glw.tb.length - 1;
        }
        return (S.progs[key] = { prog, idx, loc, quality: q });
    }
    // quality in use: the chosen one, or lower while the game runs slow
    const Q = () => Math.max(0, Math.min(cfg.quality, S.qCap));
    // ---------------------------------------------------------------
    // Device tier from the GPU name. 0 Low, 1 Medium, 2 High.
    //   Adreno: 8xx, 720+ (SD 8 Gen 1+), 640+ (SD 855+) High; 620-630, 710, 618/619,
    //           530/540 Medium; older (610/612/613/616, 505-512, 3xx/4xx) Low
    //   Mali: Immortalis, G1-Ultra/Premium, G710+, G78 High; G610/G615, G68, G76/G77,
    //         G1-Pro Medium; G57, G52, G51, G31, G71/G72, T-series, 4xx Low
    //   Xclipse (Exynos), Maleoon (Kirin), Apple High; PowerVR BXM Medium, GE/GM Low
    //   desktop GPUs High (old Intel HD Medium); software rendering Low
    // then capped by memory (<= 2 GB Low, <= 3 GB Medium) and cores (phones with <= 4: Medium).
    // ---------------------------------------------------------------
    function gpuName(gl) {
        try {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
        } catch (e) { return ''; }
    }
    function gpuTier(name) {
        const n = String(name || ''), N = n.toLowerCase();
        let m;
        if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(N)) return { tier: 0, family: 'software' };
        if ((m = N.match(/adreno[^0-9]*(\d{3})/))) {
            const v = +m[1];
            const t = v >= 800 ? 2 : v >= 720 ? 2 : v >= 700 ? (v >= 710 ? 1 : 0) : v >= 640 ? 2 : v >= 620 ? 1 : v >= 618 ? 1 : v >= 600 ? 0 : v >= 530 ? 1 : 0;
            return { tier: t, family: 'Adreno ' + v };
        }
        if (/immortalis/.test(N)) return { tier: 2, family: 'Immortalis' };
        if ((m = N.match(/mali-g1[- ]?(ultra|premium|pro)?/)) && !/mali-g1\d/.test(N)) return { tier: m[1] === 'pro' ? 1 : 2, family: 'Mali-G1' + (m[1] ? ' ' + m[1] : '') };
        if ((m = N.match(/mali-g(\d+)/))) {
            const v = +m[1];
            const t = v >= 710 ? 2 : v >= 610 ? 1 : v === 78 ? 2 : (v === 76 || v === 77 || v === 68) ? 1 : 0;
            return { tier: t, family: 'Mali-G' + v };
        }
        if (/mali/.test(N)) return { tier: 0, family: 'Mali (old)' };
        if (/xclipse/.test(N)) return { tier: 2, family: 'Xclipse' };
        if (/maleoon/.test(N)) return { tier: 2, family: 'Maleoon' };
        if (/powervr|img /.test(N)) return { tier: /bxm|dxt|cxt/.test(N) ? 1 : 0, family: 'PowerVR' };
        if (/apple/.test(N)) return { tier: 2, family: 'Apple' };
        if (/intel/.test(N)) return { tier: /hd graphics(?! 6)/.test(N) && !/uhd|iris|arc/.test(N) ? 1 : 2, family: 'Intel' };
        if (/nvidia|geforce|quadro|rtx|gtx|radeon|amd/.test(N)) return { tier: 2, family: /nvidia|geforce|rtx|gtx|quadro/.test(N) ? 'NVIDIA' : 'AMD' };
        return { tier: isMobile ? 1 : 2, family: 'unknown' };
    }
    function detectTier(gl) {
        const name = gpuName(gl), g = gpuTier(name);
        let tier = g.tier, why = g.family;
        const mem = +navigator.deviceMemory || 0, cores = +navigator.hardwareConcurrency || 0;
        if (mem && mem <= 2 && tier > 0) { tier = 0; why += ', ' + mem + ' GB'; }
        else if (mem && mem <= 3 && tier > 1) { tier = 1; why += ', ' + mem + ' GB'; }
        if (isMobile && cores && cores <= 4 && tier > 1) { tier = 1; why += ', ' + cores + ' cores'; }
        return { tier, gpu: name, family: g.family, why, mem, cores };
    }
    // Apply on first launch - and once for a saved setup that never changed
    // its quality or frame limit from the old defaults.
    function applyTier(info, force) {
        const untouched = cfg.quality === (isMobile ? 1 : 2) && cfg.fpsCap === (isMobile ? 60 : 0);
        if (!force && (cfg.tierDetected || !untouched)) { cfg.tierDetected = true; return false; }
        cfg.quality = info.tier;
        if (isMobile) cfg.fpsCap = [30, 45, 60][info.tier];
        cfg.tierDetected = true;
        S.qCap = 2; S.paceSlow = 0; S.fpsAvg = 0;
        saveCfg();
        console.log('[MDZ Lighting] device: ' + (info.gpu || '?') + ' -> ' + ['Low', 'Medium', 'High'][info.tier] + ' (' + info.why + ')');
        return true;
    }
    // Frame pacing on the Map: below ~40 fps for 6 s steps the quality down
    // one level (runtime only - the saved choice is untouched and a new
    // choice starts over). Frames after a pause or a hidden tab don't count.
    function paceQuality(now) {
        const dt = now - (S.paceT || now); S.paceT = now;
        if (!cfg.autoQuality || !(dt > 0) || dt > 250 || Q() <= 0) { if (dt > 250) S.paceSlow = 0; return; }
        S.fpsAvg = S.fpsAvg ? S.fpsAvg * 0.95 + (1000 / dt) * 0.05 : 1000 / dt;
        if (S.fpsAvg < 40) S.paceSlow += dt; else S.paceSlow = Math.max(0, S.paceSlow - dt);
        if (S.paceSlow > 6000) {
            S.qCap = Q() - 1; S.paceSlow = 0; S.fpsAvg = 0;
            console.log('[MDZ Lighting] running slow: quality ' + S.qCap);
        }
    }
    function program(glw, key) {
        const p = S.progs[key];
        if (!p || glw.tb[p.idx] !== p.prog || p.quality !== Q()) return buildProgram(glw, key);
        return p;
    }
    function texture(glw, key, w, h, linear) {
        const t = S.texs[key];
        if (t && t.w === w && t.h === h) return t.tex;
        if (t) { try { glw.deleteTexture(t.tex); } catch (e) {} }
        const tex = glw.td(w, h, !!linear, false, false);
        S.texs[key] = { tex, w, h };
        return tex;
    }

    // ---------------------------------------------------------------
    // Per-frame state, worked out once when the layout starts drawing
    // ---------------------------------------------------------------
    const wrap = (v, p) => ((v % p) + p) % p;
    const FOG_CELL = 360;   // world px per fog noise cell
    const RAY_BAND = 110;   // world px per shaft band
    function frameState(rt, now) {
        const dt = Math.min(0.1, Math.max(0, (now - (S.lastT || now)) / 1000)); S.lastT = now;
        const hour = cfg.hour !== null && cfg.hour !== undefined && isFinite(cfg.hour) ? +cfg.hour : gameHour(rt, now);
        S.hour = hour;
        const g = readGlobals(rt, now);
        const rainNow = cfg.weather && g.Rain && +g.Rain.data > 0 ? 1 : 0;
        S.rain += (rainNow - S.rain) * Math.min(1, dt * 0.5); // ease over a couple of seconds
        // Snow: on the winter island the game's Rain drops snow_ground (t489)
        // where it elsewhere drops rain_ground (t375). Looked up twice a second;
        // the last answer holds while nothing is falling.
        if (rainNow && now - (S.snowAt || 0) > 500) {
            S.snowAt = now;
            if (!S.fallTypes || S.fallTypesRt !== rt) {
                S.fallTypesRt = rt;
                const ts = typesOf(rt);
                S.fallTypes = { snow: ts.find(x => x && x.name === 't489') || null, rain: ts.find(x => x && x.name === 't375') || null };
            }
            const sn = instancesOf(S.fallTypes.snow).length, rn = instancesOf(S.fallTypes.rain).length;
            if (sn || rn) S.snowing = sn > rn;
        }
        S.snow += ((S.snowing ? 1 : 0) - S.snow) * Math.min(1, dt * 0.5);
        // the ground soaks over ~20 s of rain and dries over ~60 s (snow makes no puddles)
        S.wet = clamp01(S.wet + (rainNow && !S.snowing ? dt / 20 : -dt / (S.snowing ? 15 : 60)));
        // lightning in heavy rain: a double flicker every 8-30 s
        const t = (now - S.t0) / 1000;
        let flash = 0;
        if (cfg.weather && cfg.lightning && S.rain > 0.6 && !S.snowing) {
            if (!S.nextStrike || S.nextStrike < t - 60) S.nextStrike = t + 6 + Math.random() * 18;
            if (t >= S.nextStrike) { S.strikeAt = t; S.nextStrike = t + 8 + Math.random() * 22; }
        }
        if (S.strikeAt) {
            const d = t - S.strikeAt;
            flash = d < 0 ? 0 : d < 0.07 ? 1 : d < 0.14 ? 0.25 : d < 0.22 ? 0.75 : 0.75 * Math.exp(-(d - 0.22) * 6);
            if (flash < 0.005) flash = 0;
        }
        S.flash = flash * (0.55 + 0.45 * lampAmount(hour));
        // the snow island (its ground is ground_lvl5_tilemap): winter eases in and out
        const pl = localPlayer(rt, now);
        S.winter += ((pl && inWinterRegion(rt, pl.x, pl.y) ? 1 : 0) - S.winter) * Math.min(1, dt * 0.6);
        if (S.winter < 0.002) S.winter = 0;
        // body temperature: the HUD's number, below 0 is cold ("I'm very cold" about -9)
        const temp = g.Player_temperature ? +g.Player_temperature.data : 0;
        S.temp = isFinite(temp) ? temp : 0;
        S.cold += (clamp01((-S.temp - 2) / 13) - S.cold) * Math.min(1, dt * 0.4);
        try { updateHurt(rt, now, dt); } catch (e) { S.caAmt = 0; }
        return { now, dt, t: (now - S.t0) / 1000, hour, k: lookAt(hour), dir: lightDir(hour), rain: S.rain };
    }
    // Colour split on a hit and at low blood. The player's blood is t181's
    // instance variable 15 (0-100: the game greys the screen by 50 - blood
    // below 50); a hit is the game's Hit_effect layout effect flashing on, or
    // the blood dropping.
    function updateHurt(rt, now, dt) {
        if (!(cfg.aberration > 0)) { S.caAmt = 0; return; }
        const me = localPlayer(rt, now);
        if (!S.body || now - S.bodyAt > 2000 || !S.body.cc) {
            S.bodyAt = now; S.body = null;
            let best = 1e9;
            for (const i of instancesOf(typesOf(rt).find(x => x && x.name === 't181'))) {
                if (!i || !i.cc || i.__mdzRemoteVisual) continue;
                const d = me ? Math.hypot(i.x - me.x, i.y - me.y) : 0;
                if (d < best) { best = d; S.body = i; }
            }
        }
        const b = S.body ? +S.body.cc[15] : NaN, blood = isFinite(b) ? b : null;
        const L = layoutOf(rt);
        let hitFx = 0;
        if (L && Array.isArray(L.Qa) && Array.isArray(L.ob)) {
            if (S.hitFxLayout !== L) { S.hitFxLayout = L; S.hitFxIdx = L.Qa.findIndex(e => e && e.name === 'Hit_effect'); }
            const pr = S.hitFxIdx >= 0 ? L.ob[S.hitFxIdx] : null;
            hitFx = pr ? +pr[0] || 0 : 0;
        }
        // (a drop of 3+ at once: slow drains - bleeding, cold, hunger - are not hits)
        const hit = (hitFx > 0.01 && !(S.hitFxLast > 0.01)) || (blood !== null && S.bloodLast !== null && S.bloodLast !== undefined && blood < S.bloodLast - 3);
        S.hitFxLast = hitFx; S.bloodLast = blood;
        if (hit) S.hitPulse = 1;
        S.hitPulse = Math.max(0, (S.hitPulse || 0) - dt / 0.7);   // lingers past the game's own grey hit flash (0.2 s)
        // low blood: from 45 down, full at 10; nothing once dead
        const low = blood !== null && blood > 0 ? clamp01((45 - blood) / 35) : 0;
        const t = (now - S.t0) / 1000;
        const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * (1.1 + 0.9 * low))), 6);   // a heartbeat, faster as it gets worse
        const amt = Math.min(2, cfg.aberration) * (0.011 * smooth(S.hitPulse) + 0.0065 * low * (0.45 + 0.55 * beat));
        S.caAmt = amt > 0.00002 ? amt : 0;
        S.blood = blood;
    }
    // Light sources: kind -> colour, radius (world px), flicker
    const LIGHT_KIND = {
        fire: { col: [1.0, 0.55, 0.18], r: 230, i: 1.0, flick: 0.22 },
        small: { col: [1.0, 0.62, 0.25], r: 150, i: 0.85, flick: 0.25 },
        flare: { col: [1.0, 0.22, 0.12], r: 330, i: 1.2, flick: 0.12 },
        flash: { col: [1.0, 0.78, 0.28], r: 95, i: 0.6, flick: 0.0, fade: true },
        lamp: { col: [1.0, 0.78, 0.45], r: 200, i: 0.8, flick: 0.03 }
    };
    const LIGHT_TYPES = {
        t900: 'fire', t901: 'small', t262: 'fire', t284: 'fire', t864: 'fire', t902: 'fire', t904: 'fire', t1018: 'small', // flames, fireplaces, molotov, lighter
        t265: 'flare', t924: 'flare',       // flares
        t263: 'flash',                      // muzzle flash
        t1239: 'lamp'                       // built lamp (t1237 is the lamp lying as an item - never lit)
    };
    // Sources that exist unlit: only a lit one gives light.
    //  campfire kit t262: plays "on" either way; var0 = 1 once lit with matches
    //  lamp t1239: dianli() gives frame 1 (and spawns its t1240 glow) only
    //  while it stands on a generator whose var5 = 888 (running)
    const LIGHT_ON = {
        t262: i => Number((i.cc || i.instance_vars || [])[0]) === 1,
        t1239: i => Number(i.Y !== undefined ? i.Y : i.cur_frame) === 1
    };
    // how much the lights show: full at night, fading through dusk and dawn
    function lampAmount(h) {
        h = ((h % 24) + 24) % 24;
        if (h >= 21.5 || h < 4.5) return 1;
        if (h < 7.5) return 1 - smooth((h - 4.5) / 3);
        if (h >= 17.5) return smooth((h - 17.5) / 4);
        return 0;
    }
    const lightBuf = { pos: new Float32Array(48), col: new Float32Array(36), n: 0 };
    S.lightWorld = [];   // { x, y, r, s } of the lights in use this frame
    function gatherLights(rt, fs, vl, vt, spanX, spanY) {
        lightBuf.n = 0;
        S.lightWorld = [];
        S.lightsFrame = S.frameNo;
        const amt = lampAmount(fs.hour) * cfg.lamps;
        if (amt < 0.01 || !spanX || !spanY) return;
        if (!S.lightTypes || S.lightTypesRt !== rt) {
            S.lightTypesRt = rt;
            S.lightTypes = typesOf(rt).filter(t => t && LIGHT_TYPES[t.name]).map(t => ({ t, kind: LIGHT_KIND[LIGHT_TYPES[t.name]], on: LIGHT_ON[t.name] }));
        }
        const cx = vl + spanX / 2, cy = vt + spanY / 2, found = [];
        for (const { t, kind, on } of S.lightTypes) for (const i of instancesOf(t)) {
            if (!i || !i.visible || !(i.opacity > 0.05)) continue;
            if (on && !on(i)) continue;
            const r = kind.r;
            if (i.x < vl - r || i.x > vl + spanX + r || i.y < vt - r || i.y > vt + spanY + r) continue;
            found.push({ i, kind, d: Math.hypot(i.x - cx, i.y - cy) });
        }
        found.sort((a, b) => a.d - b.d);
        const max = Q() >= 1 ? 12 : 8;
        for (const f of found.slice(0, max)) {
            const k = f.kind, j = lightBuf.n;
            // flicker: two quick waves, phase from the position so fires differ
            const ph = f.i.x * 0.37 + f.i.y * 0.11;
            const fl = 1 - k.flick * (0.5 + 0.5 * Math.sin(fs.t * 9.1 + ph)) * (0.6 + 0.4 * Math.sin(fs.t * 23.7 + ph * 1.7));
            lightBuf.pos[j * 4] = (f.i.x - vl) / spanX;
            lightBuf.pos[j * 4 + 1] = (f.i.y - vt) / spanY;
            lightBuf.pos[j * 4 + 2] = k.r * (0.94 + 0.06 * fl) / spanY;
            lightBuf.pos[j * 4 + 3] = k.i * amt * fl * (k.fade ? Math.min(1, f.i.opacity) : 1);
            lightBuf.col[j * 3] = k.col[0]; lightBuf.col[j * 3 + 1] = k.col[1]; lightBuf.col[j * 3 + 2] = k.col[2];
            lightBuf.n++;
            S.lightWorld.push({ x: f.i.x, y: f.i.y, r: k.r, s: lightBuf.pos[j * 4 + 3] });
        }
    }
    function gradeValues(rt, glw, fs) {
        const { k, t, dt, dir, rain: r, now } = fs;
        const pl = S.playerLayer;
        const vl = pl ? pl.Ca : 0, vt = pl ? pl.Da : 0;
        const spanX = pl ? (pl.Ha - pl.Ca) : glw.width, spanY = pl ? (pl.Ga - pl.Da) : glw.height;

        // colour
        // overcast: rain greys, snow whitens
        const sw = S.snow || 0;
        const tint = k.tint.map((v, i) => lerp(v, lerp([0.90, 0.95, 1.0][i], [0.97, 1.0, 1.05][i], sw), r * 0.5));
        const sat = k.sat * (1 - 0.35 * r);
        // shafts: the camera's movement is added up along the band axes (not
        // its absolute position - that would make the bands race sideways as
        // the sun angle turns through the day), wrapped every 64 bands
        const perp = [-dir[1], dir[0]];
        const cx = vl + spanX / 2, cy = vt + spanY / 2;
        if (S.camX !== null) {
            const dx = cx - S.camX, dy = cy - S.camY;
            if (Math.abs(dx) + Math.abs(dy) < 3000) { // not a teleport
                S.rayAcross = wrap(S.rayAcross + (dx * perp[0] + dy * perp[1]) / RAY_BAND, 64);
                S.rayAlong = wrap(S.rayAlong + (dx * dir[0] + dy * dir[1]) / (RAY_BAND * 4), 64);
            }
        }
        S.camX = cx; S.camY = cy;
        S.rayAlong = wrap(S.rayAlong + dt * 0.04, 64);
        const across = wrap(S.rayAcross + Math.sin(t * 0.07) * 0.35, 64), along = S.rayAlong;
        const rays = k.rays * cfg.rays * (1 - r);
        // player light
        let lx = 0.5, ly = 0.5;
        const p = localPlayer(rt, now);
        if (p && pl && spanX && spanY) { lx = (p.x - vl) / spanX; ly = (p.y - vt) / spanY; }
        // night vision paints its own green: keep only a hint of the grade
        if (S.lightsFrame !== S.frameNo) gatherLights(rt, fs, vl, vt, spanX, spanY);
        let mixAmt = clamp01(cfg.strength);
        // the game's NVG tile is t707; the P45 item (APK build) adds a blue tile t1433
        let nvgOn = false, p45On = false;
        if (S.nvgLayer) for (const i of instancesOf(S.nvgLayer)) {
            if (!i || !i.visible || !i.type) continue;
            if (i.type.name === 't707') nvgOn = true;
            else if (i.type.name === NVG_P45_TILE) { nvgOn = true; p45On = true; }
        }
        S.nvgNow = (S.nvgNow || 0) + ((nvgOn ? 1 : 0) - (S.nvgNow || 0)) * Math.min(1, (fs.dt || 0.016) * 6);
        if (nvgOn) S.nvgP45 = p45On ? 1 : 0;   // the tint follows the goggles last seen on
        if (S.nvgNow < 0.002) S.nvgNow = 0;
        // our own look replaces the game's green; with it off, the game's shows
        // through a lighter grade as before
        if (nvgOn && !(cfg.nvg > 0)) mixAmt *= 0.25;

        return {
            uGradeA: [tint[0], tint[1], tint[2], k.exp],
            uGradeB: [k.lift[0], k.lift[1], k.lift[2], sat],
            uGradeC: [k.con, k.vig * cfg.vignette, k.grain * cfg.grain, wrap(Math.floor(t * 24) * 7.13, 64)],
            uRayA: [across, along, dir[0], dir[1]],
            uRayB: [rays, spanX, spanY, RAY_BAND],
            uRayCol: k.rayCol,
            uLight: [lx, ly, 0.30, k.pool * cfg.light],
            uScreen: [glw.width / Math.max(1, glw.height), 1, mixAmt, 0]
        };
    }

    // ---------------------------------------------------------------
    // Where a sprite really touches the ground: most images have a few empty
    // rows under the foot (10 px under the common tree), and the shadow has to
    // start at the foot, not at the bottom of the image. Measured once per
    // animation frame from the frame's own image (frame.N, sheet offset
    // Wj/Xj) and kept on the frame; only a few new frames per draw so a busy
    // scene never hitches. Until measured (or if the image cannot be read)
    // the bottom of the image is used.
    // ---------------------------------------------------------------
    const FOOT_SCANS_PER_FRAME = 12;
    let footBudget = 0, footCanvas = null, footCtx = null;
    function footGap(frame) {
        const known = frame.__mdzFoot;
        if (known !== undefined) return known;
        if (footBudget <= 0) return 0;
        footBudget--;
        let gap = 0;
        try {
            const img = frame.N, w = frame.width | 0, h = frame.height | 0;
            if (img && w > 0 && h > 0 && w * h <= 1 << 20) {
                if (!footCanvas) { footCanvas = document.createElement('canvas'); footCtx = footCanvas.getContext('2d', { willReadFrequently: true }); }
                footCanvas.width = w; footCanvas.height = h;
                footCtx.clearRect(0, 0, w, h);
                footCtx.drawImage(img, frame.jk ? frame.Wj : 0, frame.jk ? frame.Xj : 0, w, h, 0, 0, w, h);
                const d = footCtx.getImageData(0, 0, w, h).data;
                let y = h - 1;
                // the solid art: a painted shadow (alpha 89-115) is not the foot
                search: for (; y >= 0; y--) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 140) break search;
                gap = y < 0 ? 0 : (h - 1 - y) / h;
            }
        } catch (e) { gap = 0; } // unreadable image: keep the image bottom
        frame.__mdzFoot = gap;
        return gap;
    }
    // Where a sprite's bulk starts above its foot (the crown of a tree, the
    // platform of a tower), as a fraction of the frame height; 0 for things
    // that are solid down to the ground (people, rocks, bushes).
    function crownGap(frame) {
        const known = frame.__mdzCrown;
        if (known !== undefined) return known;
        if (footBudget <= 0) return 0;
        footBudget--;
        let crown = 0;
        try {
            const img = frame.N, w = frame.width | 0, h = frame.height | 0;
            if (img && w > 0 && h > 0 && w * h <= 1 << 20) {
                if (!footCanvas) { footCanvas = document.createElement('canvas'); footCtx = footCanvas.getContext('2d', { willReadFrequently: true }); }
                footCanvas.width = w; footCanvas.height = h;
                footCtx.clearRect(0, 0, w, h);
                footCtx.drawImage(img, frame.jk ? frame.Wj : 0, frame.jk ? frame.Xj : 0, w, h, 0, 0, w, h);
                const d = footCtx.getImageData(0, 0, w, h).data;
                // Where the mass is: the crown bottom is the row above which 85% of
                // the solid pixels lie. Works for a lone tree (thin trunk) and for
                // a cluster (tree_block: trunks spread across the width, pines'
                // lower branches, grass tufts at the foot) alike.
                const cnt = new Array(h).fill(0);
                let tot = 0, footRow = -1;
                for (let y = 0; y < h; y++) {
                    let n = 0;
                    for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 140) n++;
                    cnt[y] = n; tot += n;
                    if (n) footRow = y;
                }
                if (footRow > 0 && tot > 40) {
                    let acc = 0, y = 0;
                    for (; y < h; y++) { acc += cnt[y]; if (acc >= tot * 0.85) break; }
                    const c = (footRow - y) / h;
                    crown = c > 0.1 ? c : 0;
                }
            }
        } catch (e) { crown = 0; }
        frame.__mdzCrown = crown;
        return crown;
    }

    // ---------------------------------------------------------------
    // Wind. Chosen plants - sprites by type, and tiles of the ground
    // tilemap by tile id - are drawn as a stack of thin strips instead of one
    // quad. Each strip slides sideways by a weight that is 0 at the foot and
    // grows towards the top (a height "weight paint", weight = h^pow), so
    // trunks stay put while crowns and grass tips bend. Neighbours share one
    // travelling wave with slow gusts, stronger in rain. A swaying sprite's
    // shadow bends the same way.
    // ---------------------------------------------------------------
    const SWAY_SPRITES = {
        // tree_leaves, tree_leaves_2, tree_leaves_new2, tree_leaves_new3, tree_block,
        // ee_predator_tree, ee_strange_tree / tree_pine, tree_pine2 / berry_bush
        t207: 'tree', t209: 'tree', t577: 'tree', t581: 'tree', t210: 'tree', t972: 'tree', t699: 'tree',
        t184: 'pine', t576: 'pine',
        t296: 'berry',
        t559: 'crop', t560: 'crop', t561: 'crop'   // garden: pepper, squash, tomato
    };
    // ground_enviroment_tilemap.png (30 px tiles, 5 per row): grass tufts,
    // tall grass and reeds, red flowers, green bushes, snowy bushes
    const SWAY_TILEMAP = 't230';
    const SWAY_TILES = { 22: 'grass', 46: 'grass', 50: 'grass', 60: 'grass', 61: 'grass', 62: 'grass', 25: 'reed', 36: 'reed', 32: 'flower',
        26: 'bush', 27: 'bush', 28: 'bush', 29: 'bush', 75: 'snowbush', 76: 'snowbush', 77: 'snowbush', 78: 'snowbush' };
    //   per100 px of sway at the top per 100 px of height (sprites), px (tiles),
    //   strips, pow (how much the top bends over the bottom), speed
    const SWAY_KIND = {
        tree: { per100: 2.6, strips: 6, pow: 2.0, speed: 0.8 },
        pine: { per100: 2.0, strips: 6, pow: 2.2, speed: 0.75 },
        berry: { per100: 5.0, strips: 3, pow: 1.4, speed: 1.1 },
        crop: { per100: 6.0, strips: 3, pow: 1.4, speed: 1.25 },
        grass: { px: 1.8, strips: 3, pow: 1.3, speed: 1.4 },
        reed: { px: 2.4, strips: 4, pow: 1.5, speed: 1.2 },
        flower: { px: 1.6, strips: 3, pow: 1.3, speed: 1.3 },
        bush: { px: 1.3, strips: 3, pow: 1.4, speed: 1.0 },
        snowbush: { px: 0.6, strips: 3, pow: 1.4, speed: 0.9 }
    };
    function windWave(x, y, speed) {
        const s = S.windT * speed;
        const wave = Math.sin(s * 1.9 + x * 0.013 + y * 0.005) * 0.55 + Math.sin(s * 3.3 + x * 0.029 - y * 0.011) * 0.2;
        const gust = 0.5 + 0.5 * Math.sin(s * 0.37 + x * 0.0019 - y * 0.0011);
        return (0.3 + wave) * (0.45 + 0.55 * gust); // leans downwind, wobbles, gusts roll across
    }
    const swaySprite = (inst, kind, hh) => Math.max(1, kind.per100 * hh / 100) * S.windNow * windWave(inst.x, inst.y, kind.speed);
    // Draws quad P (tl, tr, br, bl as x,y) textured by UV (same order) as n
    // strips from top to bottom; map(x, y, h) puts each strip corner, h being
    // its height up the image (0 at the bottom edge, 1 at the top edge).
    const PT = [0, 0];
    function drawStrips(glw, P, UV, n, flipped, map) {
        let pLx = 0, pLy = 0, pRx = 0, pRy = 0, pLu = 0, pLv = 0, pRu = 0, pRv = 0;
        for (let i = 0; i <= n; i++) {
            const a = i / n, h = flipped ? a : 1 - a;
            const lu = UV[0] + (UV[6] - UV[0]) * a, lv = UV[1] + (UV[7] - UV[1]) * a;
            const ru = UV[2] + (UV[4] - UV[2]) * a, rv = UV[3] + (UV[5] - UV[3]) * a;
            map(P[0] + (P[6] - P[0]) * a, P[1] + (P[7] - P[1]) * a, h); const Lx = PT[0], Ly = PT[1];
            map(P[2] + (P[4] - P[2]) * a, P[3] + (P[5] - P[3]) * a, h); const Rx = PT[0], Ry = PT[1];
            if (i) glw.OG(pLx, pLy, pRx, pRy, Rx, Ry, Lx, Ly, pLu, pLv, pRu, pRv, ru, rv, lu, lv);
            pLx = Lx; pLy = Ly; pRx = Rx; pRy = Ry; pLu = lu; pLv = lv; pRu = ru; pRv = rv;
        }
    }
    const FULL_UV = [0, 0, 1, 0, 1, 1, 0, 1];
    function uvOf(frame) {
        const r = frame.jk && frame.Ct;
        return r ? [r.left, r.top, r.right, r.top, r.right, r.bottom, r.left, r.bottom] : FULL_UV;
    }
    function quadOf(inst, ox, oy) {
        const q = inst.Wb;
        return [q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy];
    }
    // Sprite.nb, bent: same texture, opacity and pixel snapping as the engine's.
    function drawSwaySprite(inst, glw, kind) {
        glw.wc(inst.$n);
        glw.Oe(inst.opacity);
        const rt = runtime(), snap = rt && rt.vc;
        const off = swaySprite(inst, kind, Math.abs(inst.height)), pw = kind.pow;
        drawStrips(glw, quadOf(inst, snap ? Math.round(inst.x) - inst.x : 0, snap ? Math.round(inst.y) - inst.y : 0), uvOf(inst.mc), kind.strips, inst.height < 0,
            (x, y, h) => { PT[0] = x + off * Math.pow(h, pw); PT[1] = y; });
    }
    // Tilemap.nb (c2runtime, tilemap instance) redone with swaying tiles: same
    // chunk walk, culling, per-tile textures (type.Ph) and flip handling; a
    // run of identical tiles is split so each tile bends on its own.
    const TILE_ID = 0x1FFFFFFF;
    const TILE_RECT = { left: 0, top: 0, right: 1, bottom: 1 };
    function drawSwayTilemap(tm, glw) {
        if (tm.jc <= 0 || tm.ic <= 0) return;
        tm.type.Ps(tm.jc, tm.ic, tm.Kt, tm.Mt, tm.Lt, tm.Nt, tm.Ne);
        if (tm.width !== tm.eg || tm.height !== tm.dg) { tm.om = true; tm.Pp(); tm.Os(); tm.eg = tm.width; tm.dg = tm.height; }
        glw.Oe(tm.opacity);
        const tex = tm.type.Ph, layer = tm.C, vl = layer.Ca, vt = layer.Da, vr = layer.Ha, vb = layer.Ga;
        const rt = runtime();
        let gx = tm.x, gy = tm.y;
        if (rt && rt.vc) { gx = Math.round(gx); gy = Math.round(gy); }
        const cw = tm.Xb * tm.jc, chh = tm.lc * tm.ic;
        const c1 = Math.floor((vr - gx) / cw), r0 = Math.floor((vt - gy) / chh), r1 = Math.floor((vb - gy) / chh);
        for (let cx = Math.floor((vl - gx) / cw); cx <= c1; ++cx) for (let cy = r0; cy <= r1; ++cy) {
            const chunk = tm.kr(cx, cy);
            if (!chunk) continue;
            chunk.Xl();
            for (const r of chunk.Ec) {
                if (r.id === -1) continue;
                const k = r.Ta, x0 = k.left + gx, y0 = k.top + gy, x1 = k.right + gx, y1 = k.bottom + gy;
                if (x0 > vr || x1 < vl || y0 > vb || y1 < vt) continue;
                glw.wc(tex[r.gq]);
                let fr = (x1 - x0) / tm.jc, fb = (y1 - y0) / tm.ic;
                const kind = SWAY_KIND[SWAY_TILES[r.id & TILE_ID]];
                if (!kind && !r.uv) { TILE_RECT.right = fr; TILE_RECT.bottom = fb; glw.Cd(x0, y0, x1, y0, x1, y1, x0, y1, TILE_RECT); continue; }
                // corner UVs exactly as the engine works them out for flipped tiles
                if (r.uv && r.jj) { const z = fr; fr = fb; fb = z; }
                let A = 0, J = 0, G = fr, V = 0, R = fr, O = fb, X = 0, Hh = fb, z;
                if (r.uv) {
                    if (r.jj) { z = X; X = G; G = z; z = Hh; Hh = V; V = z; }
                    if (r.il) { z = A; A = G; G = z; z = J; J = V; V = z; z = X; X = R; R = z; z = Hh; Hh = O; O = z; }
                    if (r.$m) { z = A; A = X; X = z; z = J; J = Hh; Hh = z; z = G; G = R; R = z; z = V; V = O; O = z; }
                }
                if (!kind) { glw.OG(x0, y0, x1, y0, x1, y1, x0, y1, A, J, G, V, R, O, X, Hh); continue; }
                // split the run into single tiles, each bending from its own foot
                const nx = Math.max(1, Math.round((x1 - x0) / tm.jc)), ny = Math.max(1, Math.round((y1 - y0) / tm.ic));
                const bl = (c0, c1_, c2, c3, u, v) => (c0 * (1 - u) + c1_ * u) * (1 - v) + (c3 * (1 - u) + c2 * u) * v;
                for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
                    const u0 = tx / nx, u1 = (tx + 1) / nx, v0 = ty / ny, v1 = (ty + 1) / ny;
                    const P = [x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v0, x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v0,
                               x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v1, x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v1];
                    const UV = [bl(A, G, R, X, u0, v0), bl(J, V, O, Hh, u0, v0), bl(A, G, R, X, u1, v0), bl(J, V, O, Hh, u1, v0),
                                bl(A, G, R, X, u1, v1), bl(J, V, O, Hh, u1, v1), bl(A, G, R, X, u0, v1), bl(J, V, O, Hh, u0, v1)];
                    const off = kind.px * S.windNow * windWave(P[0], P[1], kind.speed), pw = kind.pow;
                    drawStrips(glw, P, UV, kind.strips, false, (x, y, h) => { PT[0] = x + off * Math.pow(h, pw); PT[1] = y; });
                }
            }
        }
    }
    // Corner UVs of a tilemap run exactly as the engine works them out for
    // flipped tiles: [tl u,v, tr u,v, br u,v, bl u,v].
    function runUV(r, fr, fb) {
        if (r.uv && r.jj) { const z = fr; fr = fb; fb = z; }
        let A = 0, J = 0, G = fr, V = 0, Rr = fr, O = fb, X = 0, Hh = fb, z;
        if (r.uv) {
            if (r.jj) { z = X; X = G; G = z; z = Hh; Hh = V; V = z; }
            if (r.il) { z = A; A = G; G = z; z = J; J = V; V = z; z = X; X = Rr; Rr = z; z = Hh; Hh = O; O = z; }
            if (r.$m) { z = A; A = X; X = z; z = J; J = Hh; Hh = z; z = G; G = Rr; Rr = z; z = V; V = O; O = z; }
        }
        return [A, J, G, V, Rr, O, X, Hh];
    }
    // Hooked lazily: the Sprite and Tilemap classes are only reachable
    // through an instance, and the plants only exist on the Map.
    function hookWind(rt) {
        const types = typesOf(rt);
        if (!S.windTypesMarked) {
            let marked = 0;
            for (const t of types) if (t && SWAY_SPRITES[t.name]) { t.__mdzSway = SWAY_KIND[SWAY_SPRITES[t.name]]; marked++; }
            if (marked) S.windTypesMarked = true;
        }
        if (!S.spriteHooked) {
            // any sprite gives the Sprite class (all sprites share one prototype)
            let inst = null;
            for (const name of Object.keys(SWAY_SPRITES)) { const i = instancesOf(types.find(x => x && x.name === name))[0]; if (i && i.Wb && i.mc) { inst = i; break; } }
            if (!inst) for (const t of types) { const i = instancesOf(t)[0]; if (i && i.Wb && i.mc && typeof i.nb === 'function') { inst = i; break; } }
            if (inst) {
                const proto = Object.getPrototypeOf(inst), orig = proto.nb;
                if (typeof orig === 'function') {
                    const drawSprite = function (glw) {
                        const kind = S.windNow > 0 && this.type && this.type.__mdzSway;
                        let bent = false;
                        if (kind && this.Wb && this.mc && this.$n) {
                            try { drawSwaySprite(this, glw, kind); bent = true; }
                            catch (e) { S.windError = String(e && e.message || e); S.windOff = true; }
                        }
                        if (!bent) orig.apply(this, arguments);
                        if (S.extras && S.inMapDraw && this.mc && this.$n && this.Wb && this.C && EXTRA_LAYERS[this.C.name] && !S.extrasError &&
                            !(this.type.qa && this.type.qa.length)) {
                            const x = extrasOf(this.mc);
                            if (x) {
                                try { drawExtras(this, glw, x, bent ? kind : null); }
                                catch (e) {
                                    S.extrasError = String(e && e.message || e);
                                    try { glw.hf(); glw.ld(0); glw.ay(); glw.wc(this.$n); } catch (_) {}
                                    console.warn('[MDZ Lighting] snow cover / shine off:', S.extrasError);
                                }
                            }
                        }
                    };
                    proto.nb = function (glw) {
                        // line of sight: out of view, faded or not drawn at all
                        if (V.on && this.C && VIS_HIDE_LAYERS[this.C.name] && cfg.visionHide !== false && !V.error) {
                            const a = visAlpha(this);
                            if (a < 0.01) return;
                            if (a < 0.995) {
                                const o = this.opacity;
                                this.opacity = o * a;
                                try { return drawSprite.call(this, glw); } finally { this.opacity = o; }
                            }
                        }
                        return drawSprite.call(this, glw);
                    };
                    S.spriteHooked = true;
                }
            }
        }
        if (!S.tilemapHooked) {
            const t = types.find(x => x && x.name === SWAY_TILEMAP), inst = instancesOf(t)[0];
            if (inst && typeof inst.kr === 'function' && Array.isArray(inst.Yc) && inst.type && inst.type.Ph && typeof inst.type.Ps === 'function') {
                const proto = Object.getPrototypeOf(inst), orig = proto.nb;
                if (typeof orig === 'function') {
                    proto.nb = function (glw) {
                        // (Low: the grass tufts hold still - splitting the tile runs costs a slow phone's CPU; trees still sway)
                        if (!(S.windNow > 0) || Q() < 1 || !this.type || this.type.name !== SWAY_TILEMAP) return orig.apply(this, arguments);
                        try { drawSwayTilemap(this, glw); }
                        catch (e) { S.windError = String(e && e.message || e); S.windOff = true; return orig.apply(this, arguments); }
                    };
                    S.tilemapHooked = true;
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // Shadow pass
    // ---------------------------------------------------------------
    function drawShadows(rt, glw, view) {
        const fs = S.fs, k = fs.k;
        const alpha = k.shAlpha * cfg.shadows * (1 - 0.65 * fs.rain);
        // the fires, lamps and flares in view (needed here for their shadows)
        gatherLights(rt, fs, view.Ca, view.Da, view.Ha - view.Ca, view.Ga - view.Da);
        const lit = cfg.shadows > 0 && Q() >= 1 && S.lightWorld.some(L => L.s > 0.05);   // light-source shadows: Medium+
        S.lightShadowUsed = 0;
        if ((alpha < 0.01 && !lit) || !S.casters.length) return;
        const ga = Math.min(0.9, alpha);   // strength is baked into each silhouette now
        const gl = glw.T, w = glw.width | 0, h = glw.height | 0;
        if (w < 2 || h < 2 || gl.isContextLost()) return;
        const sil = program(glw, 'sil'), comp = program(glw, 'comp');
        const tex = texture(glw, 'shadow', w, h, true);
        const len = k.shLen, dx = fs.dir[0] * len, dy = fs.dir[1] * len;
        const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga;
        const target = S.layoutRef && typeof S.layoutRef.el === 'function' ? S.layoutRef.el() : null;
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        const aoOn = cfg.ao > 0 && Q() >= 1;   // contact shadows: Medium+
        footBudget = FOOT_SCANS_PER_FRAME;
        // The layers hold everything loaded around the player, most of it far
        // off screen: those are skipped first, before any other work. The
        // margin leaves room for the longest shadow (a sprite's size plus its
        // height times the shadow length).
        const cxv = (vl + vr) / 2, cyv = (vt + vb) / 2, hwv = (vr - vl) / 2 + 64, hhv = (vb - vt) / 2 + 64, reach = 1.2 + Math.max(len, 1.5);
        const far = i => { const w = Math.abs(i.width || 0), h = Math.abs(i.height || 0), e = w + h * reach; return Math.abs(i.x - cxv) > hwv + e || Math.abs(i.y - cyv) > hhv + e; };
        // floors of the buildings that have the game's own shadow
        const shells = new Set();
        if (S.baseLayer) for (const b of instancesOf(S.baseLayer)) if (b && !far(b)) shells.add(Math.round(b.x / 2) + ',' + Math.round(b.y / 2));
        // gather first: characters need the lowest foot of all their parts
        const list = [], partFoot = new Map();
        for (const layer of S.casters) {
            if (!layer.visible) continue;
            const isPart = !!PART_LAYERS[layer.name], flip = !!FLIP_LAYERS[layer.name];
            for (const inst of instancesOf(layer)) {
                // sprites only, not faded out, big enough to stand up (skips thin
                // bars and particles). A tree the game makes see-through while
                // you stand behind it still casts its shadow.
                if (!inst || !inst.visible || !inst.$n || !inst.mc || !inst.Wb || inst.__mdzHurtbox || far(inst)) continue;
                if (inst.type && NO_SHADOW_TYPES[inst.type.name]) continue;
                // out of the player's sight: no shadow either (last frame's answer)
                if (visOn() && VIS_HIDE_LAYERS[layer.name] && inst.__mdzVa !== undefined && inst.__mdzVa < 0.5 && inst.__mdzVf >= V.frame - 1) continue;
                const kind = casterKind(inst);
                if (kind === 'none') continue;
                if (inst.mc.__mdzNoSh === undefined) { const nm = imageName(inst); if (nm) inst.mc.__mdzNoSh = NO_SHADOW_IMG.test(nm); }
                if (inst.mc.__mdzNoSh) continue;
                // a building's roof: its floor carries the game's drawn shadow. With
                // painted shadows replaced, the roof casts ours instead (also while
                // it is faded out because you are inside)
                const shell = flip && shells.has(Math.round(inst.x / 2) + ',' + Math.round(inst.y / 2));
                if (shell && !replacePainted()) continue;
                if (!shell && !(inst.opacity > 0.05)) continue;
                if (typeof inst.la === 'function') inst.la();
                const q = inst.Wb;
                const top = Math.min(q.fb, q.Lb, q.zb, q.xb), bottom = Math.max(q.fb, q.Lb, q.zb, q.xb);
                const left = Math.min(q.eb, q.Kb, q.yb, q.wb), right = Math.max(q.eb, q.Kb, q.yb, q.wb);
                const hh = bottom - top, ww = right - left;
                if (hh < 8 || ww < 6) continue;
                // a mirrored-upside-down image has its padding at the top: leave it
                const foot = inst.height > 0 ? footGap(inst.mc) * hh : 0;
                const it = { inst, q, top, bottom, left, right, hh, ww, base: bottom - foot, key: null,
                    crown: (!isPart && inst.height > 0 && kind !== 'car' && !shell) ? crownGap(inst.mc) * hh * 0.92 : 0,
                    box: shell ? BUILDING_H : kind === 'car' ? (inst.type.__mdzBox || CAR_H) : 0, ent: !!ENTITY_CAST[layer.name], dyn: !!DYN_LAYERS[layer.name], shell };
                // only body-sized pieces share the foot: a big overlay at the same
                // spot (a companion's 150 px light) pulled the whole shadow away
                if (isPart && hh <= 64 && ww <= 64) {
                    it.key = Math.round(inst.x) + ',' + Math.round(inst.y);
                    const b = partFoot.get(it.key);
                    if (b === undefined || it.base > b) partFoot.set(it.key, it.base);
                }
                list.push(it);
            }
        }
        const round = !!rt.vc; // the engine snaps sprites to whole pixels: match it
        const lightJobs = [];   // casters near a fire/lamp: their light shadows go in their own texture
        const aoJobs = [];      // cars, walls, buildings: contact shadows
        let dbg = null;         // (tests) uids drawn
        // the silhouettes of items, leaning away from the sun (sil program,
        // world transform and max blending set by the caller)
        const drawCasters = items => {
            let n = 0;
            for (const it of items) {
                const { inst, q, top, left, right, hh, ww } = it;
                const base = it.key ? partFoot.get(it.key) : it.base;
                // Long top-down strips (walls, fences) and very tall images are not
                // standing objects: they get a copy shifted along the light by a
                // wall's height instead of being stood up and stretched.
                const strip = hh > 320 || (hh > 150 && hh / ww > 3.2);
                const up = strip ? WALL_H : it.box ? it.box : Math.max(0, base - top - (it.crown || 0));
                const sx = dx * up, sy = dy * up;
                // cull the object together with its shadow
                if (Math.max(right, right + sx) < vl || Math.min(left, left + sx) > vr || Math.max(it.bottom, base + sy) < vt || Math.min(top, top + sy) > vb) continue;
                const ox = round ? Math.round(inst.x) - inst.x : 0, oy = round ? Math.round(inst.y) - inst.y : 0;
                const sheet = inst.mc.jk && inst.mc.Ct ? inst.mc.Ct : null;
                const quad = c => sheet
                    ? glw.Cd(c[0] + ox, c[1] + oy, c[2] + ox, c[3] + oy, c[4] + ox, c[5] + oy, c[6] + ox, c[7] + oy, sheet)
                    : glw.dk(c[0] + ox, c[1] + oy, c[2] + ox, c[3] + oy, c[4] + ox, c[5] + oy, c[6] + ox, c[7] + oy);
                if (aoOn && (strip || it.box)) aoJobs.push({ inst, q, ox, oy, sheet });
                glw.wc(inst.$n);
                if (strip || it.box) {
                    // swept from the wall (car, building) out to its height along the
                    // light, so the shadow stays joined to its edges instead of
                    // floating beside it or being stood up and stretched
                    const steps = Math.max(1, Math.min(20, Math.ceil(Math.hypot(sx, sy) / 5)));
                    for (let k = 1; k <= steps; k++) {
                        const fx = sx * k / steps, fy = sy * k / steps;
                        quad([q.eb + fx, q.fb + fy, q.Kb + fx, q.Lb + fy, q.yb + fx, q.zb + fy, q.wb + fx, q.xb + fy]);
                    }
                } else {
                    const sway = S.windNow > 0 && inst.type && inst.type.__mdzSway;
                    const hc = it.crown;
                    const along = (ddx, ddy) => {
                        // The shadow starts a little behind the foot, under the art:
                        // roots and grass tufts drawn below a trunk (and the trees at
                        // the back of a cluster) otherwise leave a sunlit band between
                        // the object and its shadow. Shadows always point down the
                        // screen, so "behind" is always under the sprite.
                        // a cluster of trees (wide, full of trunks and branches) hides more
                        const cluster = hc > 0 && ww > 110;
                        const dl = Math.hypot(ddx, ddy) || 1, back = cluster ? Math.min(30, hh * 0.18) : hc > 0 ? Math.min(16, 4 + hh * 0.08) : 2.5;
                        const bx = -ddx / dl * back, by = -ddy / dl * back;
                        if (sway || hc > 0) {
                            // Warped to its origin: what is below the crown (the trunk)
                            // lies on the foot and the crown's shadow starts there,
                            // instead of one tree-height away. A swaying plant's shadow
                            // also bends with it.
                            const off = sway ? swaySprite(inst, sway, Math.abs(inst.height)) : 0, pw = sway ? sway.pow : 1;
                            drawStrips(glw, quadOf(inst, ox, oy), uvOf(inst.mc), Math.max(sway ? sway.strips : 0, hc > 0 ? 10 : 0), inst.height < 0, (x, y, h) => {
                                const up = Math.max(0, base + oy - y - hc);
                                PT[0] = x + off * Math.pow(h, pw) + ddx * up + bx; PT[1] = base + oy + ddy * up + by;
                            });
                        } else {
                            // each corner moves along the light by its height above the foot:
                            // the foot stays put, the top lands len heights away
                            const s0 = base - q.fb, s1 = base - q.Lb, s2 = base - q.zb, s3 = base - q.xb;
                            quad([q.eb + ddx * s0 + bx, base + ddy * s0 + by, q.Kb + ddx * s1 + bx, base + ddy * s1 + by, q.yb + ddx * s2 + bx, base + ddy * s2 + by, q.wb + ddx * s3 + bx, base + ddy * s3 + by]);
                        }
                    };
                    const near = lit && it.ent ? lightShadows(inst.x, base) : NO_LIGHTS;
                    // a strong light close by drowns the sun's (or moon's) shadow
                    const own = ga * (1 - 0.8 * (near.length ? near[0].infl : 0));
                    if (own > 0.01) {
                        glw.Oe(own);
                        along(dx, dy);
                        if (own !== ga) glw.Oe(ga);
                    }
                    if (near.length && it.ent) lightJobs.push({ inst, q, base, ox, oy, sheet, near });
                }
                n++;
                if (dbg) dbg.push(inst.uid);
            }
            return n;
        };
        const setWorld = () => { glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd(); };
        // A building's own footprint stays out of its shadow: the roof hides it
        // anyway, and inside (roof faded out) the floor must not be darkened
        const cutShells = shells => {
            glw.hf();
            glw.wh(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
            glw.Oe(1);
            for (const it of shells) {
                const inst = it.inst, q = it.q;
                const ox = round ? Math.round(inst.x) - inst.x : 0, oy = round ? Math.round(inst.y) - inst.y : 0;
                const sheet = inst.mc.jk && inst.mc.Ct ? inst.mc.Ct : null;
                glw.wc(inst.$n);
                if (sheet) glw.Cd(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy, sheet);
                else glw.dk(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy);
            }
            glw.hf();
            glw.ay();
            glw.Oe(ga);
        };
        const stat = [], dyn = [];
        for (const it of list) (it.dyn ? dyn : stat).push(it);
        const shellItems = stat.filter(it => it.shell);
        const nearView = it => !(it.right < vl - 400 || it.left > vr + 400 || it.bottom < vt - 400 || it.top > vb + 400);
        const mixView = () => {
            sigMix(w); sigMix(h); sigMix(vl); sigMix(vt); sigMix(vr); sigMix(vb); sigMix(sc * 1000); sigMix(ang * 1000);
            sigMix(dx * 1000); sigMix(dy * 1000); sigMix(ga * 1000); sigMix(Q()); sigMix(rt.vc ? 1 : 0);
        };
        const mixItem = it => {
            const q = it.q, inst = it.inst;
            sigMix(q.eb); sigMix(q.fb); sigMix(q.Kb); sigMix(q.Lb); sigMix(q.yb); sigMix(q.zb);
            sigMix(inst.opacity * 100); sigMix(objId(inst.mc)); sigMix(objId(inst.$n)); sigMix(it.base);
        };
        const now = fs.now;

        // 1a. The still casters - trees, buildings, walls, rocks, parked cars -
        // into their own texture, redrawn only when something in it changes
        // (the view, the sun, a caster's corners, frame, texture, opacity or
        // foot): at most once a second when nothing does, 20-30 times a second
        // while plants sway.
        let live = false;
        sigReset(); mixView();
        sigMix(cfg.tileShadows === false ? 0 : 1); sigMix(aoOn ? cfg.ao * 100 : -1); sigMix(replacePainted() ? 1 : 0); sigMix(shells.size);
        for (const it of stat) {
            if (!nearView(it)) continue;
            mixItem(it);
            if (S.windNow > 0 && it.inst.type && it.inst.type.__mdzSway) live = true;
        }
        const ssig = SIG.h, stex = texture(glw, 'shstatic', w, h, true), SC = S.shStatic;
        const keep = live ? (Q() < 1 ? 100 : S.windNow > 2 || Q() >= 2 ? 33 : 50) : 1000;   // Low: 10 a second
        const staticOk = !S.noReuse && !!SC && SC.sig === ssig && SC.tex === stex && SC.glw === glw && now >= SC.at && now - SC.at < keep;
        if (!staticOk) {
            dbg = S.debug ? [] : null;
            glw.hf();
            glw.le(stex);
            glw.clear(0, 0, 0, 0);
            setWorld();
            glw.ld(sil.idx);
            glw.ay();
            glw.Oe(ga);
            let n = 0;
            // Ground tiles (rocks, stumps, bushes) first: each one's own shape is
            // cut out of its shadow, and a car or tree shadow drawn after that
            // still falls over the bush
            if (cfg.tileShadows !== false && alpha >= 0.01 && Q() >= 1) {   // rocks/bushes: Medium+
                glw.Oe(ga);
                try { n += drawTileShadows(rt, glw, dx, dy, vl, vt, vr, vb); }
                catch (e) { cfg.tileShadows = false; console.warn('[MDZ Lighting] tile shadows off:', e && e.message || e); }
                glw.ld(sil.idx);
                glw.Oe(ga);
            }
            glw.hf();
            blendMax(gl, true);
            n += drawCasters(stat);
            // contact shadows, under the same max blending as the silhouettes
            if (aoJobs.length) {
                const day = 1 - lampAmount(fs.hour);
                drawAO(glw, aoJobs, Math.min(0.85, 0.4 * cfg.ao * (0.55 + 0.45 * day) * (1 - 0.25 * fs.rain)));
                glw.Oe(ga);
            }
            S.aoCount = aoJobs.length;
            glw.hf();
            blendMax(gl, false);
            if (shellItems.length) cutShells(shellItems);
            S.shStatic = { sig: ssig, tex: stex, glw, at: now, n, drawn: dbg || [] };
            S.staticRedraws = (S.staticRedraws || 0) + 1;
        } else S.shadowReused = (S.shadowReused || 0) + 1;

        // 1b. The moving casters - people, zombies, vehicles - over a copy of
        // the still ones. Nothing moved and no fire flickering: last frame's
        // result stands as it is.
        sigReset(); mixView(); sigMix(S.shStatic.at % 1e6);
        for (const it of dyn) if (nearView(it)) mixItem(it);
        const dsig = SIG.h, DC = S.shDyn;
        const dynOk = !S.noReuse && staticOk && !lit && !!DC && DC.sig === dsig && DC.tex === tex && DC.glw === glw;
        if (!dynOk) {
            dbg = S.debug ? [] : null;
            glw.hf();
            glw.le(tex);
            glw.ld(0);
            glw.wh(gl.ONE, gl.ZERO);
            glw.wc(stex);
            glw.Oe(1);
            glw.Yv();
            glw.hf();
            setWorld();
            glw.ld(sil.idx);
            glw.ay();
            glw.Oe(ga);
            glw.hf();
            blendMax(gl, true);
            const dn = drawCasters(dyn);
            glw.hf();
            blendMax(gl, false);
            if (dn && shellItems.length) cutShells(shellItems);
            // shadows the lights throw: where the grade holds that light back
            if (lightJobs.length) {
                const lsTex = texture(glw, 'lshadow', w, h, true);
                glw.hf();
                glw.le(lsTex);
                glw.clear(0, 0, 0, 0);
                for (const j of lightJobs) {
                    glw.wc(j.inst.$n);
                    for (const L of j.near) { glw.Oe(L.op); throwFrom(glw, j, L.dx, L.dy); }
                }
                // every object's own shape out again: the light shadow falls on
                // the ground around things, never over the things themselves
                glw.hf();
                glw.wh(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
                glw.Oe(1);
                for (const it of list) {
                    const inst = it.inst, q = it.q;
                    if (inst.x < vl - 200 || inst.x > vr + 200 || inst.y < vt - 200 || inst.y > vb + 300) continue;
                    const ox = round ? Math.round(inst.x) - inst.x : 0, oy = round ? Math.round(inst.y) - inst.y : 0;
                    const sheet = inst.mc.jk && inst.mc.Ct ? inst.mc.Ct : null;
                    glw.wc(inst.$n);
                    if (sheet) glw.Cd(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy, sheet);
                    else glw.dk(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy);
                }
                glw.hf();
                glw.ay();
                S.lsFrame = S.frameNo;
            }
            S.lightShadowCount = lightJobs.length;
            glw.le(target);
            S.shDyn = { sig: dsig, tex, glw, n: dn, ls: lightJobs.length > 0, lsTex: lightJobs.length && S.texs.lshadow ? S.texs.lshadow.tex : null };
            if (S.debug) S.lastDrawn = (S.shStatic.drawn || []).concat(dbg || []);
        } else {
            if (DC.ls && S.texs.lshadow && DC.lsTex === S.texs.lshadow.tex) S.lsFrame = S.frameNo;
            S.dynReused = (S.dynReused || 0) + 1;
        }
        const n = S.shStatic.n + (S.shDyn ? S.shDyn.n : 0);
        S.aoCount = aoJobs.length || S.aoCount || 0;

        // 2. lay them over the ground once
        glw.wc(tex);
        glw.ld(comp.idx);
        glw.hf();
        // shade: lit by the sky, so cooler than the sun; bluer at night, flat in rain
        const nt = lampAmount(fs.hour);
        const col = [0, 1, 2].map(i => lerp(lerp(lerp([0.15, 0.17, 0.25][i], [0.20, 0.24, 0.40][i], nt), [0.22, 0.23, 0.26][i], fs.rain), [0.36, 0.44, 0.64][i], 0.55 * (S.winter || 0)));
        if (comp.loc.uShadow) gl.uniform4f(comp.loc.uShadow, col[0], col[1], col[2], 1);
        const blur = Q() >= 2 ? 2.0 : 1.3;
        if (comp.loc.uPx) gl.uniform2f(comp.loc.uPx, blur / w, blur / h);
        glw.Oe(1);
        glw.wh(gl.ZERO, gl.SRC_COLOR);
        glw.Yv();
        glw.hf();
        glw.ay();
        glw.hf();
        glw.ld(0);
        glw.wc(null);
        S.shadowCount = n;
        S.sunTexFrame = S.frameNo; S.sunTexGa = ga;
        S.shadowFrames++;
    }

    // Hash of what a cached pass depends on (FNV-1a over values in 1/16 steps)
    const SIG = { h: 0 };
    const sigReset = () => { SIG.h = 0x811c9dc5 | 0; if (SIG.dbg) SIG.dbg = []; };
    const sigMix = v => { SIG.h = Math.imul(SIG.h ^ (Math.round(v * 16) | 0), 16777619); if (SIG.dbg) SIG.dbg.push(Math.round(v * 16) | 0); };
    let objSeq = 0;
    const objId = o => (o ? (o.__mdzSid || (o.__mdzSid = ++objSeq)) : 0);
    // Contact shadows (2D ambient occlusion): a soft dark rim where cars, walls
    // and buildings meet the ground - their own outline grown a few pixels
    // along its edges, in fading steps. The object covers its own footprint.
    const AO_RINGS = [[2, 1.0], [4.5, 0.6], [7.5, 0.28]];
    function drawAO(glw, jobs, strength) {
        for (const [e, fade] of AO_RINGS) {
            glw.Oe(strength * fade);
            for (const j of jobs) {
                const q = j.q, ox = j.ox, oy = j.oy;
                let ux = q.Kb - q.eb, uy = q.Lb - q.fb; const ul = Math.hypot(ux, uy) || 1; ux = ux / ul * e; uy = uy / ul * e;
                let wx = q.wb - q.eb, wy = q.xb - q.fb; const wl = Math.hypot(wx, wy) || 1; wx = wx / wl * e; wy = wy / wl * e;
                const x0 = q.eb - ux - wx + ox, y0 = q.fb - uy - wy + oy, x1 = q.Kb + ux - wx + ox, y1 = q.Lb + uy - wy + oy;
                const x2 = q.yb + ux + wx + ox, y2 = q.zb + uy + wy + oy, x3 = q.wb - ux + wx + ox, y3 = q.xb - uy + wy + oy;
                glw.wc(j.inst.$n);
                if (j.sheet) glw.Cd(x0, y0, x1, y1, x2, y2, x3, y3, j.sheet);
                else glw.dk(x0, y0, x1, y1, x2, y2, x3, y3);
            }
        }
    }
    // The soft band under a standing object: a radial gradient stretched from
    // the foot (fx, fy) along the light (ddx, ddy) over L, W wide.
    function contactTex(glw) {
        if (S.contact && S.contact.glw === glw) return S.contact.tex;
        const N = 64, cv = document.createElement('canvas'); cv.width = cv.height = N;
        const g = cv.getContext('2d'), grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
        grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.9)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, N, N);
        const tex = glw.td(N, N, true, false, false);
        glw.Zy(cv, tex, false);
        S.contact = { glw, tex };
        return tex;
    }
    function drawContact(glw, fx, fy, ddx, ddy, L, W) {
        const d = Math.hypot(ddx, ddy) || 1, ux = ddx / d, uy = ddy / d, px = -uy, py = ux;
        const a = Math.max(W * 0.35, L / 2 + W * 0.2), b = W / 2;           // half length, half width
        const cx = fx + ux * (L / 2 - W * 0.1), cy = fy + uy * (L / 2 - W * 0.1) * 0.9;
        glw.wc(contactTex(glw));
        glw.dk(cx - ux * a - px * b, cy - uy * a - py * b, cx - ux * a + px * b, cy - uy * a + py * b,
               cx + ux * a + px * b, cy + uy * a + py * b, cx + ux * a - px * b, cy + uy * a - py * b);
    }
    // A sprite's shadow from a point light: height above the foot runs away
    // from the light (len per unit of height), the sprite's width lies across
    // that direction.
    function throwFrom(glw, j, ddx, ddy) {
        const q = j.q, len = Math.hypot(ddx, ddy) || 1, ax = ddx / len, ay = ddy / len;
        // across-direction chosen so the image's left stays left (a light south
        // of the player otherwise mirrored the shadow)
        let px = ay, py = -ax;
        if (px < -1e-3 || (Math.abs(px) <= 1e-3 && py > 0)) { px = -px; py = -py; }
        const fx = j.inst.x + j.ox, fy = j.base + j.oy;
        const P = (cx, cy) => { const u = cx - j.inst.x, v = j.base - cy; return [fx + px * u + ax * len * v, fy + py * u + ay * len * v]; };
        const a = P(q.eb, q.fb), b = P(q.Kb, q.Lb), c = P(q.yb, q.zb), d = P(q.wb, q.xb);
        if (j.sheet) glw.Cd(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], j.sheet);
        else glw.dk(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
    }
    // Max blending for the silhouettes: a shadow is as dark as the darkest
    // silhouette over a spot, never darker for being drawn twice (the swept
    // car/building shadows are up to 20 copies)
    function blendMax(gl, on) {
        let e = gl.FUNC_ADD;
        if (on) {
            if (gl.MAX) e = gl.MAX;
            else { if (S.minmax === undefined || S.minmaxGl !== gl) { S.minmaxGl = gl; S.minmax = gl.getExtension('EXT_blend_minmax'); } e = S.minmax ? S.minmax.MAX_EXT : gl.FUNC_ADD; }
        }
        gl.blendEquation(e);
    }
    // Shadows thrown by the lights near a foot point (x, y): away from each
    // light, longer the further from it, stronger the closer. Up to two.
    const NO_LIGHTS = [];
    const LIGHT_SHADOW_BUDGET = 60;   // light-shadow silhouettes per frame at most
    function lightShadows(x, y) {
        let out = null;
        for (const L of S.lightWorld) {
            const ddx = x - L.x, ddy = y - L.y, d = Math.hypot(ddx, ddy), R = L.r * 0.85;
            if (d < 5 || d > R) continue;
            const fall = 1 - d / R;
            const op = Math.min(0.7, L.s * fall * 1.3 * Math.min(1.5, cfg.shadows));
            if (op < 0.03) continue;
            const len = Math.min(3.2, 0.7 + d / 45);   // longer than the body, so a shadow thrown north still shows past the head
            (out || (out = [])).push({ dx: ddx / d * len, dy: ddy / d * len, op, infl: Math.min(1, fall * L.s * 1.5) });
        }
        if (!out) return NO_LIGHTS;
        out.sort((a, b) => b.op - a.op);
        // several lights, several shadows - within a budget, for phones
        const per = Q() >= 2 ? 4 : 2;
        if (out.length > per) out.length = per;
        const left = LIGHT_SHADOW_BUDGET - S.lightShadowUsed;
        if (left <= 0) return out.slice(0, 1);
        if (out.length > left) out.length = Math.max(1, left);
        S.lightShadowUsed += out.length;
        return out;
    }
    // Standing things painted into the ground tilemap (ground_enviroment_tilemap,
    // 30 px tiles): rocks, stumps, bushes. id -> foot gap in px (empty rows
    // under the object). Flat things (branches, grass, blood, bodies) cast none.
    const SHADOW_TILES = {
        0: 2, 1: 3, 5: 3, 6: 3, 10: 2, 7: 3,           // rocks, dark rock
        12: 3, 13: 3, 14: 3,                           // stumps
        56: 3, 57: 3, 67: 2, 68: 3, 69: 3, 72: 3,      // snowy rocks and stump
        26: 3, 27: 3, 28: 3, 29: 2, 75: 3, 76: 3, 77: 3, 78: 3 // bushes
    };
    // a tile's foot (empty px under its solid art), read from the tile image;
    // the table's guess until the image is read
    function tileFoot(id) {
        if (!S.tileFeet && !S.tileFeetLoading) {
            S.tileFeetLoading = true;
            const img = new Image();
            img.onload = () => {
                try {
                    const T = 30, cols = Math.floor(img.width / T), rows = Math.floor(img.height / T);
                    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
                    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
                    const feet = {};
                    for (let t = 0; t < cols * rows; t++) {
                        const d = cx.getImageData((t % cols) * T, Math.floor(t / cols) * T, T, T).data;
                        let y = T - 1;
                        search: for (; y >= 0; y--) for (let x = 0; x < T; x++) if (d[(y * T + x) * 4 + 3] > 140) break search;
                        feet[t] = y < 0 ? 0 : T - 1 - y;
                    }
                    S.tileFeet = feet;
                } catch (e) { S.tileFeet = {}; }
            };
            img.onerror = () => { S.tileFeet = {}; };
            img.src = 'images/ground_enviroment_tilemap.png';
        }
        const m = S.tileFeet && S.tileFeet[id];
        return m !== undefined ? m : SHADOW_TILES[id];
    }
    function drawTileShadows(rt, glw, dx, dy, vl, vt, vr, vb) {
        const tdl = Math.hypot(dx, dy) || 1, tbx = -dx / tdl * 2.5, tby = -dy / tdl * 2.5;
        glw.hf();
        blendMax(glw.T, true);
        if (!S.tileMaps || S.tileMapsRt !== rt) {
            S.tileMapsRt = rt;
            S.tileMaps = typesOf(rt).find(x => x && x.name === SWAY_TILEMAP) || null;
        }
        let n = 0;
        const round = !!rt.vc, drawn = [];
        for (const tm of instancesOf(S.tileMaps)) {
            if (!tm || !tm.visible || !(tm.opacity > 0.05) || !tm.C || !tm.C.visible || typeof tm.kr !== 'function' || !tm.type || !tm.type.Ph) continue;
            if (tm.jc <= 0 || tm.ic <= 0) continue;
            const tex = tm.type.Ph;
            let gx = tm.x, gy = tm.y;
            if (round) { gx = Math.round(gx); gy = Math.round(gy); }
            const cw = tm.Xb * tm.jc, chh = tm.lc * tm.ic;
            // shadows reach up to ~2 tile heights beyond the view
            const pad = tm.ic * 2.5;
            const c0 = Math.floor((vl - pad - gx) / cw), c1 = Math.floor((vr + pad - gx) / cw);
            const r0 = Math.floor((vt - pad - gy) / chh), r1 = Math.floor((vb + pad - gy) / chh);
            for (let cx = c0; cx <= c1; ++cx) for (let cy = r0; cy <= r1; ++cy) {
                const chunk = tm.kr(cx, cy);
                if (!chunk) continue;
                chunk.Xl();
                for (const r of chunk.Ec) {
                    if (r.id === -1) continue;
                    if (SHADOW_TILES[r.id & TILE_ID] === undefined) continue;
                    const foot = tileFoot(r.id & TILE_ID);
                    const k = r.Ta, x0 = k.left + gx, y0 = k.top + gy, x1 = k.right + gx, y1 = k.bottom + gy;
                    if (x1 < vl - pad || x0 > vr + pad || y1 < vt - pad || y0 > vb + pad) continue;
                    glw.wc(tex[r.gq]);
                    const nx = Math.max(1, Math.round((x1 - x0) / tm.jc)), ny = Math.max(1, Math.round((y1 - y0) / tm.ic));
                    const UVr = runUV(r, (x1 - x0) / tm.jc, (y1 - y0) / tm.ic);
                    const bl = (c0_, c1_, c2, c3, u, v) => (c0_ * (1 - u) + c1_ * u) * (1 - v) + (c3 * (1 - u) + c2 * u) * v;
                    const sway = SWAY_KIND[SWAY_TILES[r.id & TILE_ID]];
                    // one tile at a time: each stands on its own foot
                    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
                        const u0 = tx / nx, u1 = (tx + 1) / nx, v0 = ty / ny, v1 = (ty + 1) / ny;
                        const P = [x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v0, x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v0,
                                   x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v1, x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v1];
                        const UV = [bl(UVr[0], UVr[2], UVr[4], UVr[6], u0, v0), bl(UVr[1], UVr[3], UVr[5], UVr[7], u0, v0),
                                    bl(UVr[0], UVr[2], UVr[4], UVr[6], u1, v0), bl(UVr[1], UVr[3], UVr[5], UVr[7], u1, v0),
                                    bl(UVr[0], UVr[2], UVr[4], UVr[6], u1, v1), bl(UVr[1], UVr[3], UVr[5], UVr[7], u1, v1),
                                    bl(UVr[0], UVr[2], UVr[4], UVr[6], u0, v1), bl(UVr[1], UVr[3], UVr[5], UVr[7], u0, v1)];
                        const base = P[5] - foot;
                        const off = sway && S.windNow > 0 ? sway.px * S.windNow * windWave(P[0], P[1], sway.speed) : 0, pw = sway ? sway.pow : 1;
                        drawStrips(glw, P, UV, off ? sway.strips : 1, false, (x, y, h) => {
                            const up = base - y; PT[0] = x + off * Math.pow(h, pw) + dx * up + tbx; PT[1] = base + dy * up + tby;
                        });
                        drawn.push({ t: tex[r.gq], P, UV, off, pw, strips: off ? sway.strips : 1 });
                        n++;
                    }
                }
            }
        }
        // The tiles lie under the shadow layer (trees stand over it): cut each
        // one's own shape out again so a rock is not darkened by its own shadow.
        glw.hf();
        blendMax(glw.T, false);
        if (drawn.length) {
            const gl = glw.T;
            glw.wh(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
            glw.Oe(1);
            for (const d of drawn) {
                glw.wc(d.t);
                drawStrips(glw, d.P, d.UV, d.strips, false, (x, y, h) => { PT[0] = x + d.off * Math.pow(h, d.pw); PT[1] = y; });
            }
            glw.hf();
            glw.ay();
        }
        return n;
    }

    // ---------------------------------------------------------------
    // Grade pass
    // ---------------------------------------------------------------
    // The game's own light sprites (lamp glows, bot camp lights, the light
    // tower, car headlights): drawn again, tinted, into a mask the grade uses
    // to warm and glow exactly where the game lights the dark - cones stay
    // cones. kind -> tint
    const MASK_KIND = { glow: [1.0, 0.72, 0.42], warm: [1.0, 0.58, 0.28], cool: [0.75, 0.88, 1.0], car: [1.0, 0.86, 0.6] };
    const MASK_TYPES = { t261: 'glow', t1144: 'glow', t1240: 'glow', t1412: 'glow', t670: 'glow', t408: 'warm', t548: 'warm', t663: 'cool', t824: 'car', t1122: 'car' };
    function drawLightMask(rt, glw, w, h) {
        const amt = lampAmount(S.fs.hour) * cfg.lamps;
        S.maskCount = 0;
        if (amt < 0.01) return 0;
        if (!S.maskTypes || S.maskTypesRt !== rt) {
            S.maskTypesRt = rt;
            S.maskTypes = typesOf(rt).filter(t => t && MASK_TYPES[t.name]).map(t => ({ t, kind: MASK_TYPES[t.name] }));
        }
        const view = S.playerLayer;
        if (!view) return 0;
        const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga;
        const groups = {};
        for (const { t, kind } of S.maskTypes) for (const i of instancesOf(t)) {
            if (!i || !i.visible || !(i.opacity > 0.02) || !i.$n || !i.Wb || (i.C && !i.C.visible)) continue;
            if (typeof i.la === 'function') i.la();
            const b = i.ka;
            if (b && (b.right < vl || b.left > vr || b.bottom < vt || b.top > vb)) continue;
            (groups[kind] || (groups[kind] = [])).push(i);
        }
        const kinds = Object.keys(groups);
        if (!kinds.length) return 0;
        const gl = glw.T, mp = program(glw, 'mask'), tex = texture(glw, 'mask', w, h, true);
        const target = S.layoutRef && typeof S.layoutRef.el === 'function' ? S.layoutRef.el() : null;
        glw.hf();
        glw.le(tex);
        glw.clear(0, 0, 0, 0);
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
        glw.ld(mp.idx);
        glw.wh(gl.ONE, gl.ONE);          // lights add up
        glw.hf();                        // the mask program is current: tints can be set directly
        for (const kind of kinds) {
            const c = MASK_KIND[kind];
            if (mp.loc.uTint) gl.uniform3f(mp.loc.uTint, c[0], c[1], c[2]);
            if (mp.loc.uAsAlpha) gl.uniform1f(mp.loc.uAsAlpha, kind === 'car' ? 1 : 0);
            for (const i of groups[kind]) {
                const q = i.Wb;
                glw.wc(i.$n);
                glw.Oe(i.opacity);
                if (i.mc && i.mc.jk && i.mc.Ct) glw.Cd(q.eb, q.fb, q.Kb, q.Lb, q.yb, q.zb, q.wb, q.xb, i.mc.Ct);
                else glw.dk(q.eb, q.fb, q.Kb, q.Lb, q.yb, q.zb, q.wb, q.xb);
                S.maskCount++;
            }
            glw.hf();                    // draw this colour before the tint changes
        }
        if (mp.loc.uAsAlpha) gl.uniform1f(mp.loc.uAsAlpha, 0);
        glw.le(target);
        glw.ay();
        glw.ld(0);
        glw.wc(null);
        return amt;
    }
    function drawGrade(rt, glw) {
        const gl = glw.T;
        const w = glw.width | 0, h = glw.height | 0;
        if (w < 2 || h < 2 || gl.isContextLost()) return;
        const p = program(glw, 'grade');
        const tex = texture(glw, 'frame', w, h, false);
        const u = gradeValues(rt, glw, S.fs);
        const maskAmt = drawLightMask(rt, glw, w, h);
        const maskTex = S.texs.mask ? S.texs.mask.tex : tex;

        glw.hf();                       // everything drawn so far reaches the target
        glw.wc(tex); glw.ld(p.idx);
        glw.gk(maskTex, 1 / w, 1 / h, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, []); // mask on the second texture unit
        glw.hf();                       // our texture and program are now bound
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
        if (p.loc.uLightCount) gl.uniform1f(p.loc.uLightCount, lightBuf.n);
        // the light shadows on texture unit 2 (the engine uses 0 and 1)
        const ls = S.lsFrame === S.frameNo && S.texs.lshadow;
        // object-aware shafts read the sun-shadow texture on unit 3
        const sun = cfg.raysMode !== 'static' && S.sunTexFrame === S.frameNo && S.texs.shadow && S.sunTexGa > 0.01 ? S.texs.shadow : null;
        if (p.loc.uRayO) {
            const d = (S.fs && S.fs.dir) || [0, 1], stepPx = 9;
            gl.uniform4f(p.loc.uRayO, sun ? 1 : 0, -d[0] * stepPx / w, d[1] * stepPx / h, sun ? 1 / S.sunTexGa : 0);
        }
        if (sun && p.loc.samplerSun) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, sun.tex);
            gl.uniform1i(p.loc.samplerSun, 3);
            gl.activeTexture(gl.TEXTURE0);
        }
        if (p.loc.uShade) gl.uniform4f(p.loc.uShade, ls ? 1 : 0, 1 / w, 1 / h, cfg.weather && cfg.puddles > 0 ? clamp01(S.wet || 0) * Math.min(1.5, cfg.puddles) : 0);
        if (ls && p.loc.samplerShade) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, S.texs.lshadow.tex);
            gl.uniform1i(p.loc.samplerShade, 2);
            gl.activeTexture(gl.TEXTURE0);
        }
        const hazeFog = cfg.fog > 0 && S.playerLayer ? fogValues(S.fs, S.playerLayer).fog : 0;
        const haze = maskAmt ? Math.min(1.2, 1.1 * (S.rain || 0) * (1 - 0.45 * (S.snow || 0)) + 0.8 * hazeFog) : 0;
        if (p.loc.uMask) gl.uniform4f(p.loc.uMask, maskAmt ? 0.55 * maskAmt : 0, 0.08, S.flash || 0, haze);
        if (p.loc.uCA) gl.uniform4f(p.loc.uCA, S.caAmt || 0, 0, 0, 0);
        if (p.loc.uNvg) gl.uniform4f(p.loc.uNvg, (S.nvgNow || 0) * Math.min(1, cfg.nvg || 0), wrap(Math.floor(S.fs.t * 24) * 3.71, 64), S.nvgP45 || 0, 0);
        if (lightBuf.n && p.loc.uLights) gl.uniform4fv(p.loc.uLights, lightBuf.pos.subarray(0, (Q() >= 1 ? 12 : 8) * 4));
        if (lightBuf.n && p.loc.uLightCol) gl.uniform3fv(p.loc.uLightCol, lightBuf.col.subarray(0, (Q() >= 1 ? 12 : 8) * 3));
        for (const name of GRADE_UNIFORMS) {
            const v = u[name], at = p.loc[name];
            if (!at) continue;
            if (v.length === 4) gl.uniform4f(at, v[0], v[1], v[2], v[3]);
            else gl.uniform3f(at, v[0], v[1], v[2]);
        }
        glw.wh(gl.ONE, gl.ZERO);        // replace, not blend
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        if (ls) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); }
        if (sun) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); }
        glw.ay();
        glw.ld(0);
        rt.X = true;                    // grain and fog move: keep redrawing
        S.frames++;
    }

    // Wet ground pass (before the shadows, so they fall on the wet ground).
    const PUD_CELL = 80;    // world px per puddle noise cell
    function drawWet(rt, glw, view) {
        const gl = glw.T, w = glw.width | 0, h = glw.height | 0;
        if (w < 2 || h < 2 || gl.isContextLost()) return;
        const p = program(glw, 'wet'), tex = texture(glw, 'frame', w, h, false);
        const vl = view.Ca, vt = view.Da, spanX = view.Ha - view.Ca, spanY = view.Ga - view.Da;
        const night = lampAmount(S.hour);
        const sky = [lerp(0.55, 0.12, night), lerp(0.60, 0.15, night), lerp(0.68, 0.26, night)];
        glw.hf();
        glw.wc(tex); glw.ld(p.idx);
        glw.hf();
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
        if (p.loc.uWet) gl.uniform4f(p.loc.uWet, S.wet * cfg.puddles, ((performance.now() - S.t0) / 1000) % 64, 1, S.rain || 0);
        if (p.loc.uPud) gl.uniform4f(p.loc.uPud, ((vl / PUD_CELL) % 64 + 64) % 64, ((vt / PUD_CELL) % 64 + 64) % 64, spanX / PUD_CELL, spanY / PUD_CELL);
        if (p.loc.uSky) gl.uniform3f(p.loc.uSky, sky[0], sky[1], sky[2]);
        glw.wh(gl.ONE, gl.ZERO);
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.ay();
        glw.ld(0);
        glw.wc(null);
    }

    // Water pass: right after the Water layer, before the shadows and roofs.
    const WAT_CELL = 44;    // world px per swell noise cell
    const WATER_TYPES = { t208: 1 }; // tilemap_water: sea, lakes, rivers
    function drawWater(rt, glw, layer) {
        const gl = glw.T, w = glw.width | 0, h = glw.height | 0;
        S.waterDrawn = 0;
        if (w < 2 || h < 2 || gl.isContextLost()) return;
        if (!S.waterTypes || S.waterTypesRt !== rt) {
            S.waterTypesRt = rt;
            S.waterTypes = typesOf(rt).filter(t => t && WATER_TYPES[t.name]);
        }
        const vl = layer.Ca, vt = layer.Da, vr = layer.Ha, vb = layer.Ga;
        const maps = [];
        for (const t of S.waterTypes) for (const i of instancesOf(t)) {
            if (!i || !i.visible || !(i.opacity > 0.02) || i.C !== layer || typeof i.nb !== 'function') continue;
            if (typeof i.la === 'function') i.la();
            const b = i.ka;
            if (b && (b.right < vl || b.left > vr || b.bottom < vt || b.top > vb)) continue;
            maps.push(i);
        }
        if (!maps.length) return;
        const fs = S.fs, k = fs.k, night = lampAmount(fs.hour);
        const mp = program(glw, 'sil'), p = program(glw, 'water'); // sil: alpha-only coverage
        const mask = texture(glw, 'water', w, h, false), tex = texture(glw, 'frame', w, h, false);
        const target = S.layoutRef && typeof S.layoutRef.el === 'function' ? S.layoutRef.el() : null;

        // 1. where the water is: the tilemaps drawn again, alpha only
        glw.hf();
        glw.le(mask);
        glw.clear(0, 0, 0, 0);
        const sc = typeof layer.Lc === 'function' ? layer.Lc() : 1, ang = typeof layer.ib === 'function' ? layer.ib() : 0;
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
        glw.ld(mp.idx);
        glw.ay();
        for (const tm of maps) tm.nb(glw);
        glw.hf();
        glw.le(target);

        // 2. the frame so far through the water shader
        const spanX = vr - vl, spanY = vb - vt, t = fs.t, r = fs.rain;
        const amp = (1.2 + 1.3 * r) * cfg.water * (1 - 0.6 * (S.winter || 0));   // world px the bottom shifts by (cold water: calmer)
        // glints: warm sun by day (strongest low in the sky), faint cool moon at night
        const day = 1 - night, sunLow = 1 - Math.abs(fs.dir[1]);
        const gs = cfg.water * (1 - 0.8 * r) * (day * (0.30 + 0.45 * sunLow) + night * 0.16);
        const gc = [lerp(0.70, k.rayCol[0], day), lerp(0.80, k.rayCol[1], day), lerp(1.00, k.rayCol[2], day)];
        // warm grades would turn the blue-green water olive: lean it back
        const tn = k.tint, lum = (tn[0] + tn[1] + tn[2]) / 3;
        const warm = clamp01((tn[0] - tn[2]) / 0.35) * 0.65 * Math.min(1, cfg.water);
        const comp = tn.map(v => lerp(1, lum / Math.max(0.2, v), warm));
        glw.hf();
        glw.wc(tex); glw.ld(p.idx);
        glw.gk(mask, 1 / w, 1 / h, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, []); // mask on the second texture unit
        glw.hf();
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
        const L = p.loc;
        if (L.uWatA) gl.uniform4f(L.uWatA, wrap(vl / WAT_CELL, 64), wrap(vt / WAT_CELL, 64), spanX / WAT_CELL, spanY / WAT_CELL);
        if (L.uWatB) gl.uniform4f(L.uWatB, wrap(t * 0.21, 64), wrap(t * 0.13, 64), wrap(-t * 0.17, 64), wrap(t * 0.24, 64));
        if (L.uWatC) gl.uniform4f(L.uWatC, wrap(t * 0.55, 64), wrap(-t * 0.40, 64), wrap(-t * 0.47, 64), wrap(t * 0.52, 64));
        if (L.uWatD) gl.uniform4f(L.uWatD, amp / spanX, amp / spanY, 1, 0.56 + 0.12 * r);
        if (L.uGlint) gl.uniform4f(L.uGlint, gc[0] * gs, gc[1] * gs, gc[2] * gs, 0.35);
        if (L.uComp) gl.uniform3f(L.uComp, comp[0], comp[1], comp[2]);
        if (L.uIce) gl.uniform4f(L.uIce, (S.winter || 0) * Math.min(1, cfg.water), wrap(t * 0.012, 64), wrap(t * 0.004, 64), 0);
        glw.wh(gl.ONE, gl.ZERO);
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.ay();
        glw.ld(0);
        glw.wc(null);
        S.waterDrawn = maps.length;
        rt.X = true;
    }

    // Characters and vehicles near the view: the player, zombies, survivors,
    // animals, cars. Looked up at most every 100 ms.
    const ENTITY_LAYERS = ['player', 'Zeds', 'Survivors', 'Survivors2', 'vehicles'];
    function gatherEntities(rt, view) {
        const now = performance.now();
        if (S.entsAt && now - S.entsAt < 100 && S.entsView === view) return S.ents;
        S.entsAt = now; S.entsView = view;
        const out = [], vl = view.Ca - 150, vt = view.Da - 150, vr = view.Ha + 150, vb = view.Ga + 150;
        const me = localPlayer(rt, now);
        if (me) out.push({ x: me.x, y: me.y, r: 70, me: true, i: me });
        for (const L of S.entLayers || []) {
            if (!L.visible) continue;
            for (const i of instancesOf(L)) {
                if (!i || !i.visible || !(i.opacity > 0.3) || i === me) continue;
                const w = Math.abs(i.width || 0), h = Math.abs(i.height || 0);
                if (w < 12 || h < 12 || w > 260 || h > 260) continue;   // bodies and cars, not bars or markers
                if (i.x < vl || i.x > vr || i.y < vt || i.y > vb) continue;
                // a character is several sprites stacked on one spot: keep one
                if (out.some(o => Math.abs(o.x - i.x) < 6 && Math.abs(o.y - i.y) < 6)) continue;
                out.push({ x: i.x, y: i.y, r: L.name === 'vehicles' ? 90 : 55, i, veh: L.name === 'vehicles' });
                if (out.length >= 40) break;
            }
        }
        S.ents = out;
        return out;
    }
    function fogValues(fs, view) {
        const k = fs.k, r = fs.rain, t = fs.t, sw = S.snow || 0;
        const fog = Math.min(1, (k.fog + 0.35 * r + 0.3 * (S.snow || 0) * (S.winter || 0) * Math.min(1.5, cfg.snowfall)) * cfg.fog);
        // rain/snow haze is grey by day but dark at night (it glowed, and the
        // clearing around the player looked like a dark hole)
        const lit = 0.28 + 0.72 * (1 - lampAmount(fs.hour));
        const col = k.fogCol.map((v, i) => lerp(v, lerp([0.55, 0.58, 0.62][i], [0.84, 0.87, 0.92][i], sw) * lit, r * (0.6 + 0.25 * sw)));
        const vl = view.Ca, vt = view.Da, spanX = view.Ha - view.Ca, spanY = view.Ga - view.Da;
        return { fog, col, vl, vt, spanX, spanY, fx: wrap(vl / FOG_CELL + t * 0.030, 64), fy: wrap(vt / FOG_CELL + t * 0.009, 64), edge: 0.35 + 0.25 * r, warp: wrap(t * 0.05, 64) };
    }
    const clearBuf = new Float32Array(32);
    function drawFogField(rt, glw, view) {
        const gl = glw.T, w = glw.width | 0, h = glw.height | 0;
        if (w < 2 || h < 2 || gl.isContextLost()) return false;
        const v = fogValues(S.fs, view);
        if (v.fog < 0.005) return false;
        const div = Q() >= 2 ? 4 : 6, fw = Math.max(32, Math.ceil(w / div)), fh = Math.max(20, Math.ceil(h / div));
        const p = program(glw, 'foggen'), tex = texture(glw, 'fog', fw, fh, true);
        // the nearest characters part the fog
        const ents = gatherEntities(rt, view).slice().sort((a, b) =>
            Math.hypot(a.x - (v.vl + v.spanX / 2), a.y - (v.vt + v.spanY / 2)) - Math.hypot(b.x - (v.vl + v.spanX / 2), b.y - (v.vt + v.spanY / 2)));
        let n = 0;
        for (const e of ents) {
            if (n >= 8) break;
            clearBuf[n * 4] = (e.x - v.vl) / v.spanX; clearBuf[n * 4 + 1] = (e.y - v.vt) / v.spanY;
            clearBuf[n * 4 + 2] = e.r / v.spanY; clearBuf[n * 4 + 3] = e.me ? 0.85 : 0.6;
            n++;
        }
        // Same view, same people in it: the fog only drifts, so the field is
        // redrawn 20 times a second instead of every frame
        sigReset(); sigMix(fw); sigMix(fh); sigMix(v.vl); sigMix(v.vt); sigMix(v.spanX); sigMix(v.spanY); sigMix(v.fog * 1000); sigMix(v.edge * 1000); sigMix(n);
        for (let i = 0; i < n * 4; i++) sigMix(clearBuf[i] * 4096);
        const fsig = SIG.h, fnow = S.fs.now, FC = S.fogCache;
        if (FC && FC.sig === fsig && FC.tex === tex && fnow >= FC.at && fnow - FC.at < 50) {
            S.fogCol = v.col; S.fogFrame = S.frameNo; S.fogReused = (S.fogReused || 0) + 1;
            return true;
        }
        const target = S.layoutRef && typeof S.layoutRef.el === 'function' ? S.layoutRef.el() : null;
        glw.hf();
        glw.le(tex);
        gl.viewport(0, 0, fw, fh);
        glw.ld(p.idx);
        glw.hf();
        const L = p.loc;
        if (L.uFogA) gl.uniform4f(L.uFogA, v.fx, v.fy, v.spanX / FOG_CELL, v.spanY / FOG_CELL);
        if (L.uFogB) gl.uniform4f(L.uFogB, v.fog, v.edge, v.warp, 1);
        if (L.uFogS) gl.uniform4f(L.uFogS, w / Math.max(1, h), n, 0, 0);
        if (L.uClear) gl.uniform4fv(L.uClear, clearBuf);
        glw.wh(gl.ONE, gl.ZERO);
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.le(target);
        gl.viewport(0, 0, w, h);
        glw.ay();
        glw.ld(0);
        S.fogCol = v.col;
        S.fogFrame = S.frameNo;
        S.fogCache = { sig: fsig, tex, at: fnow };
        return true;
    }
    function drawFogComposite(glw, share) {
        const t = S.texs.fog;
        if (!t || S.fogFrame !== S.frameNo || !(share > 0)) return;
        const gl = glw.T, p = program(glw, 'fogcomp'), c = S.fogCol || [0.8, 0.8, 0.8];
        glw.hf();
        glw.wc(t.tex); glw.ld(p.idx);
        glw.hf();
        if (p.loc.uFogC) gl.uniform4f(p.loc.uFogC, c[0], c[1], c[2], share);
        glw.ay();
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.ld(0);
        glw.wc(null);
    }
    // Ground fog lies under trees, roofs and people (they stand in it); a
    // thinner haze over everything keeps the distance soft.
    // share of the fog under the objects / over everything, per fog style
    const fogShares = () => cfg.fogMode === 'top' ? [0, 1] : cfg.fogMode === 'ground' ? [0.85, 0] : [0.72, 0.5];

    // ---------------------------------------------------------------
    // Line of sight (MiniDayZ 2 style): the player sees in a circle around
    // them, and building walls and shut doors block the view.
    //   walls   every enterable building's interior sprite (b_*_int) is a
    //           Solid whose collision polygon traces its walls as a thin loop,
    //           open where the doors are; a shut door is a small thin t348
    //           plug in that gap (opening the door destroys it). Other t348
    //           (tree bases, fences, furniture) do not block the view.
    //   ground  where a wall hides it, or past the range, the ground, floors
    //           and loot are drawn darker (under people, trees, roofs, cars)
    //   hidden  zombies, animals, people, other players (and their names)
    //           and loot out of sight fade out
    // Local rendering only: each player's copy works out its own view.
    // ---------------------------------------------------------------
    const VIS_BASE_R = 380;               // world px seen at visionRange 1
    const VIS_WALL_RE = /_int-sheet/;
    const VIS_PLUG = 't348';
    const VIS_HIDE_LAYERS = { Zeds: 1, Survivors: 1, S_pants: 1, S_clothing: 1, s_vests: 1, s_helmets: 1, s_backpack: 1, s_weapons: 1,
        Survivors2: 1, s_pants2: 1, s_clothing2: 1, s_vests2: 1, s_helmets2: 1, s_backpack2: 1, s_weapons2: 1,
        player: 1, player_pants: 1, player_hands: 1, player_clothing: 1, player_vests: 1, player_helmets: 1, player_backpacks: 1, player_weapons: 1,
        items_on_ground: 1, Rain: 1 };
    const VIS_KEEP_IMG = /^berry_bush|^car_save|waypoint/;   // on items_on_ground, but scenery
    const VIS_RAIN_IMG = /^npc_hp_bar|^zed_.*shadow/;          // the Rain layer: only zombie health bars and shadows
    const VIS_NEAR2 = 2 * 2;                                // the player's own sprites: always seen
    const VIS_PUSH = 0;                                      // the ground's dark starts this far behind a wall line
    const V = { on: false, frame: 0, ex: 0, ey: 0, gx: 1e9, gy: 1e9, R: 0, R2: 0, segs: [], n: 0, at: 0, last: 0, dt: 0, done: false,
        focus:false,fx:1,fy:0,fcos:0,solid: null, solidRt: null, plug: null, error: '', drawn: 0, hid: 0, labels: 0 };
    const visOn = () => V.on && cfg.visionHide !== false;
    // the walls and shut doors around (ex, ey), as segments x1,y1,x2,y2
    function visGather(rt, ex, ey, reach) {
        if (!V.solid || V.solidRt !== rt) {
            V.solidRt = rt;
            V.solid = typesOf(rt).filter(t => t && (t.qb || []).some(b => b && /^Solid/.test(b.name)));
            V.plug = typesOf(rt).find(t => t && t.name === VIS_PLUG) || null;
        }
        const out = [];
        for (const t of V.solid) {
            if (t.__mdzVisWall === false) continue;
            for (const i of instancesOf(t)) {
                if (!i || !i.mc || !i.C) continue;
                if (t.__mdzVisWall === undefined) {
                    const src = i.mc.N && i.mc.N.src;
                    if (!src) continue;
                    t.__mdzVisWall = VIS_WALL_RE.test(src);
                    if (!t.__mdzVisWall) break;
                }
                const w = i.width, h = i.height, ext = Math.abs(w) + Math.abs(h);
                if (Math.abs(i.x - ex) > reach + ext || Math.abs(i.y - ey) > reach + ext) continue;
                if (i.Z && i.Z.solidEnabled === false) continue;
                if (typeof i.la === 'function') i.la();
                // Use the engine's collision polygon, including its origin and rotation.
                // An empty custom polygon means the normal rectangular collider, not no wall.
                const poly = i.Ia;
                if (poly && typeof poly.li === 'function' && !poly.li()) {
                    poly.Ng(w, h, i.u || 0);
                    const points = poly.Xa, n = poly.hd;
                    for (let k = 0; k < n; k++) {
                        const j = (k + 1) % n;
                        out.push(i.x + points[k * 2], i.y + points[k * 2 + 1],
                            i.x + points[j * 2], i.y + points[j * 2 + 1]);
                    }
                } else {
                    const b = i.ka;
                    if (b) out.push(b.left, b.top, b.right, b.top, b.right, b.top, b.right, b.bottom,
                        b.right, b.bottom, b.left, b.bottom, b.left, b.bottom, b.left, b.top);
                }
            }
        }
        // shut doors: small thin plugs (the others are tree bases, fences, furniture)
        for (const i of instancesOf(V.plug)) {
            if (!i || !i.C || i.x < 0 || i.y < 0) continue;
            const w = Math.abs(i.width), h = Math.abs(i.height);
            if (Math.min(w, h) > 10 || Math.max(w, h) > 32) continue;
            if (Math.abs(i.x - ex) > reach || Math.abs(i.y - ey) > reach) continue;
            if (typeof i.la === 'function') i.la();
            const b = i.ka;
            if (!b) continue;
            out.push(b.left, b.top, b.right, b.top, b.right, b.top, b.right, b.bottom,
                b.right, b.bottom, b.left, b.bottom, b.left, b.bottom, b.left, b.top);
        }
        return out;
    }
    // Once per frame: where the player's eyes are and the walls around them
    // (walls looked up again every 120 ms, or after a step of 60 px).
    function visionFrame(rt, layout, now) {
        V.on = false; V.done = false;
        if (!(cfg.vision > 0) || !layout || layout.name !== 'Map') return;
        const me = localPlayer(rt, now);
        if (!me) return;
        V.dt = Math.min(0.1, Math.max(0, (now - (V.last || now)) / 1000)); V.last = now;
        V.frame++;
        // the eyes: the drawn body (t181; its clothes sit exactly on it), else the mover
        if (!V.bodyType || V.bodyRt !== rt) { V.bodyRt = rt; V.bodyType = typesOf(rt).find(x => x && x.name === 't181') || null; }
        let body = null;
        for (const i of instancesOf(V.bodyType)) if (i && !i.__mdzRemoteVisual && !i.__mdzHurtbox) { body = i; break; }
        const eye = body || me;
        V.ex = eye.x; V.ey = eye.y;
        V.R = VIS_BASE_R * Math.max(0.3, Math.min(3, +cfg.visionRange || 1));
        V.R2 = V.R * V.R * 0.9;
        // Focus is a visual cone only. Native weapon/target/bullet distances are unchanged.
        V.focus=false;V.fx=1;V.fy=0;V.fcos=0;
        const globals=globalsList(rt),read=name=>{const q=globals.find(v=>v.name===name);return q?q.data:0;};
        if(body&&body.cc&&Number(body.cc[3])>0&&Number(read('isAim'))===1&&Number(read('mp_auto_aim'))===1){
            const targetType=typesOf(rt).find(t=>t&&t.name==='t507'),marker=instancesOf(targetType)[0];
            {const hasTarget=marker&&marker.visible&&marker.cc&&Number(marker.cc[0])>=0&&typeof rt.tj==='function'&&rt.tj(Number(marker.cc[0]));
                const dx=hasTarget?marker.x-eye.x:Math.cos(Number(me.u)||0),dy=hasTarget?marker.y-eye.y:Math.sin(Number(me.u)||0),d=Math.hypot(dx,dy);
                if(d>0.0001){let half=Number(body.cc[3])===2?45:35;
                    const weapon=typeof rt.tj==='function'?rt.tj(Number(body.cc[Number(body.cc[3])===2?43:2])):null;
                    if(weapon&&weapon.cc&&Number(weapon.cc[Number(body.cc[3])===2?18:17])>0)half=Number(body.cc[3])===2?38:25;
                    V.focus=true;V.fx=dx/d;V.fy=dy/d;V.fcos=Math.cos(half*Math.PI/180);
                    // Aimed firearms use their actual native acquisition range, including supported scopes.
                    // The host multiplier scales every player's baseline and aimed range equally.
                    V.R=Math.max(1,(Number(read("weapon_r"))||400)*Math.max(.3,Math.min(3,+cfg.visionRange||1.5))/1.5);V.R2=V.R*V.R*.9;
                }
            }
        }
        if (now - V.at > 50 || now < V.at || Math.abs(me.x - V.gx) > 16 || Math.abs(me.y - V.gy) > 16) {
            V.segs = visGather(rt, me.x, me.y, V.R + 140);
            V.n = V.segs.length; V.at = now; V.gx = me.x; V.gy = me.y;
        }
        V.on = true;
    }
    // Can the player see the point (x, y)? (in range, and no wall in between)
    function visClear(x, y) {
        const ex = V.ex, ey = V.ey, dx = x - ex, dy = y - ey;
        if (dx * dx + dy * dy > V.R2) return 0;
        if(V.focus&&(dx*V.fx+dy*V.fy)/Math.max(0.0001,Math.hypot(dx,dy))<V.fcos)return 0;
        const s = V.segs, n = V.n;
        const minx = Math.min(ex, x), maxx = Math.max(ex, x), miny = Math.min(ey, y), maxy = Math.max(ey, y);
        for (let k = 0; k < n; k += 4) {
            const ax = s[k], ay = s[k + 1], bx = s[k + 2], by = s[k + 3];
            if ((ax < minx && bx < minx) || (ax > maxx && bx > maxx) || (ay < miny && by < miny) || (ay > maxy && by > maxy)) continue;
            const rx = bx - ax, ry = by - ay, den = dx * ry - dy * rx;
            if (Math.abs(den)<0.000001) {
                // Looking along a wall must not reveal its far corner through a collinear gap.
                if(Math.abs((ax-ex)*dy-(ay-ey)*dx)<0.0001){const len2=dx*dx+dy*dy,t1=((ax-ex)*dx+(ay-ey)*dy)/len2,t2=((bx-ex)*dx+(by-ey)*dy)/len2;if(Math.max(t1,t2)>0.0001&&Math.min(t1,t2)<0.9999)return 0;}
                continue;
            }
            const qx = ax - ex, qy = ay - ey;
            const t = (qx * ry - qy * rx) / den, u = (qx * dy - qy * dx) / den;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) return 0;
        }
        return 1;
    }
    // How much of a sprite on a hidden-when-unseen layer shows (0..1), eased
    // so things fade in as they come into view and out as they leave it.
    function visAlpha(i) {
        if (i.__mdzVf === V.frame) return i.__mdzVa;
        const L = i.C.name;
        let target = 1;
        if (L === 'items_on_ground' || L === 'Rain') {
            const fr = i.mc;
            let keep = fr ? fr.__mdzVisKeep : true;
            if (fr && keep === undefined) {
                const n = imageName(i);
                keep = n ? (L === 'Rain' ? !VIS_RAIN_IMG.test(n) : VIS_KEEP_IMG.test(n)) : true;
                if (n) fr.__mdzVisKeep = keep;
            }
            if (keep) { i.__mdzVf = V.frame; i.__mdzVa = 1; return 1; }
        }
        const dx = i.x - V.ex, dy = i.y - V.ey;
        // the player's own body and clothes (exactly on the eyes): always, no fade
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) { i.__mdzVa = 1; i.__mdzVf = V.frame; return 1; }
        if (dx * dx + dy * dy > VIS_NEAR2) target = visClear(i.x, i.y);
        let a = (i.__mdzVa === undefined || i.__mdzVf < V.frame - 30) ? target : i.__mdzVa;
        a += (target - a) * Math.min(1, V.dt * (target > a ? 9 : 5));
        if (Math.abs(a - target) < 0.02) a = target;
        i.__mdzVa = a; i.__mdzVf = V.frame;
        if (a < 0.01) V.hid++;
        return a;
    }
    // Right after the shadows (over the ground, floors and loot, under people,
    // trees, roofs and cars): what the walls hide, and past the range, darker.
    function visionPass(layer, glw) {
        if (V.done || !V.on || !S.shadowBoundary || layer.index <= S.shadowBoundary.index) return;
        V.done = true;
        if (V.error) return;
        const rt = runtime(); glw = glw || glwOf(rt);
        if (!rt || !glw) return;
        try { drawVision(glw, S.shadowBoundary); }
        catch (e) {
            V.error = String(e && e.message || e);
            try { glw.le(S.layoutRef.el()); glw.T.viewport(0, 0, glw.width | 0, glw.height | 0); glw.ay(); glw.ld(0); glw.wc(null); } catch (x) {}
            console.warn('[MDZ Lighting] line of sight disabled:', V.error);
        }
    }
    function drawVision(glw, view) {
        const gl = glw.T, w = glw.width | 0, h = glw.height | 0;
        if (w < 2 || h < 2 || gl.isContextLost()) return;
        const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga, spanX = vr - vl, spanY = vb - vt;
        if (!(spanX > 0) || !(spanY > 0)) return;
        const fw = Math.max(16, Math.ceil(w / 2)), fh = Math.max(16, Math.ceil(h / 2));
        const gp = program(glw, 'visgen'), cp = program(glw, 'viscomp'), tex = texture(glw, 'vis', fw, fh, true);
        const target = S.layoutRef && typeof S.layoutRef.el === 'function' ? S.layoutRef.el() : null;
        glw.hf();
        glw.le(tex);
        gl.viewport(0, 0, fw, fh);
        glw.clear(0, 0, 0, 0);
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
        glw.ld(gp.idx);
        glw.wh(gl.ONE, gl.ONE);
        glw.Oe(1);
        // each wall edge darkens everything behind it, out past the view
        // (an edge outside the view hides nothing inside it: the view is convex).
        // The dark starts VIS_PUSH px behind the wall line, so the wall's own
        // painted face (drawn just past its collision line) stays lit.
        const s = V.segs, n = V.n, ex = V.ex, ey = V.ey, FAR = (spanX + spanY) * 2;
        let drawn = 0;
        for (let k = 0; k < n; k += 4) {
            const ax = s[k], ay = s[k + 1], bx = s[k + 2], by = s[k + 3];
            if ((ax < vl && bx < vl) || (ax > vr && bx > vr) || (ay < vt && by < vt) || (ay > vb && by > vb)) continue;
            const d1x = ax - ex, d1y = ay - ey, d2x = bx - ex, d2y = by - ey;
            const m1 = Math.hypot(d1x, d1y) || 1, m2 = Math.hypot(d2x, d2y) || 1;
            const p1 = VIS_PUSH / m1, p2 = VIS_PUSH / m2, l1 = FAR / m1, l2 = FAR / m2;
            glw.dk(ax + d1x * p1, ay + d1y * p1, bx + d2x * p2, by + d2y * p2, bx + d2x * l2, by + d2y * l2, ax + d1x * l1, ay + d1y * l1);
            drawn++;
        }
        glw.hf();
        glw.le(target);
        gl.viewport(0, 0, w, h);
        V.drawn = drawn;
        // laid over the frame: the texture softened, and the edge of the range
        glw.wc(tex); glw.ld(cp.idx);
        glw.hf();
        const L = cp.loc, str = Math.min(0.95, Math.max(0, +cfg.vision || 0));
        if (L.uVisA) gl.uniform4f(L.uVisA, str, 1.5 / fw, 1.5 / fh, 0);
        if (L.uVisB) gl.uniform4f(L.uVisB, (ex - vl) / spanX, (ey - vt) / spanY, spanX / V.R, spanY / V.R);
        if (L.uVisC) gl.uniform4f(L.uVisC, 0.02, 0.025, 0.035, 0.8);
        if (L.uVisD) gl.uniform4f(L.uVisD,V.fx,V.fy,V.fcos,V.focus?1:0);
        glw.ay();
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.ld(0);
        glw.wc(null);
    }
    // Other players' names (the MP mod's DOM labels, class mdzNick, placed
    // 30 px above the body): hidden with the body. Only 'visibility' is used,
    // which the MP mod never sets, so nothing of its own is overwritten.
    let visNickEls = null;
    function visionLabels(rt) {
        if (!visNickEls) { if (typeof document.getElementsByClassName !== 'function') return; visNickEls = document.getElementsByClassName('mdzNick'); }
        if (!visNickEls.length) return;
        const on = visOn(), view = S.playerLayer, cv = on && ((rt && rt.canvas) || document.getElementById('c2canvas'));
        const rc = cv ? cv.getBoundingClientRect() : null;
        V.labels = 0;
        for (let k = 0; k < visNickEls.length; k++) {
            const el = visNickEls[k];
            if (!on || !view || !rc || !(rc.width > 0)) { if (el.style.visibility) el.style.visibility = ''; continue; }
            if (el.style.display === 'none') continue;
            const sx = parseFloat(el.style.left), sy = parseFloat(el.style.top);
            if (!isFinite(sx) || !isFinite(sy)) continue;
            const wx = view.Ca + (sx - rc.left - window.scrollX) / rc.width * (view.Ha - view.Ca);
            const wy = view.Da + (sy - rc.top - window.scrollY) / rc.height * (view.Ga - view.Da) + 30;
            const dx = wx - V.ex, dy = wy - V.ey;
            const seen = dx * dx + dy * dy <= VIS_NEAR2 || visClear(wx, wy);
            const want = seen ? '' : 'hidden';
            if (el.style.visibility !== want) el.style.visibility = want;
            if (!seen) V.labels++;
        }
    }

    // ---------------------------------------------------------------
    // Fireflies: at dusk and night, now and then a few of them come out
    // around trees standing together, groups of bushes and water's edge.
    // They drift and blink, and scatter and fade when anyone comes close.
    // ---------------------------------------------------------------
    const TREE_TYPES = ['t207', 't209', 't577', 't581', 't210', 't972', 't699', 't184', 't576'];
    const BUSH_TILES = { 26: 1, 27: 1, 28: 1, 29: 1, 75: 1, 76: 1, 77: 1, 78: 1 };
    // Which water tiles are the shore (partly see-through in tilemap_water.png).
    // Read once from the image; if it can't be read, no fireflies by water.
    function waterEdges() {
        if (S.waterEdgeState) return S.waterEdgeIds;
        S.waterEdgeState = 'loading';
        const img = new Image();
        img.onload = () => {
            try {
                const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
                const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
                const T = 30, cols = Math.floor(img.width / T), rows = Math.floor(img.height / T), ids = {};
                for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                    const d = cx.getImageData(c * T, r * T, T, T).data;
                    let lo = 0, hi = 0;
                    for (let i = 3; i < d.length; i += 4) { if (d[i] < 200) lo++; if (d[i] > 60) hi++; }
                    if (lo > 20 && hi > 20) ids[r * cols + c] = 1;
                }
                S.waterEdgeIds = ids; S.waterEdgeState = 'ok';
            } catch (e) { S.waterEdgeState = 'failed'; }
        };
        img.onerror = () => { S.waterEdgeState = 'failed'; };
        img.src = 'images/tilemap_water.png';
        return null;
    }
    function tilesIn(typeName, test, vl, vt, vr, vb, out, max) {
        const t = typesOf(runtime()).find(x => x && x.name === typeName);
        for (const tm of instancesOf(t)) {
            if (!tm || !tm.visible || typeof tm.kr !== 'function' || !(tm.jc > 0)) continue;
            const cw = tm.Xb * tm.jc, chh = tm.lc * tm.ic;
            for (let cx = Math.floor((vl - tm.x) / cw); cx <= Math.floor((vr - tm.x) / cw); cx++)
                for (let cy = Math.floor((vt - tm.y) / chh); cy <= Math.floor((vb - tm.y) / chh); cy++) {
                    const ch = tm.kr(cx, cy);
                    if (!ch) continue;
                    ch.Xl();
                    for (const r of ch.Ec) {
                        if (r.id === -1 || !test(r.id & TILE_ID)) continue;
                        const k = r.Ta, x0 = k.left + tm.x, y0 = k.top + tm.y;
                        const nx = Math.max(1, Math.round((k.right - k.left) / tm.jc));
                        for (let i = 0; i < nx; i++) {
                            const x = x0 + (i + 0.5) * tm.jc, y = y0 + tm.ic * 0.5;
                            if (x < vl || x > vr || y < vt || y > vb) continue;
                            out.push({ x, y });
                            if (out.length >= max) return;
                        }
                    }
                }
        }
    }
    // pairs closer than d: the midpoint of each (at most max)
    function clusters(pts, d, max) {
        const out = [];
        for (let i = 0; i < pts.length && out.length < max; i++)
            for (let j = i + 1; j < pts.length; j++) {
                const a = pts[i], b = pts[j];
                if (Math.abs(a.x - b.x) < d && Math.abs(a.y - b.y) < d && Math.hypot(a.x - b.x, a.y - b.y) < d) { out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); break; }
            }
        return out;
    }
    function flySpots(rt, view) {
        const now = performance.now();
        if (S.flySpots && now - S.flySpotsAt < 2500) return S.flySpots;
        S.flySpotsAt = now;
        const m = 220, vl = view.Ca - m, vt = view.Da - m, vr = view.Ha + m, vb = view.Ga + m;
        const trees = [];
        for (const name of TREE_TYPES) {
            const t = typesOf(rt).find(x => x && x.name === name);
            for (const i of instancesOf(t)) if (i && i.visible && i.x > vl && i.x < vr && i.y > vt && i.y < vb) { trees.push({ x: i.x, y: i.y }); if (trees.length > 160) break; }
        }
        const bushes = [];
        const berry = typesOf(rt).find(x => x && x.name === 't296');
        for (const i of instancesOf(berry)) if (i && i.visible && i.x > vl && i.x < vr && i.y > vt && i.y < vb) bushes.push({ x: i.x, y: i.y });
        tilesIn('t230', id => BUSH_TILES[id], vl, vt, vr, vb, bushes, 160);
        const spots = clusters(trees, 120, 30).concat(clusters(bushes, 80, 30));
        const edges = waterEdges();
        if (edges) { const w = []; tilesIn('t208', id => edges[id], vl, vt, vr, vb, w, 400); for (let i = 0; i < 25 && w.length; i++) spots.push(w[(Math.random() * w.length) | 0]); }
        S.flySpots = spots;
        return spots;
    }
    S.flies = [];
    function stepFireflies(rt, view, fs) {
        const dt = Math.min(0.1, fs.dt || 0.016), night = lampAmount(fs.hour);
        const want = cfg.fireflies > 0 && night > 0.25 && fs.rain < 0.3 && !S.snowing;
        const max = Math.round((Q() >= 2 ? 28 : Q() === 1 ? 18 : 10) * Math.min(1.6, cfg.fireflies));
        const ents = gatherEntities(rt, view);
        // now and then a few come out
        if (want && S.flies.length < max && fs.t > (S.flyNext || 0)) {
            S.flyNext = fs.t + 0.6;
            if (Math.random() < 0.35 * Math.min(1.6, cfg.fireflies) * night) {
                const spots = flySpots(rt, view);
                const sp = spots.length ? spots[(Math.random() * spots.length) | 0] : null;
                if (sp && !ents.some(e => Math.hypot(e.x - sp.x, e.y - sp.y) < 120)) {
                    const n = 3 + ((Math.random() * 4) | 0);
                    for (let i = 0; i < n && S.flies.length < max; i++) {
                        const a = Math.random() * Math.PI * 2, r = Math.random() * 35;
                        S.flies.push({ x: sp.x + Math.cos(a) * r, y: sp.y + Math.sin(a) * r - 10, hx: sp.x, hy: sp.y - 10, vx: 0, vy: 0,
                            dir: Math.random() * Math.PI * 2, ph: Math.random() * 6.28, per: 1.4 + Math.random() * 2.2,
                            age: 0, life: 20 + Math.random() * 30, fade: 0, flee: false, size: 7 + Math.random() * 3.5 });
                    }
                }
            }
        }
        for (let i = S.flies.length - 1; i >= 0; i--) {
            const f = S.flies[i];
            f.age += dt;
            if (!f.flee) {
                // anyone close: off they go
                for (const e of ents) {
                    const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
                    if (d < (e.me ? 85 : 70)) { f.flee = true; const s = 90 + Math.random() * 60; f.vx = dx / (d || 1) * s + (Math.random() - 0.5) * 40; f.vy = dy / (d || 1) * s - 20; break; }
                }
            }
            if (f.flee) {
                f.fade -= dt / 1.1;
                f.vy -= 25 * dt;
            } else {
                // wander about home, fading in, and out again at the end of the night or of its life
                f.dir += (Math.random() - 0.5) * 3.0 * dt;
                const sp = 16;
                f.vx += (Math.cos(f.dir) * sp - f.vx) * 1.2 * dt + (f.hx - f.x) * 0.3 * dt;
                f.vy += (Math.sin(f.dir) * sp * 0.7 - f.vy) * 1.2 * dt + (f.hy - f.y) * 0.3 * dt;
                const out = !want || f.age > f.life;
                f.fade = Math.max(0, Math.min(1, f.fade + (out ? -dt / 2 : dt / 1.5)));
                if (out && f.fade <= 0) { S.flies.splice(i, 1); continue; }
            }
            f.x += f.vx * dt; f.y += f.vy * dt;
            if (f.flee && f.fade <= 0) S.flies.splice(i, 1);
        }
    }
    function drawFireflies(rt, glw, view, fs) {
        stepFireflies(rt, view, fs);
        if (!S.flies.length) return;
        const gl = glw.T, p = program(glw, 'fly'), night = lampAmount(fs.hour);
        const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga;
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        glw.hf();
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
        glw.ld(p.idx);
        glw.hf();
        const pix = cfg.flyPixel !== false, size = Math.max(0.3, Math.min(3, +cfg.flySize || 1));
        if (p.loc.uTint) gl.uniform3f(p.loc.uTint, pix ? 0.95 : 0.85, 1.0, pix ? 0.35 : 0.42);
        if (p.loc.uPix) gl.uniform1f(p.loc.uPix, pix ? 1 : 0);
        const cell = Math.max(1, Math.round(size * 1.2));   // art pixels per firefly pixel
        glw.wh(gl.ONE, gl.ONE);
        if (S.texs.frame) glw.wc(S.texs.frame.tex);
        let n = 0;
        for (const f of S.flies) {
            if (f.x < vl - 20 || f.x > vr + 20 || f.y < vt - 20 || f.y > vb + 20) continue;
            const b = Math.pow(Math.max(0, Math.sin(f.ph + f.age * 6.2832 / f.per)), 3);
            let a = (0.12 + 0.88 * b) * Math.max(0, f.fade) * Math.min(1, night * 1.3) * Math.min(1.2, 0.5 + 0.5 * cfg.fireflies);
            if (a < 0.01) continue;
            const y = f.y + Math.sin(f.age * 1.7 + f.ph) * 2;
            if (pix) {
                // stepped blink, snapped to the art-pixel grid
                a = Math.ceil(a * 4) / 4;
                const x0 = (Math.round(f.x / cell) - 2) * cell, y0 = (Math.round(y / cell) - 2) * cell, e = 5 * cell;
                glw.Oe(a);
                glw.dk(x0, y0, x0 + e, y0, x0 + e, y0 + e, x0, y0 + e);
            } else {
                const r = f.size * (0.5 + 0.5 * size) * (0.85 + 0.3 * b);
                glw.Oe(a);
                glw.dk(f.x - r, y - r, f.x + r, y - r, f.x + r, y + r, f.x - r, y + r);
            }
            n++;
        }
        glw.hf();
        glw.Oe(1);
        glw.ay();
        glw.ld(0);
        glw.wc(null);
        S.flyDrawn = n;
    }

    // ---------------------------------------------------------------
    // Winter. The snow island's ground is one tilemap type
    // (ground_lvl5_tilemap, 60 px tiles, 5 per row); its snow tiles are told
    // from its asphalt and grass by their colour in the image.
    // ---------------------------------------------------------------
    const SNOW_GROUND = 't980';
    function winterGround(rt) {
        if (!S.snowGroundType || S.snowGroundRt !== rt) { S.snowGroundRt = rt; S.snowGroundType = typesOf(rt).find(x => x && x.name === SNOW_GROUND) || null; }
        return S.snowGroundType;
    }
    function inWinterRegion(rt, x, y) {
        for (const m of instancesOf(winterGround(rt))) if (m && x >= m.x && y >= m.y && x < m.x + m.width && y < m.y + m.height) { snowTileIds(); return true; }
        return false;
    }
    function snowTileIds() {
        if (S.snowTiles || S.snowTilesLoading) return S.snowTiles;
        S.snowTilesLoading = true;
        const img = new Image();
        img.onload = () => {
            try {
                const T = 60, cols = Math.floor(img.width / T), rows = Math.floor(img.height / T), ids = {};
                const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
                const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
                for (let t = 0; t < cols * rows; t++) {
                    const d = cx.getImageData((t % cols) * T, Math.floor(t / cols) * T, T, T).data;
                    let n = 0, snow = 0;
                    for (let i = 0; i < d.length; i += 4) {
                        if (d[i + 3] < 128) continue; n++;
                        const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114, ch = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
                        if (l > 150 && ch < 40) snow++;
                    }
                    if (n > T * T * 0.5 && snow > n * 0.6) ids[t] = 1;
                }
                S.snowTiles = ids;
            } catch (e) { S.snowTiles = null; S.snowTilesAny = true; }
        };
        img.onerror = () => { S.snowTilesAny = true; };
        img.src = 'images/ground_lvl5_tilemap.png';
        return null;
    }
    // is the ground at (x, y) snow? cached per 20 px cell for a few seconds
    function snowAt(rt, x, y) {
        const now = performance.now();
        if (!S.snowCache || now - S.snowCacheAt > 4000 || S.snowCache.size > 6000) { S.snowCache = new Map(); S.snowCacheAt = now; }
        const key = Math.floor(x / 20) + ',' + Math.floor(y / 20);
        let v = S.snowCache.get(key);
        if (v !== undefined) return v;
        v = false;
        const ids = snowTileIds();
        // the ground is several overlapping tilemaps: the first real tile at the point decides
        search: for (const m of instancesOf(winterGround(rt))) {
            if (!m || x < m.x || y < m.y || x >= m.x + m.width || y >= m.y + m.height || typeof m.kr !== 'function') continue;
            const ch = m.kr(Math.floor((x - m.x) / (m.Xb * m.jc)), Math.floor((y - m.y) / (m.lc * m.ic)));
            if (!ch) continue;
            ch.Xl();
            for (const r of ch.Ec) {
                const k = r.Ta;
                if (r.id === -1 || x < k.left + m.x || x >= k.right + m.x || y < k.top + m.y || y >= k.bottom + m.y) continue;
                v = ids ? !!ids[r.id & TILE_ID] : !!S.snowTilesAny;
                break search;
            }
        }
        if (ids || S.snowTilesAny) S.snowCache.set(key, v);   // not before the tile image is read
        return v;
    }
    // a dot texture (4x4 white) for prints and flakes
    function dotTex(glw) {
        if (S.dot && S.dot.glw === glw) return S.dot.tex;
        const cv = document.createElement('canvas'); cv.width = cv.height = 4;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4);
        const tex = glw.td(4, 4, false, false, false);
        glw.Zy(cv, tex, false);
        S.dot = { glw, tex };
        return tex;
    }
    // a soft round puff (radial gradient) for breath
    function puffTex(glw) {
        if (S.puff && S.puff.glw === glw) return S.puff.tex;
        const N = 32, cv = document.createElement('canvas'); cv.width = cv.height = N;
        const g = cv.getContext('2d'), grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
        grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, N, N);
        const tex = glw.td(N, N, true, false, false);
        glw.Zy(cv, tex, false);
        S.puff = { glw, tex };
        return tex;
    }
    // a rotated rectangle around (cx, cy): length along (ux, uy), width across
    function orientedQuad(glw, cx, cy, ux, uy, len, wid) {
        const hx = ux * len / 2, hy = uy * len / 2, px = -uy * wid / 2, py = ux * wid / 2;
        glw.dk(cx - hx - px, cy - hy - py, cx + hx - px, cy + hy - py, cx + hx + px, cy + hy + py, cx - hx + px, cy - hy + py);
    }
    // the bottom middle of a sprite (where its feet or wheels are)
    function footOf(i) {
        if (typeof i.la === 'function') i.la();
        const b = i.ka;
        // the player's anchor (t193) is a 2x2 point at the body's centre; the
        // body (30x30) stands with its feet ~12 px lower
        if (!b || b.bottom - b.top < 8) return [i.x, i.y + 12];
        return [(b.left + b.right) / 2, b.bottom - 2];
    }
    function headOf(i) {
        if (typeof i.la === 'function') i.la();
        const b = i.ka;
        if (!b || b.bottom - b.top < 8) return [i.x, i.y - 9];
        return [(b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.2];
    }

    // sand: the sand tilemap (tilemap_sand, layer "sand") has a tile there
    const SAND_LIFE = 60, MUD_LIFE = 90;
    function sandAt(rt, x, y) {
        if (!S.sandType || S.sandTypeRt !== rt) { S.sandTypeRt = rt; S.sandType = typesOf(rt).find(t => t && t.name === 't418') || null; }
        const now = performance.now();
        if (!S.sandCache || now - S.sandCacheAt > 4000 || S.sandCache.size > 6000) { S.sandCache = new Map(); S.sandCacheAt = now; }
        const key = Math.floor(x / 20) + ',' + Math.floor(y / 20);
        let v = S.sandCache.get(key);
        if (v !== undefined) return v;
        v = false;
        search: for (const m of instancesOf(S.sandType)) {
            if (!m || !m.visible || x < m.x || y < m.y || x >= m.x + m.width || y >= m.y + m.height || typeof m.kr !== 'function') continue;
            const ch = m.kr(Math.floor((x - m.x) / (m.Xb * m.jc)), Math.floor((y - m.y) / (m.lc * m.ic)));
            if (!ch) continue;
            ch.Xl();
            for (const r of ch.Ec) {
                const k = r.Ta;
                if (r.id !== -1 && x >= k.left + m.x && x < k.right + m.x && y >= k.top + m.y && y < k.bottom + m.y) { v = true; break search; }
            }
        }
        S.sandCache.set(key, v);
        return v;
    }
    // ---- footprints and tyre tracks
    S.prints = []; S.tracks = new Map();
    function stepPrints(rt, view, fs) {
        const now = fs.t, snowing = (S.snow || 0) > 0.3;
        // they fill in: a couple of minutes, much faster while it snows
        const life = snowing ? 45 : 150;
        for (let k = S.prints.length - 1; k >= 0; k--) { const q = S.prints[k]; if (now - q.t > (q.s === 2 ? SAND_LIFE : q.s === 3 ? MUD_LIFE : life)) S.prints.splice(k, 1); }
        if (!cfg.footprints) return;
        const ents = gatherEntities(rt, view);
        const seen = new Set();
        for (const e of ents) {
            const i = e.i;
            if (!i || (!i.visible && !e.me)) continue;   // the player's anchor (t193) is invisible
            const [x, y] = footOf(i);
            const key = i.uid;
            seen.add(key);
            let tr = S.tracks.get(key);
            if (!tr) { S.tracks.set(key, { x, y, d: 0, side: 1 }); continue; }
            const dx = x - tr.x, dy = y - tr.y, d = Math.hypot(dx, dy);
            if (d > 60) { tr.x = x; tr.y = y; tr.d = 0; continue; }   // a teleport, not a step
            if (d < 0.5) continue;
            tr.d += d; tr.x = x; tr.y = y;
            const ux = dx / d, uy = dy / d;
            const stride = e.veh ? 5 : 9;
            if (tr.d < stride) continue;
            tr.d = 0;
            // the sand layer lies over the ground; after rain the open ground is
            // mud (roads, floors and water are drawn over the prints anyway)
            const surf = sandAt(rt, x, y) ? 2 : snowAt(rt, x, y) ? 1 : cfg.weather && (S.wet || 0) > 0.25 && !S.snowing ? 3 : 0;
            if (!surf) continue;
            if (e.veh) {
                const half = Math.min(Math.abs(i.width), Math.abs(i.height)) * 0.33;
                for (const sd of [-1, 1]) S.prints.push({ x: x - uy * half * sd, y: y - 6 + ux * half * sd, ux, uy, len: 7, wid: 3.6, t: now, a: 0.65, s: surf });
            } else {
                tr.side = -tr.side;
                S.prints.push({ x: x - uy * 3 * tr.side, y: y + ux * 3 * tr.side, ux, uy, len: 4.5, wid: 3, t: now, a: 0.8, s: surf });
            }
        }
        for (const k of S.tracks.keys()) if (!seen.has(k)) S.tracks.delete(k);
        if (S.prints.length > 900) S.prints.splice(0, S.prints.length - 900);
    }
    function drawPrints(rt, glw, view, fs) {
        stepPrints(rt, view, fs);
        if (!S.prints.length) return;
        const gl = glw.T, p = program(glw, 'mask'), now = fs.t, life = (S.snow || 0) > 0.3 ? 45 : 150;
        const vl = view.Ca - 10, vt = view.Da - 10, vr = view.Ha + 10, vb = view.Ga + 10;
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        glw.hf();
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((view.Ca + view.Ha) / -2, (view.Da + view.Ga) / -2); glw.Wd();
        glw.ld(p.idx);
        glw.hf();
        glw.ay();
        glw.wc(dotTex(glw));
        let n = 0;
        // a blue-grey dent in the snow, a darker hollow in the sand (drawn
        // before the grade: lit like the ground)
        // mud: dark wet prints, fading as the ground dries
        const mud = 0.8 * clamp01(((S.wet || 0) - 0.05) * 1.6);
        for (const surf of [1, 2, 3]) {
            glw.hf();
            if (p.loc.uTint) { if (surf === 1) gl.uniform3f(p.loc.uTint, 0.48, 0.54, 0.66); else if (surf === 2) gl.uniform3f(p.loc.uTint, 0.3, 0.23, 0.14); else gl.uniform3f(p.loc.uTint, 0.07, 0.05, 0.03); }
            const lf = surf === 2 ? SAND_LIFE : surf === 3 ? MUD_LIFE : life, k = surf === 2 ? 0.42 : surf === 3 ? mud : 1;
            if (k < 0.01) continue;
            for (const q of S.prints) {
                if ((q.s || 1) !== surf || q.x < vl || q.x > vr || q.y < vt || q.y > vb) continue;
                const age = (now - q.t) / lf;
                glw.Oe(q.a * k * (1 - age * age));
                orientedQuad(glw, Math.round(q.x), Math.round(q.y), q.ux, q.uy, q.len, q.wid);
                n++;
            }
        }
        glw.hf();
        glw.Oe(1);
        glw.ld(0);
        glw.wc(null);
        S.printsDrawn = n;
    }

    // ---- snow sparkle (on the ground only: drawn right after it)
    function drawSparkle(rt, glw, view, fs) {
        const day = 1 - lampAmount(fs.hour), sunLow = 1 - Math.abs(fs.dir[1]);
        const amt = S.winter * cfg.shine * (1 - 0.7 * (S.snow || 0)) * (day * (0.55 + 0.6 * sunLow) + (1 - day) * 0.25);
        S.sparkleAmt = amt;
        if (amt < 0.02) return;
        S.sparkleFrames = (S.sparkleFrames || 0) + 1;
        const gl = glw.T, w = glw.width | 0, h = glw.height | 0;
        const p = program(glw, 'sparkle'), tex = texture(glw, 'frame', w, h, false);
        const vl = view.Ca, vt = view.Da, spanX = view.Ha - view.Ca, spanY = view.Ga - view.Da, CELL = 2;
        const col = [0, 1, 2].map(i => lerp([0.6, 0.72, 1.0][i], [1.0, 0.97, 0.9][i], day));
        glw.hf();
        glw.wc(tex); glw.ld(p.idx);
        glw.hf();
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
        if (p.loc.uSpA) gl.uniform4f(p.loc.uSpA, wrap(Math.floor(vl / CELL), 4096), wrap(Math.floor(vt / CELL), 4096), spanX / CELL, spanY / CELL);
        if (p.loc.uSpB) gl.uniform4f(p.loc.uSpB, col[0] * amt, col[1] * amt, col[2] * amt, fs.t % 1000);
        glw.wh(gl.ONE, gl.ONE);
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.ay();
        glw.ld(0);
        glw.wc(null);
    }

    // ---- falling snow and blizzard streaks (over everything, after the grade)
    S.flakes = [];
    function drawSnowfall(rt, glw, view, fs) {
        const dt = Math.min(0.1, fs.dt || 0.016);
        const heavy = S.snow || 0, blizzard = heavy * S.winter;
        const amt = S.winter * (0.1 + 0.9 * heavy) * cfg.snowfall;
        const maxN = Math.round((Q() >= 2 ? 220 : Q() === 1 ? 140 : 70) * Math.min(1.6, amt));
        const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga, W = vr - vl, H = vb - vt;
        const wind = (S.windNow || 0.5) * 9 + 4;
        // top up
        let spawn = Math.min(12, maxN - S.flakes.length);
        while (spawn-- > 0) {
            const streak = blizzard > 0.4 && Math.random() < 0.18 * blizzard;
            S.flakes.push({
                x: vl - 40 + Math.random() * (W + 80), y: vt - 60 + Math.random() * (H + 80),
                z: streak ? 3 + Math.random() * 10 : 25 + Math.random() * 110, vz: -(10 + Math.random() * 14) * (1 + blizzard),
                vx: wind * (0.7 + Math.random() * 0.6) * (streak ? 6 : 1 + blizzard * 2), vy: (Math.random() - 0.3) * 6,
                ph: Math.random() * 6.28, size: 1.6 + Math.random() * 1.6, streak, land: 0, age: 0
            });
        }
        for (let k = S.flakes.length - 1; k >= 0; k--) {
            const f = S.flakes[k];
            f.age += dt;
            if (f.z > 0) { f.z += f.vz * dt; f.x += (f.vx + Math.sin(f.age * 2.1 + f.ph) * 5) * dt; f.y += f.vy * dt; }
            else { f.land += dt; if (f.streak) f.x += f.vx * dt * 0.4; }
            if (f.land > 0.6 || f.x > vr + 60 || f.x < vl - 80 || f.y > vb + 80 || f.y < vt - 120 || S.flakes.length > maxN + 20) S.flakes.splice(k, 1);
        }
        if (!S.flakes.length) return;
        const gl = glw.T, p = program(glw, 'mask'), night = lampAmount(fs.hour);
        const light = 0.45 + 0.55 * (1 - night);
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        glw.hf();
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
        glw.ld(p.idx);
        glw.wc(dotTex(glw));
        // 1. their shadows on the ground (a hint of height)
        glw.hf();
        if (p.loc.uTint) gl.uniform3f(p.loc.uTint, 0, 0, 0);
        glw.ay();
        for (const f of S.flakes) {
            if (f.streak || f.z <= 0) continue;
            glw.Oe(0.16 * Math.max(0, 1 - f.z / 150));
            const s2 = f.size * 0.8;
            glw.dk(f.x - s2 / 2, f.y - s2 / 2, f.x + s2 / 2, f.y - s2 / 2, f.x + s2 / 2, f.y + s2 / 2, f.x - s2 / 2, f.y + s2 / 2);
        }
        // 2. the flakes, lifted by their height
        glw.hf();
        if (p.loc.uTint) gl.uniform3f(p.loc.uTint, 0.95 * light, 0.97 * light, 1.0 * light);
        let n = 0;
        for (const f of S.flakes) {
            const fade = Math.min(1, f.age * 2) * (f.z > 0 ? 1 : 1 - f.land / 0.6);
            if (fade <= 0) continue;
            const y = f.y - Math.max(0, f.z) * 0.7;
            if (f.streak) {
                const len = 10 + f.size * 4, d = Math.hypot(f.vx, f.vy) || 1;
                glw.Oe(0.32 * fade);
                orientedQuad(glw, f.x, y, f.vx / d, f.vy / d, len, 1.2);
            } else {
                const sz = f.size, x0 = Math.round(f.x - sz / 2), y0 = Math.round(y - sz / 2);
                glw.Oe(0.9 * fade);
                glw.dk(x0, y0, x0 + sz, y0, x0 + sz, y0 + sz, x0, y0 + sz);
            }
            n++;
        }
        glw.hf();
        glw.Oe(1);
        glw.ld(0);
        glw.wc(null);
        S.flakesDrawn = n;
    }

    // ---- breath (player's, when cold) and frost at the screen edges
    S.breath = [];
    function drawBreathFrost(rt, glw, view, fs) {
        const dt = Math.min(0.1, fs.dt || 0.016);
        const me = localPlayer(rt, fs.now);
        const chilly = cfg.frost > 0 && (S.temp <= 0 || S.winter > 0.5);
        if (chilly && me && fs.t > (S.breathNext || 0)) {
            S.breathNext = fs.t + 2.2 + Math.random() * 1.2;
            const [hx, hy] = headOf(me);
            S.breath.push({ x: hx + 3, y: hy, age: 0, life: 1.3, vx: (S.windNow || 0.5) * 4 + 3, vy: -5 });
        }
        for (let k = S.breath.length - 1; k >= 0; k--) { const q = S.breath[k]; q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.age > q.life) S.breath.splice(k, 1); }
        const gl = glw.T, night = lampAmount(fs.hour), light = 0.5 + 0.5 * (1 - night);
        if (S.breath.length) {
            const p = program(glw, 'mask');
            const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga;
            const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
            glw.hf();
            glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
            glw.ld(p.idx);
            glw.hf();
            if (p.loc.uTint) gl.uniform3f(p.loc.uTint, 0.92 * light, 0.95 * light, light);
            glw.ay();
            glw.wc(puffTex(glw));
            for (const q of S.breath) {
                const k = q.age / q.life, r = 3 + k * 8;
                glw.Oe(0.75 * Math.min(1, cfg.frost) * (1 - k) * Math.min(1, q.age * 6));
                glw.dk(q.x - r, q.y - r, q.x + r, q.y - r, q.x + r, q.y + r, q.x - r, q.y + r);
            }
            glw.hf();
            glw.Oe(1);
            glw.ld(0);
            glw.wc(null);
        }
        const amt = S.cold * cfg.frost;
        S.frostNow = amt;
        if (amt < 0.02) return;
        const w = glw.width | 0, h = glw.height | 0;
        const fp = program(glw, 'frost');
        glw.hf();
        if (S.texs.frame) glw.wc(S.texs.frame.tex);
        glw.ld(fp.idx);
        glw.hf();
        if (fp.loc.uFrost) gl.uniform4f(fp.loc.uFrost, Math.min(1.3, amt), w / Math.max(1, h), light, 0);
        if (fp.loc.uRes) gl.uniform2f(fp.loc.uRes, w, h);
        glw.ay();
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.ld(0);
        glw.wc(null);
    }

    // ---- snow on top of objects (prototype): right after each of their layers
    // ---- per-sprite extras: drawn right after the sprite itself, inside the
    // game's own drawing (so they sway with it, keep its place among its
    // neighbours, and whatever stands in front hides them)
    const EXTRA_LAYERS = { Buildings_bg: 1, Buildings: 1, vehicles: 1, Trees: 1, Forests: 1, static_cars: 1, Obstacle_enviroment: 1, items_on_ground: 1 };
    const CAP_TREE_RE = /^tree_|^ee_predator_tree|^ee_strange_tree|^berry_bush/;
    const CAP_FLAT_RE = /^car_|^car\d_x|^kacar|^b_(?!.*_int)|tent|barricade|^obst_|^fence_|^hesco|^lighthouse|^heli_crash|^pillar|^light_b-|^shidui|^tiepi|^bed-|^stash-|^fadianji-sheet0|^car_save/;
    const SHINE_METAL_RE = /^obst_fence/, SHINE_CAR_RE = /^car_|^car\d_x|^kacar/, SHINE_ROOF_RE = /^b_(?!.*_int)|^lighthouse|^heli_crash/;
    const RECT_FULL = { left: 0, top: 0, right: 1, bottom: 1 };
    function extrasOf(fr) {
        let x = fr.__mdzX;
        if (x !== undefined) return x;
        const src = fr.N && fr.N.src;
        if (!src) return 0;
        const n = src.split('/').pop();
        x = { cap: CAP_TREE_RE.test(n) ? 1 : CAP_FLAT_RE.test(n) ? 2 : 0,
              shine: SHINE_METAL_RE.test(n) ? 'metal' : SHINE_CAR_RE.test(n) ? 'car' : SHINE_ROOF_RE.test(n) ? 'roof' : null,
              water: /^b_shuichi-/.test(n) };
        if (!x.cap && !x.shine && !x.water) x = 0;
        return (fr.__mdzX = x);
    }
    // this frame's values, worked out once per frame
    function extrasFrame(fs) {
        if (Q() < 1) return null;   // snow cover, shine, fountain water: Medium+
        const E = { cap: 0, shine: null, water: 0, t: fs.t };
        if (cfg.snowCover && S.winter > 0.01) E.cap = S.winter * (0.55 + 0.45 * (S.snow || 0));
        if (cfg.shine > 0) {
            const k = fs.k, dir = fs.dir, day = 1 - lampAmount(fs.hour), r = fs.rain;
            const sunLow = 1 - Math.abs(dir[1]), sun = day * (1 - 0.6 * r);
            const soft = cfg.shine * (sun * (0.22 + 0.25 * sunLow) + (1 - day) * 0.06 + 0.3 * (S.wet || 0));
            const hard = cfg.shine * (sun * (0.45 + 0.45 * sunLow) + (1 - day) * 0.12 + 0.25 * (S.wet || 0));
            if (soft + hard >= 0.01) E.shine = { soft, hard, dir, col: [0, 1, 2].map(i => lerp(lerp(1, k.rayCol[i], 0.6), [0.62, 0.72, 1.0][i], 1 - day)) };
        }
        if (cfg.water > 0) {
            const day = 1 - lampAmount(fs.hour);
            E.water = Math.min(1, cfg.water);
            E.waterGl = [0, 1, 2].map(i => lerp([0.45, 0.55, 0.75][i], [1.0, 0.95, 0.85][i], day));
        }
        E.light = 0.6 + 0.4 * (1 - lampAmount(fs.hour));
        return (E.cap || E.shine || E.water) ? E : null;
    }
    // the sprite's own shape again (bent like its swaying self)
    function drawGeom(inst, glw, sway) {
        const rt = runtime(), snap = rt && rt.vc;
        const ox = snap ? Math.round(inst.x) - inst.x : 0, oy = snap ? Math.round(inst.y) - inst.y : 0;
        if (sway) {
            const off = swaySprite(inst, sway, Math.abs(inst.height)), pw = sway.pow;
            drawStrips(glw, quadOf(inst, ox, oy), uvOf(inst.mc), sway.strips, inst.height < 0, (x, y, h) => { PT[0] = x + off * Math.pow(h, pw); PT[1] = y; });
            return;
        }
        const q = inst.Wb, sh = inst.mc.jk && inst.mc.Ct ? inst.mc.Ct : null;
        if (sh) glw.Cd(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy, sh);
        else glw.dk(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy);
    }
    // Each effect is queued into the engine's own batch: program, parameters
    // (glw.gk: batched, set only when they change), texture, quad. Nothing is
    // flushed per sprite, so a forest of snowy trees costs a few flushes
    // instead of three per tree.
    const XP = { snowcap: new Array(10).fill(0), spritewater: new Array(11).fill(0), shine: new Array(11).fill(0) };
    const xparams = (glw, a) => glw.gk(null, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, a);
    function drawExtras(inst, glw, x, sway) {
        const E = S.extras, gl = glw.T, fr = inst.mc, rc = fr.jk && fr.Ct ? fr.Ct : RECT_FULL;
        const texW = (fr.N && fr.N.width) || Math.abs(inst.width) || 64, texH = (fr.N && fr.N.height) || Math.abs(inst.height) || 64;
        let did = false;
        if (x.water && E.water) {
            const p = program(glw, 'spritewater'), a = XP.spritewater;
            a[0] = rc.left; a[1] = rc.top; a[2] = rc.right; a[3] = rc.bottom;
            a[4] = E.t % 1000; a[5] = 1 / texW; a[6] = 1 / texH; a[7] = E.water;
            a[8] = E.waterGl[0]; a[9] = E.waterGl[1]; a[10] = E.waterGl[2];
            glw.ld(p.idx); xparams(glw, a);
            glw.ay(); glw.wc(inst.$n); glw.Oe(inst.opacity);
            drawGeom(inst, glw, sway); did = true;
        }
        if (x.shine && E.shine) {
            const p = program(glw, 'shine'), sh = E.shine, big = x.shine !== 'roof', m = x.shine === 'metal' ? 2.2 : 1, a = XP.shine;   // thin wire mesh: stronger glints
            a[0] = rc.left; a[1] = rc.top; a[2] = rc.right - rc.left; a[3] = rc.bottom - rc.top;
            a[4] = sh.dir[0]; a[5] = sh.dir[1]; a[6] = sh.soft * (big ? 1 : 0.7); a[7] = sh.hard * (big ? m : 0.35);
            a[8] = sh.col[0]; a[9] = sh.col[1]; a[10] = sh.col[2];
            glw.ld(p.idx); xparams(glw, a);
            glw.wh(gl.ONE, gl.ONE); glw.wc(inst.$n); glw.Oe(inst.opacity);
            drawGeom(inst, glw, sway); did = true;
            S.shineDrawn = (S.shineDrawn || 0) + 1;
        }
        if (x.cap && E.cap) {
            const p = program(glw, 'snowcap'), a = XP.snowcap;
            a[0] = rc.left; a[1] = rc.top; a[2] = rc.right; a[3] = rc.bottom;
            a[4] = E.cap; a[5] = (inst.height < 0 ? -1 : 1) / texH; a[6] = E.light; a[7] = x.cap === 2 ? 1 : 0;
            a[8] = 1 / texW; a[9] = 1 / texH;
            glw.ld(p.idx); xparams(glw, a);
            glw.ay(); glw.wc(inst.$n); glw.Oe(inst.opacity);
            drawGeom(inst, glw, sway); did = true;
            S.capDrawn = (S.capDrawn || 0) + 1;
        }
        if (did) { glw.ld(0); glw.ay(); glw.wc(inst.$n); glw.Oe(inst.opacity); }
    }
    // ---- falling leaves: now and then one lets go of a tree, drifts down with
    // the wind, lies on the ground a while and fades. Its colour is taken from
    // the tree's own crown.
    const LEAF_TREES = ['t207', 't209', 't577', 't581', 't210', 't972', 't699', 't184', 't576'];
    S.leaves = [];
    function leafAtlas(glw) {
        if (S.leafAtlas && S.leafAtlas.glw === glw) return S.leafAtlas;
        const cv = document.createElement('canvas'); cv.width = 8; cv.height = 64;
        S.leafAtlas = { glw, cv, cx: cv.getContext('2d', { willReadFrequently: true }), tex: glw.td(8, 64, false, false, false), rows: new Map(), next: 0, dirty: true };
        return S.leafAtlas;
    }
    // the colours of a tree frame's crown -> a row of the atlas
    function leafRow(glw, fr) {
        const A = leafAtlas(glw);
        let row = A.rows.get(fr);
        if (row !== undefined) return row;
        if (A.next >= 64) return 0;
        const img = fr.N, w = fr.width | 0, h = fr.height | 0;
        if (!img || !w || !h) return -1;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, fr.jk ? fr.Wj : 0, fr.jk ? fr.Xj : 0, w, h, 0, 0, w, h);
        const d = cx.getImageData(0, 0, w, Math.max(1, Math.floor(h * 0.55))).data, cols = [];
        for (let i = 0; i < d.length && cols.length < 200; i += 4 * 7) {
            if (d[i + 3] < 220) continue;
            const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            if (l > 45) cols.push([d[i], d[i + 1], d[i + 2]]);
        }
        if (!cols.length) return -1;
        row = A.next++;
        for (let k = 0; k < 8; k++) { const c = cols[(Math.random() * cols.length) | 0]; A.cx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; A.cx.fillRect(k, row, 1, 1); }
        A.rows.set(fr, row); A.dirty = true;
        return row;
    }
    function stepLeaves(rt, glw, view, fs) {
        const dt = Math.min(0.1, fs.dt || 0.016);
        const max = Math.round((Q() >= 2 ? 60 : Q() === 1 ? 40 : 20) * Math.min(1.6, cfg.leaves));
        if (cfg.leaves > 0 && Q() >= 1 && fs.t > (S.leafNext || 0) && S.leaves.length < max) {
            S.leafNext = fs.t + 0.25;
            if (!S.leafTypes || S.leafTypesRt !== rt) { S.leafTypesRt = rt; S.leafTypes = typesOf(rt).filter(t => t && LEAF_TREES.indexOf(t.name) !== -1); }
            const chance = 0.03 * Math.min(1.6, cfg.leaves) * (1 + 1.5 * Math.min(2, S.windNow || 0) / 2) * (1 - 0.6 * (S.winter || 0));
            const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga;
            for (const t of S.leafTypes) for (const i of instancesOf(t)) {
                if (!i || !i.visible || !i.mc || i.x < vl - 60 || i.x > vr + 60 || i.y < vt - 60 || i.y > vb + 160) continue;
                if (Math.random() > chance || S.leaves.length >= max) continue;
                if (typeof i.la === 'function') i.la();
                const b = i.ka;
                if (!b) continue;
                const row = leafRow(glw, i.mc);
                if (row < 0) continue;
                const w = b.right - b.left, h = b.bottom - b.top;
                S.leaves.push({ x: b.left + w * (0.2 + Math.random() * 0.6), y: b.top + h * (0.08 + Math.random() * 0.4), gy: b.bottom - 6 + Math.random() * 22,
                    vy: 9 + Math.random() * 7, ph: Math.random() * 6.28, row, col: (Math.random() * 8) | 0, age: 0, rest: -1 });
            }
        }
        const drift = (S.windNow || 0.4) * 7;
        for (let k = S.leaves.length - 1; k >= 0; k--) {
            const L = S.leaves[k];
            L.age += dt;
            if (L.rest < 0) {
                L.y += L.vy * dt;
                L.x += (drift + Math.sin(L.age * 2.6 + L.ph) * 12) * dt;
                if (L.y >= L.gy) L.rest = 0;
            } else {
                L.rest += dt;
                if (L.rest > 12) S.leaves.splice(k, 1);
            }
        }
    }
    // resting: on the ground pass; falling: over the trees
    function drawLeaves(rt, glw, view, fs, falling) {
        if (falling) stepLeaves(rt, glw, view, fs);
        if (!S.leaves.length) return;
        const A = leafAtlas(glw);
        if (A.dirty) { glw.Zy(A.cv, A.tex, false); A.dirty = false; }
        const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga;
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        glw.hf();
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
        glw.ld(0);
        glw.ay();
        glw.wc(A.tex);
        let n = 0;
        for (const L of S.leaves) {
            if ((L.rest < 0) !== falling || L.x < vl - 4 || L.x > vr + 4 || L.y < vt - 4 || L.y > vb + 4) continue;
            const flip = falling ? Math.sin(L.age * 7 + L.ph) : 1;
            // 3x2 art pixels; turning in the air it shows edge-on (1 wide) now and then
            const w = Math.abs(flip) < 0.35 ? 1 : 3, h = 2;
            const x0 = Math.round(L.x), y0 = Math.round(L.y);
            glw.Oe(L.rest > 10 ? Math.max(0, (12 - L.rest) / 2) : 1);
            glw.Cd(x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h,
                { left: (L.col + 0.25) / 8, top: (L.row + 0.25) / 64, right: (L.col + 0.75) / 8, bottom: (L.row + 0.75) / 64 });
            n++;
        }
        glw.hf();
        glw.Oe(1);
        glw.wc(null);
        if (falling) S.leavesDrawn = n;
    }
    const winterFail = (what, e, glw) => {
        S.winterError = what + ': ' + String(e && e.message || e);
        try { glw.hf(); glw.ay(); glw.ld(0); glw.wc(null); glw.Oe(1); } catch (x) {}
        console.warn('[MDZ Lighting] winter ' + S.winterError);
    };

    // ---------------------------------------------------------------
    // Glow on chosen sprites, found by their image. key: which colour lights
    // up; col: the glow colour; r: halo radius (world px); s: strength.
    // ---------------------------------------------------------------
    // key: [mode (0 red, 1 green, 2 cyan), min brightness, min purity]
    const GLOW_RED = { key: [0, 0.3, 0.55], col: [1.0, 0.22, 0.14], r: 13, s: 1.9, core: 0.9 };        // bunker lamps
    const GLOW_TOXIC = { key: [1, 0.3, 0.35], col: [0.55, 1.0, 0.25], r: 10, s: 0.9, core: 0.35 };     // green goo
    const GLOW_PUFF = { key: [1, 0.3, 0.35], col: [0.55, 1.0, 0.3], r: 7, s: 0.45, core: 0.2 };
    const GLOW_BLOOD_PINK = { key: [0, 0.3, 0.45], col: [1.0, 0.28, 0.45], r: 10, s: 0.9, core: 0.35 };
    const GLOW_BLOOD_CYAN = { key: [2, 0.3, 0.5], col: [0.3, 1.0, 0.95], r: 10, s: 0.9, core: 0.35 };
    const GLOW_VISOR_CYAN = { key: [2, 0.3, 0.55], col: [0.3, 1.0, 0.95], r: 6, s: 0.7, core: 0.5 };
    const GLOW_FACE_RED = { key: [0, 0.4, 0.45], col: [1.0, 0.3, 0.4], r: 6, s: 0.7, core: 0.5 };      // live: bright pink face, not the maroon hands
    const GLOW_FACE_RED_DEAD = { key: [0, 0.18, 0.45], col: [1.0, 0.3, 0.4], r: 5, s: 0.6, core: 0.45 }; // the dead face is darker
    const GLOW_PUMPKIN = { key: [3, 0.55, 0.55], col: [1.0, 0.6, 0.16], r: 9, s: 1.5, core: 0.7 };      // jack-o'-lantern face
    const GLOW_SPIT_RED = { key: [0, 0.4, 0.45], col: [1.0, 0.3, 0.35], r: 7, s: 0.8, core: 0.4 };
    // Matched against the image of the frame being shown: one object type
    // holds several looks (the goo: green, pink "sw", cyan "qs"; corpses:
    // green body / white suit)
    const GLOW_RULES = [
        [/^bunker_entrance-/, GLOW_RED],                                  // the red lights (only the red frame keys)
        [/^fushe_buff-/, GLOW_PUFF],                                      // radiation puffs
        [/^zed_qs(_dead)?-|^zed_shiti-sheet3/, GLOW_VISOR_CYAN],          // hazmat, cyan visor (live, dead)
        [/^zed_sw-/, GLOW_FACE_RED],                                      // hazmat, red face
        [/^zed_sw_dead-|^zed_shiti-sheet2/, GLOW_FACE_RED_DEAD],
        [/^zed_bio_sw-|^zed_boom_sw-/, GLOW_BLOOD_PINK],                  // its blood
        [/^zed_bio_qs-|^zed_boom_qs-/, GLOW_BLOOD_CYAN],
        [/^zed_bio_|^zed_boom_/, GLOW_TOXIC],                             // green goo and splats
        [/^zed_bullet_sw-/, GLOW_SPIT_RED],                               // spit (the yellow streak does not key)
        [/^zed_bullet-/, GLOW_TOXIC],
        [/^ws_helmet/, GLOW_PUMPKIN]
    ];
    function ruleForImage(n) { for (const [re, r] of GLOW_RULES) if (re.test(n)) return r; return null; }
    function frameRule(fr) {
        if (fr.__mdzGlow !== undefined) return fr.__mdzGlow;
        const src = fr.N && fr.N.src;
        if (!src) return null;
        return (fr.__mdzGlow = ruleForImage(src.split('/').pop()));
    }
    // does any frame of this type glow? (null: images not known yet)
    function glowRuleOf(t) {
        if (t.__mdzGlow !== undefined) return t.__mdzGlow;
        let any = false, seen = false;
        for (const a of t.qd || t.animations || []) for (const fr of a.frames || []) {
            const src = fr && fr.N && fr.N.src;
            if (!src) continue;
            seen = true;
            if (ruleForImage(src.split('/').pop())) any = true;
        }
        if (!seen) return null;
        return (t.__mdzGlow = any);
    }
    // layers whose sprites can stand in front of a glow (the lighting and
    // weather overlays and projectiles do not hide anything)
    const GLOW_NO_OCCLUDE = { night: 1, nvg: 1, Color_effect: 1, Sunset_Dawn: 1, Rain: 1, rain_drops: 1, Bullets: 1, Buildings_shadows: 1 };
    function drawGlow(rt, glw, view, fs) {
        if (!S.glowTypes || S.glowTypesRt !== rt || (S.glowTypesAt && performance.now() - S.glowTypesAt > 5000 && S.glowUnknown)) {
            S.glowTypesRt = rt; S.glowTypesAt = performance.now(); S.glowUnknown = false;
            S.glowTypes = [];
            for (const t of typesOf(rt)) {
                if (!t || !t.qd) continue;
                const r = glowRuleOf(t);
                if (r === null && t.__mdzGlow === undefined) S.glowUnknown = true;
                if (r) S.glowTypes.push({ t });
            }
        }
        const vl = view.Ca, vt = view.Da, vr = view.Ha, vb = view.Ga;
        const list = [];
        let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
        for (const { t } of S.glowTypes) for (const i of instancesOf(t)) {
            if (!i || !i.visible || !(i.opacity > 0.05) || !i.$n || !i.mc || !i.Wb || !i.C || !i.C.visible) continue;
            const rule = frameRule(i.mc);
            if (!rule) continue;
            if (typeof i.la === 'function') i.la();
            const b = i.ka;
            if (b && (b.right < vl - 20 || b.left > vr + 20 || b.bottom < vt - 20 || b.top > vb + 20)) continue;
            list.push({ i, rule, L: i.C.index });
            if (b) { ux0 = Math.min(ux0, b.left - rule.r); uy0 = Math.min(uy0, b.top - rule.r); ux1 = Math.max(ux1, b.right + rule.r); uy1 = Math.max(uy1, b.bottom + rule.r); }
        }
        S.glowDrawn = list.length;
        if (!list.length) return;
        list.sort((a, b) => a.L - b.L);
        const gl = glw.T, p = program(glw, 'glow'), sil = program(glw, 'sil'), night = lampAmount(fs.hour);
        const amt = Math.min(2, cfg.glow) * (0.65 + 0.55 * night);
        const w = glw.width | 0, h = glw.height | 0;
        const buf = texture(glw, 'glowbuf', w, h, false);
        const target = S.layoutRef && typeof S.layoutRef.el === 'function' ? S.layoutRef.el() : null;
        const layers = S.layoutRef ? layersOf(S.layoutRef) : [];
        const top = S.boundary ? S.boundary.index : 1e9;
        const sc = typeof view.Lc === 'function' ? view.Lc() : 1, ang = typeof view.ib === 'function' ? view.ib() : 0;
        glw.hf();
        glw.le(buf);
        glw.clear(0, 0, 0, 0);
        glw.ke(); glw.scale(sc, sc); glw.Kp(-ang); glw.translate((vl + vr) / -2, (vt + vb) / -2); glw.Wd();
        const snap = !!rt.vc;
        // the sprites standing in front: layers above lo up to hi, over the glowing area only
        let occ = 0;
        const cutOccluders = (lo, hi) => {
            glw.hf();
            glw.ld(sil.idx);
            glw.wh(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
            for (const L of layers) {
                if (!L || L.index <= lo || L.index > hi || L.index >= top || !L.visible || GLOW_NO_OCCLUDE[L.name]) continue;
                for (const o of instancesOf(L)) {
                    if (!o || !o.visible || !(o.opacity > 0.05) || !o.$n || !o.mc || !o.Wb) continue;
                    if (typeof o.la === 'function') o.la();
                    const b = o.ka;
                    if (!b || b.right < ux0 || b.left > ux1 || b.bottom < uy0 || b.top > uy1) continue;
                    const q = o.Wb, sh = o.mc.jk && o.mc.Ct ? o.mc.Ct : null;
                    const ox = snap ? Math.round(o.x) - o.x : 0, oy = snap ? Math.round(o.y) - o.y : 0;
                    glw.wc(o.$n);
                    glw.Oe(o.opacity);
                    if (sh) glw.Cd(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy, sh);
                    else glw.dk(q.eb + ox, q.fb + oy, q.Kb + ox, q.Lb + oy, q.yb + ox, q.zb + oy, q.wb + ox, q.xb + oy);
                    occ++;
                }
            }
            glw.hf();
            glw.Oe(1);
        };
        for (let k = 0; k < list.length; k++) {
            const { i, rule } = list[k];
            if (k === 0 || list[k - 1].L !== list[k].L) { glw.hf(); glw.ld(p.idx); glw.wh(gl.ONE, gl.ONE); }
            const fr = i.mc, q = i.Wb;
            const rc = fr.jk && fr.Ct ? fr.Ct : { left: 0, top: 0, right: 1, bottom: 1 };
            // the quad grown by the halo radius along its own edges (rotated sprites too)
            const ex = q.Kb - q.eb, ey = q.Lb - q.fb, fx = q.wb - q.eb, fy = q.xb - q.fb;
            const W = Math.hypot(ex, ey) || 1, Hh = Math.hypot(fx, fy) || 1, R = rule.r;
            const ux = ex / W * R, uy = ey / W * R, vx = fx / Hh * R, vy = fy / Hh * R;
            const du = (rc.right - rc.left) * R / W, dv = (rc.bottom - rc.top) * R / Hh;
            const ox = snap ? Math.round(i.x) - i.x : 0, oy = snap ? Math.round(i.y) - i.y : 0;
            glw.hf();   // per-sprite uniforms
            if (p.loc.uRect) gl.uniform4f(p.loc.uRect, rc.left, rc.top, rc.right, rc.bottom);
            if (p.loc.uGlowA) gl.uniform4f(p.loc.uGlowA, du * 0.9, dv * 0.9, rule.s * amt, rule.core * amt);
            if (p.loc.uKey) gl.uniform4f(p.loc.uKey, rule.key[0], rule.key[1], rule.key[2], 0);
            if (p.loc.uGlowCol) gl.uniform3f(p.loc.uGlowCol, rule.col[0], rule.col[1], rule.col[2]);
            glw.wc(i.$n);
            glw.Oe(i.opacity);
            glw.Cd(q.eb - ux - vx + ox, q.fb - uy - vy + oy, q.Kb + ux - vx + ox, q.Lb + uy - vy + oy,
                   q.yb + ux + vx + ox, q.zb + uy + vy + oy, q.wb - ux + vx + ox, q.xb - uy + vy + oy,
                   { left: rc.left - du, top: rc.top - dv, right: rc.right + du, bottom: rc.bottom + dv });
            // this layer's glows are down: cut out what stands in front of them
            // (up to the next glowing layer; the rest is cut later, from all)
            const next = k + 1 < list.length ? list[k + 1].L : top;
            if (next !== list[k].L) cutOccluders(list[k].L, next);
        }
        glw.hf();
        glw.le(target);
        // added onto the frame
        glw.wc(buf);
        glw.ld(0);
        glw.wh(gl.ONE, gl.ONE);
        glw.Oe(1);
        glw.Yv();
        glw.hf();
        glw.ay();
        glw.ld(0);
        glw.wc(null);
        S.glowOccluders = occ;
    }

    // ---------------------------------------------------------------
    // Painted shadows. Most sprites carry a shadow painted into their image:
    // flat dark pixels at one alpha (trees 115, cars 94, zombies and many
    // others 89). With dynamic shadows those pixels are cleared from the
    // loaded textures (and put back when the shadows are switched off), the
    // ground tilemap's rocks and bushes included, and the game's separately
    // drawn building shadows (b_shadows, t347) are hidden.
    // ---------------------------------------------------------------
    const PAINTED = { recs: new Map(), queued: new Set(), queue: [], scanAt: 0, failed: '', tiles: false, tileImg: null };
    function clearPaintedPixels(d) {
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3];
            if (a < 50 || a > 140) continue;
            const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            if (mx < 80 && mx - mn < 40) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; n++; }
        }
        return n;
    }
    // a copy of (part of) an image, painted shadow removed; sized to the texture
    function paintedCopy(img, sx, sy, sw, sh, tw, th, clean) {
        const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingEnabled = false;
        cx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
        if (!clean) return cv;
        const id = cx.getImageData(0, 0, tw, th);
        if (!clearPaintedPixels(id.data)) return null;
        cx.putImageData(id, 0, 0);
        return cv;
    }
    function managePainted(rt, glw, layout) {
        const want = cfg.enabled && cfg.shadows > 0 && replacePainted() && layout && layout.name === 'Map' && !PAINTED.failed;
        // the game's drawn building shadows
        if (!S.nativeShadowType || S.nativeShadowRt !== rt) { S.nativeShadowRt = rt; S.nativeShadowType = typesOf(rt).find(x => x && x.name === 't347') || null; S.hiddenNative = new Set(); }
        if (want) {
            for (const i of instancesOf(S.nativeShadowType)) if (i && i.visible) { i.visible = false; S.hiddenNative.add(i); }
        } else if (S.hiddenNative && S.hiddenNative.size) {
            for (const i of S.hiddenNative) if (i && instancesOf(i.type).indexOf(i) !== -1) i.visible = true;
            S.hiddenNative.clear();
        }
        if (!want) {
            // put every cleaned texture back as it was
            if (PAINTED.recs.size) {
                for (const [tex, r] of PAINTED.recs) {
                    if (!r.cleaned) continue;
                    try { glw.Zy(r.tile ? paintedCopy(r.img, r.sx, r.sy, r.sw, r.sh, r.tw, r.th, false) : r.img, tex, false); } catch (e) {}
                }
                PAINTED.recs.clear(); PAINTED.queued.clear(); PAINTED.queue = []; PAINTED.tiles = false;
            }
            return;
        }
        const now = performance.now();
        // look for new sprite sheets on the casting layers twice a second
        if (now - PAINTED.scanAt > 500) {
            PAINTED.scanAt = now;
            for (const L of S.casters || []) for (const i of instancesOf(L)) {
                const tex = i && i.$n, img = i && i.mc && i.mc.N;
                if (!tex || !img || PAINTED.recs.has(tex) || PAINTED.queued.has(tex)) continue;
                if (casterKind(i) === 'none' || !(img.width > 0)) continue;
                PAINTED.queued.add(tex); PAINTED.queue.push({ tex, img });
            }
        }
        try {
            // a couple of sheets per frame, so nothing hitches
            for (let k = 0; k < 2 && PAINTED.queue.length; k++) {
                const { tex, img } = PAINTED.queue.shift();
                PAINTED.queued.delete(tex);
                const tw = tex.Be || img.width, th = tex.Ae || img.height;
                const cv = paintedCopy(img, 0, 0, img.width, img.height, tw, th, true);
                PAINTED.recs.set(tex, { img, cleaned: !!cv });
                if (cv) glw.Zy(cv, tex, false);
            }
            // the ground tilemap: rocks, stumps and bushes have their shadow painted in
            if (!PAINTED.tiles) {
                const t = typesOf(rt).find(x => x && x.name === 't230');
                if (t && t.Ph && t.Ph.length) {
                    if (!PAINTED.tileImg) { const im = new Image(); im.src = 'images/ground_enviroment_tilemap.png'; PAINTED.tileImg = im; }
                    const img = PAINTED.tileImg;
                    if (img.complete && img.width > 0) {
                        PAINTED.tiles = true;
                        const T = 30, cols = Math.floor(img.width / T);
                        t.Ph.forEach((tex, id) => {
                            if (!tex) return;
                            const sx = (id % cols) * T, sy = Math.floor(id / cols) * T, tw = tex.Be || T, th = tex.Ae || T;
                            const cv = paintedCopy(img, sx, sy, T, T, tw, th, true);
                            PAINTED.recs.set(tex, { img, tile: true, sx, sy, sw: T, sh: T, tw, th, cleaned: !!cv });
                            if (cv) glw.Zy(cv, tex, false);
                        });
                    }
                }
            }
        } catch (e) {
            // most likely an image the page may not read (file:// on some phones): leave the paint
            PAINTED.failed = String(e && e.message || e);
            console.warn('[MDZ Lighting] painted shadows kept:', PAINTED.failed);
        }
    }

    // Called before every layer draws (or is skipped) while the Map is drawn.
    function beforeLayer(layer, glw) {
        if (!cfg.enabled || !S.fs) { visionPass(layer, glw); return; }
        // ground: prints (snow and sand), snow sparkle, fallen leaves - right
        // after the ground layers, under everything standing on them
        if (!S.groundDone && S.printLayer && layer.index > S.printLayer.index) {
            S.groundDone = true;
            const rt0 = runtime(), g0 = glw || glwOf(rt0);
            if (!S.winterError && (cfg.footprints || S.prints.length)) { try { drawPrints(rt0, g0, S.printLayer, S.fs); } catch (e) { winterFail('prints', e, g0); } }
            if (S.winter > 0.01 && Q() >= 1 && !S.winterError) { try { drawSparkle(rt0, g0, S.printLayer, S.fs); } catch (e) { winterFail('sparkle', e, g0); } }
            if (!S.leafError && S.leaves.length) { try { drawLeaves(rt0, g0, S.printLayer, S.fs, false); } catch (e) { S.leafError = String(e && e.message || e); S.leaves = []; try { g0.hf(); g0.ay(); g0.ld(0); g0.wc(null); g0.Oe(1); } catch (x) {} } }
        }
        // falling leaves: over the trees
        if (!S.leafAirDone && S.treesLayer && layer.index > S.treesLayer.index) {
            S.leafAirDone = true;
            if (!S.leafError && (cfg.leaves > 0 || S.leaves.length)) {
                const rt0 = runtime(), g0 = glw || glwOf(rt0);
                try { drawLeaves(rt0, g0, S.treesLayer, S.fs, true); }
                catch (e) { S.leafError = String(e && e.message || e); S.leaves = []; try { g0.hf(); g0.ay(); g0.ld(0); g0.wc(null); g0.Oe(1); } catch (x) {} console.warn('[MDZ Lighting] leaves off:', S.leafError); }
            }
        }
        // wet ground: right above the terrain, so water, building floors and
        // items are drawn over it and puddles only land on open ground
        if (!S.wetDone && S.wetBoundary && layer.index > S.wetBoundary.index) {
            S.wetDone = true;
            if (cfg.weather && cfg.puddles > 0 && S.wet > 0.01 && !S.wetError && Q() >= 1) {
                const rt0 = runtime(), g0 = glw || glwOf(rt0);
                try { drawWet(rt0, g0, S.wetBoundary); }
                catch (e) {
                    S.wetError = String(e && e.message || e);
                    try { g0.ay(); g0.ld(0); g0.wc(null); } catch (x) {}
                    console.warn('[MDZ Lighting] wet ground disabled:', S.wetError);
                }
            }
        }
        if (!S.waterDone && S.waterBoundary && layer.index > S.waterBoundary.index) {
            S.waterDone = true;
            if (cfg.water > 0 && !S.waterError && Q() >= 1) {
                const rt0 = runtime(), g0 = glw || glwOf(rt0);
                try { drawWater(rt0, g0, S.waterBoundary); }
                catch (e) {
                    S.waterError = String(e && e.message || e);
                    try { g0.le(S.layoutRef.el()); g0.ay(); g0.ld(0); g0.wc(null); } catch (x) {}
                    console.warn('[MDZ Lighting] water disabled:', S.waterError);
                }
            }
        }
        if (!S.shadowDone && S.shadowBoundary && layer.index > S.shadowBoundary.index) {
            S.shadowDone = true;
            if (cfg.shadows > 0 && !S.shadowError) {
                const rt = runtime(); glw = glw || glwOf(rt);
                // the boundary layer is already placed for this frame: use its view
                try { drawShadows(rt, glw, S.shadowBoundary); }
                catch (e) {
                    S.shadowError = String(e && e.message || e); // shadows off, the rest carries on
                    try { blendMax(glw.T, false); } catch (x) {}
                    try { glw.le(S.layoutRef.el()); glw.ay(); glw.ld(0); glw.wc(null); } catch (x) {}
                    console.warn('[MDZ Lighting] shadows disabled:', S.shadowError);
                }
            }
            if (cfg.fog > 0 && !S.fogError) {
                const rt = runtime(); glw = glw || glwOf(rt);
                try { if (fogShares()[0] > 0 && drawFogField(rt, glw, S.shadowBoundary)) drawFogComposite(glw, fogShares()[0]); }
                catch (e) {
                    S.fogError = String(e && e.message || e);
                    try { glw.le(S.layoutRef.el()); glw.T.viewport(0, 0, glw.width | 0, glw.height | 0); glw.ay(); glw.ld(0); glw.wc(null); } catch (x) {}
                    console.warn('[MDZ Lighting] fog disabled:', S.fogError);
                }
            }
        }
        // line of sight: over the shadows and the ground fog just drawn
        visionPass(layer, glw);
        if (!S.gradeDone && S.boundary && layer.index > S.boundary.index) {
            S.gradeDone = true;
            const rt = runtime(); glw = glw || glwOf(rt);
            if (!rt || !glw) return;
            try {
                drawGrade(rt, glw);
                if (cfg.fog > 0 && !S.fogError && fogShares()[1] > 0) {
                    if (S.fogFrame !== S.frameNo && S.playerLayer) drawFogField(rt, glw, S.playerLayer);
                    drawFogComposite(glw, fogShares()[1]);
                }
                if (!S.winterError && S.playerLayer && (S.winter > 0.01 || S.flakes.length) && (cfg.snowfall > 0 || S.flakes.length)) {
                    try { drawSnowfall(rt, glw, S.playerLayer, S.fs); } catch (e) { winterFail('snowfall', e, glw); }
                }
                if (!S.winterError && S.playerLayer && cfg.frost > 0) {
                    try { drawBreathFrost(rt, glw, S.playerLayer, S.fs); } catch (e) { winterFail('frost', e, glw); }
                }
                if (cfg.glow > 0 && !S.glowError && S.playerLayer && Q() >= 1) {
                    try { drawGlow(rt, glw, S.playerLayer, S.fs); }
                    catch (e) {
                        S.glowError = String(e && e.message || e);
                        try { glw.ay(); glw.ld(0); glw.wc(null); glw.Oe(1); } catch (x) {}
                        console.warn('[MDZ Lighting] glow disabled:', S.glowError);
                    }
                }
                if (!S.flyError && S.playerLayer && (cfg.fireflies > 0 || S.flies.length)) {
                    try { drawFireflies(rt, glw, S.playerLayer, S.fs); }
                    catch (e) {
                        S.flyError = String(e && e.message || e); S.flies = [];
                        try { glw.ay(); glw.ld(0); glw.wc(null); glw.Oe(1); } catch (x) {}
                        console.warn('[MDZ Lighting] fireflies disabled:', S.flyError);
                    }
                }
            }
            catch (e) {
                S.error = String(e && e.message || e);
                cfg.enabled = false; // one failure turns it off rather than every frame
                try { glw.ay(); glw.ld(0); } catch (x) {}
                console.warn('[MDZ Lighting] disabled:', S.error);
            }
        }
    }

    // Frames per second in the top right corner, left of the game's clock.
    function updateFps() {
        const now = performance.now();
        S.fpsFrames = (S.fpsFrames || 0) + 1;
        if (!S.fpsAt) S.fpsAt = now;
        if (now - S.fpsAt < 500) return;
        S.fpsShown = Math.round(S.fpsFrames * 1000 / (now - S.fpsAt));
        S.fpsFrames = 0; S.fpsAt = now;
        let el = document.getElementById('mdz-fps');
        if (!cfg.showFps) { if (el) el.style.display = 'none'; return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'mdz-fps';
            el.style.cssText = 'position:fixed;z-index:100030;pointer-events:none;font:bold 12px/1 monospace;padding:3px 6px;border-radius:3px;background:rgba(0,0,0,0.55);color:#9f9;text-shadow:0 1px 0 #000;white-space:nowrap;';
            document.body.appendChild(el);
        }
        const fps = S.fpsShown;
        el.style.color = fps >= 50 ? '#9f9' : fps >= 30 ? '#fd6' : '#f77';
        el.textContent = 'FPS ' + fps + (cfg.enabled ? ' \u00b7 ' + ['LOW', 'MED', 'HIGH'][Q()] : '');
        const cv = document.getElementById('c2canvas'), rc = cv ? cv.getBoundingClientRect() : { right: innerWidth, top: 0, width: innerWidth, height: innerHeight };
        el.style.display = 'block';
        el.style.top = Math.round(rc.top + rc.height * 0.012) + 'px';
        el.style.left = Math.round(rc.right - rc.width * 0.14 - el.offsetWidth) + 'px';
    }
    // Is a menu covering the game? The pause menu, the inventory, the perk
    // and achievement screens set flags; the perks/stats window, the map and
    // the like are found as a big window on the GUI layers. Checked 4x a second.
    const MENU_FLAGS = ['helpmenu_on', 'Inventory_opened', 'perkmenu_on', 'menu_achieves_open'];
    function watchMenus(rt, layout, now) {
        if (!layout || layout.name !== 'Map') { MENU.open = false; return; }
        if (now - MENU.at < 250 && now >= MENU.at) return;
        MENU.at = now;
        const g = readGlobals(rt, now);
        let open = MENU_FLAGS.some(n => g[n] && +g[n].data > 0);
        if (!open) for (const L of layersOf(layout)) {
            if (!L.visible || (L.name !== 'GUI_elements' && L.name !== 'GUI')) continue;
            const vw = L.Ha - L.Ca, vh = L.Ga - L.Da;
            for (const i of instancesOf(L)) {
                if (!i || !i.visible || !(i.opacity > 0.5)) continue;
                if (Math.abs(i.width || 0) < vw * 0.4 || Math.abs(i.height || 0) < vh * 0.35) continue;
                if (i.x < L.Ca || i.x > L.Ha || i.y < L.Da || i.y > L.Ga) continue;
                open = true; break;
            }
            if (open) break;
        }
        MENU.open = open;
    }
    // Switched off: after a few seconds the full-screen buffers (about 8 MB
    // each at 1080p) are given back; they are made again when needed.
    function freeWhenOff(glw, now) {
        if (!S.offSince) { S.offSince = now; return; }
        if (now - S.offSince < 3000) return;
        // (line of sight has its own switch: its texture stays while it is on)
        const keep = cfg.vision > 0 ? 'vis' : '';
        const keys = Object.keys(S.texs).filter(k => k !== keep);
        if (!keys.length || !glw) return;
        glw.hf();
        for (const k of keys) { try { glw.deleteTexture(S.texs[k].tex); } catch (e) {} }
        S.texs = keep && S.texs[keep] ? { [keep]: S.texs[keep] } : {};
        S.shStatic = null; S.shDyn = null; S.fogCache = null; S.sunTexFrame = -1; S.lsFrame = -1; S.fogFrame = -1;
        S.texFreed = (S.texFreed || 0) + keys.length;
    }
    function install() {
        const rt = runtime(), glw = glwOf(rt), L = layoutOf(rt);
        if (!rt || !glw || !L || !layersOf(L).length) return false;
        const miss = GLW_NEEDS.filter(n => typeof glw[n] !== 'function');
        if (miss.length || !Array.isArray(glw.tb) || !glw.T) { S.error = 'unsupported runtime (glwrap: ' + miss.join(',') + ')'; return true; }
        const layoutProto = Object.getPrototypeOf(L), layerProto = Object.getPrototypeOf(layersOf(L)[0]);
        if (typeof layoutProto.nb !== 'function' || typeof layerProto.nb !== 'function' || typeof layerProto.mq !== 'function') {
            S.error = 'unsupported runtime (layer draw not found)'; return true;
        }
        const layoutDraw = layoutProto.nb, layerDraw = layerProto.nb, layerSkip = layerProto.mq;
        layoutProto.nb = function (glw) {
            try { updateFps(); } catch (e) {}
            S.gradeDone = S.shadowDone = S.wetDone = S.waterDone = false;
            S.frameNo = (S.frameNo || 0) + 1;
            S.waterDrawn = 0; S.glowDrawn = 0;
            S.groundDone = S.leafAirDone = false; S.capDrawn = 0;
            S.shineDrawn = 0;
            resolveLayers(this);
            const now = performance.now(), rt = runtime();
            syncMultiplayerVision();
            try { watchMenus(rt, this, now); } catch (e) { MENU.open = false; }
            if (!cfg.enabled) { try { freeWhenOff(glw, now); } catch (e) {} } else S.offSince = 0;
            S.fs = cfg.enabled && S.boundary ? frameState(rt, now) : null;
            if (S.fs) paceQuality(now); else S.paceT = 0;
            try { managePainted(rt, glw, this); } catch (e) { PAINTED.failed = String(e && e.message || e); }
            // wind runs on its own clock; switched off with everything else
            // the wind's clock runs faster as it blows harder (a storm whips, a
            // breeze sways); its strength tops out at storm level
            const wdt = Math.min(0.1, Math.max(0, (now - (S.windLast || now)) / 1000)); S.windLast = now;
            S.windT = (S.windT || 0) + wdt * (0.75 + 0.3 * Math.min(5, S.windNow || 0));
            S.windNow = cfg.enabled && !S.windOff && cfg.wind > 0 && this.name === 'Map' ? Math.min(5.5, cfg.wind * (1 + 1.3 * S.rain)) : 0;
            if (S.windNow > 0) { if (!S.spriteHooked || !S.tilemapHooked || !S.windTypesMarked) hookWind(rt); rt.X = true; }
            S.extras = S.fs && this.name === 'Map' ? extrasFrame(S.fs) : null;
            if (S.extras && !S.spriteHooked) hookWind(rt);
            // line of sight works whether or not the rest of the look is on
            try { visionFrame(rt, this, now); } catch (e) { V.on = false; V.error = String(e && e.message || e); }
            if (V.on && !S.spriteHooked) hookWind(rt);
            S.inMapDraw = this.name === 'Map';
            try { return layoutDraw.apply(this, arguments); }
            finally { S.inMapDraw = false; try { visionLabels(rt); } catch (e) {} }
        };
        layerProto.nb = function (glw) { beforeLayer(this, glw); return layerDraw.apply(this, arguments); };
        layerProto.mq = function () { beforeLayer(this, null); return layerSkip.apply(this, arguments); };
        const canvas = rt.canvas || document.getElementById('c2canvas');
        if (canvas) canvas.addEventListener('webglcontextlost', () => { S.progs = {}; S.texs = {}; S.contact = null; S.dot = null; S.puff = null; S.leafAtlas = null; PAINTED.recs.clear(); PAINTED.queued.clear(); PAINTED.queue = []; PAINTED.tiles = false; }, false);
        S.installed = true;
        try { S.tierInfo = detectTier(glw.T); applyTier(S.tierInfo, false); } catch (e) {}
        console.log('[MDZ Lighting] v' + VERSION + ' installed');
        return true;
    }
    (function wait() { if (!install()) setTimeout(wait, 250); })();

    // Settings as a short code to share. Look settings only (quality, frame
    // limit and the like stay per device); only what differs from the
    // defaults goes in, and what a code leaves out is the default.
    // SHARE_KEYS only ever grows at the end, so old codes keep working.
    const SHARE_KEYS = ['strength', 'shadows', 'fog', 'rays', 'raysMode', 'grain', 'vignette', 'light', 'wind', 'lamps', 'puddles', 'lightning',
        'water', 'fireflies', 'flySize', 'flyPixel', 'glow', 'snowfall', 'footprints', 'frost', 'snowCover', 'leaves', 'cleanShadows', 'fogMode',
        'shine', 'weather', 'tileShadows', 'ao', 'aberration', 'nvg', 'vision', 'visionRange', 'visionHide'];
    const CHOICES = { raysMode: ['objects', 'static'], fogMode: ['both', 'ground', 'top'] };
    function exportCode() {
        const o = {};
        SHARE_KEYS.forEach((k, i) => {
            const v = cfg[k], d = DEFAULTS[k], id = i.toString(36);
            if (v === undefined || v === d) return;
            if (typeof d === 'number') { if (isFinite(+v) && Math.round(+v * 100) !== Math.round(d * 100)) o[id] = Math.round(+v * 100) / 100; }
            else if (typeof d === 'boolean') o[id] = v ? 1 : 0;
            else if (CHOICES[k]) { const j = CHOICES[k].indexOf(v); if (j >= 0) o[id] = 's' + j; }
        });
        return 'MDZ1-' + btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function parseCode(str) {
        const m = /MDZ1-([A-Za-z0-9_-]+)/.exec(String(str || ''));
        if (!m) return null;
        let o;
        try { let b = m[1].replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; o = JSON.parse(atob(b)); } catch (e) { return null; }
        if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
        const set = {};
        for (const k of SHARE_KEYS) set[k] = DEFAULTS[k];
        for (const id of Object.keys(o)) {
            const k = SHARE_KEYS[parseInt(id, 36)], v = o[id];
            if (!k) continue;   // from a newer version: skipped
            const d = DEFAULTS[k];
            if (typeof d === 'number') { const n = +v; if (isFinite(n)) set[k] = Math.max(0, Math.min(5, n)); }
            else if (typeof d === 'boolean') set[k] = !!v;
            else if (CHOICES[k] && typeof v === 'string' && v[0] === 's' && CHOICES[k][+v.slice(1)]) set[k] = CHOICES[k][+v.slice(1)];
        }
        return set;
    }
    // Panel sections, each with its own Reset
    const SECTIONS = {
        light: ['strength', 'shadows', 'cleanShadows', 'ao', 'lamps', 'glow', 'shine', 'rays', 'raysMode', 'light', 'vignette', 'grain', 'aberration', 'nvg'],
        nature: ['wind', 'water', 'fireflies', 'flySize', 'flyPixel', 'leaves', 'fog', 'fogMode', 'puddles', 'weather', 'lightning'],
        snow: ['snowfall', 'frost', 'footprints', 'snowCover']
    };
    // Test hooks only for the test tools (window.MDZ_LIGHTING_TESTS, or a
    // page forced on with MDZ_LIGHTING_FORCE)
    const TESTS = !!(window.MDZ_LIGHTING_TESTS || window.MDZ_LIGHTING_FORCE);
    window.MDZLighting = {
        version: VERSION,
        get: () => { syncMultiplayerVision();return Object.assign({}, cfg); },
        multiplayerPolicy: () => {syncMultiplayerVision();return MPV.policy?Object.assign({},MPV.policy):{locked:false};},
        defaults: () => Object.assign({}, DEFAULTS),
        set(o) {
            if (!o) return this.get();
            syncMultiplayerVision();
            for (const k of Object.keys(DEFAULTS)) if (Object.prototype.hasOwnProperty.call(o, k) && !(MPV.policy&&VIS_LOCK_KEYS.includes(k))) cfg[k] = o[k];
            cfg.quality = Math.max(0, Math.min(2, parseInt(cfg.quality, 10) || 0));
            if (Object.prototype.hasOwnProperty.call(o, 'quality') || Object.prototype.hasOwnProperty.call(o, 'autoQuality')) { S.qCap = 2; S.paceSlow = 0; S.fpsAvg = 0; }
            if (Object.prototype.hasOwnProperty.call(o, 'enabled') && o.enabled) S.error = '';
            if (Object.prototype.hasOwnProperty.call(o, 'shadows')) S.shadowError = '';
            if (Object.prototype.hasOwnProperty.call(o, 'wind')) { S.windError = ''; S.windOff = false; }
            if (Object.prototype.hasOwnProperty.call(o, 'puddles')) S.wetError = '';
            if (Object.prototype.hasOwnProperty.call(o, 'water')) S.waterError = '';
            if (Object.prototype.hasOwnProperty.call(o, 'fog')) S.fogError = '';
            if (Object.prototype.hasOwnProperty.call(o, 'shine')) S.shineError = '';
            if (Object.prototype.hasOwnProperty.call(o, 'glow')) S.glowError = '';
            if (['snowfall', 'footprints', 'frost', 'shine'].some(k => Object.prototype.hasOwnProperty.call(o, k))) S.winterError = '';
            if (Object.prototype.hasOwnProperty.call(o, 'snowCover') || Object.prototype.hasOwnProperty.call(o, 'shine') || Object.prototype.hasOwnProperty.call(o, 'water')) { S.capError = ''; S.extrasError = ''; }
            if (Object.prototype.hasOwnProperty.call(o, 'leaves')) S.leafError = '';
            if (Object.prototype.hasOwnProperty.call(o, 'fireflies')) S.flyError = '';
            if (['vision', 'visionRange', 'visionHide'].some(k => Object.prototype.hasOwnProperty.call(o, k))) { V.error = ''; V.at = 0; }
            saveCfg();
            const rt = runtime(); if (rt) rt.X = true;
            return this.get();
        },
        enable(on) { return this.set({ enabled: !!on }); },
        // the device tier: what was detected, and applying it again
        device: () => Object.assign({ tierName: S.tierInfo ? ['Low', 'Medium', 'High'][S.tierInfo.tier] : '' }, S.tierInfo || {}),
        redetect() { const gl = glwOf(runtime()); if (!gl) return null; S.tierInfo = detectTier(gl.T); applyTier(S.tierInfo, true); const rt = runtime(); if (rt) rt.X = true; return this.device(); },
        // one-tap looks: cinematic, balanced, subtle, performance
        presets: () => Object.keys(PRESETS),
        presetName: () => Object.keys(PRESETS).reverse().find(n => Object.keys(PRESETS[n]).every(k => cfg[k] === PRESETS[n][k])) || "",
        preset(name) { const p = PRESETS[name]; return p ? this.set(p) : null; },
        // a fixed hour for trying out the look; null goes back to the game clock
        previewHour(h) { cfg.hour = h === null || h === undefined || h === '' ? null : +h; const rt = runtime(); if (rt) rt.X = true; return cfg.hour; },
        // strike lightning now (preview); normally it only comes with heavy rain
        strike() { S.strikeAt = (performance.now() - S.t0) / 1000; const rt = runtime(); if (rt) rt.X = true; },
        // settings as a short code to share, and back
        exportCode,
        importCode(str) { const o = parseCode(str); if (!o) return false; this.set(o); return true; },
        sections: () => JSON.parse(JSON.stringify(SECTIONS)),
        resetSection(name) { const keys = SECTIONS[name]; if (!keys) return null; const o = {}; for (const k of keys) o[k] = DEFAULTS[k]; return this.set(o); },
        reset() { Object.assign(cfg, DEFAULTS);syncMultiplayerVision(); S.error = S.shadowError = S.wetError = S.waterError = ''; S.qCap = 2; saveCfg(); return this.get(); },
        status: () => ({ tier: S.tierInfo ? S.tierInfo.tier : null, gpu: S.tierInfo ? S.tierInfo.gpu : '', version: VERSION, installed: S.installed, active: !!(cfg.enabled && S.boundary), error: S.error, shadowError: S.shadowError,
            frames: S.frames, shadowFrames: S.shadowFrames, shadowCasters: S.shadowCount, hour: +S.hour.toFixed(2), rain: +S.rain.toFixed(2), quality: Q(), qualitySet: cfg.quality, fps: Math.round(S.fpsAvg || 0), wind: +S.windNow.toFixed(2), windHooks: [S.spriteHooked, S.tilemapHooked], windError: S.windError, lights: lightBuf.n, maskLights: S.maskCount || 0, wet: +S.wet.toFixed(2), snowing: !!S.snowing, flash: +(S.flash || 0).toFixed(2), wetError: S.wetError, water: S.waterDrawn, waterError: S.waterError, fogError: S.fogError || '', fogFrame: S.fogFrame === S.frameNo, lightShadows: S.lightShadowCount || 0, painted: [...PAINTED.recs.values()].filter(r => r.cleaned).length, paintedFailed: PAINTED.failed, nativeHidden: S.hiddenNative ? S.hiddenNative.size : 0, sparkleFrames: S.sparkleFrames || 0, sparkleAmt: +(S.sparkleAmt || 0).toFixed(2), winter: +(S.winter || 0).toFixed(2), temp: S.temp, cold: +(S.cold || 0).toFixed(2), flakes: S.flakesDrawn || 0, prints: S.prints.length, printsDrawn: S.printsDrawn || 0, frost: +(S.frostNow || 0).toFixed(2), breath: S.breath.length, snowCaps: S.capDrawn || 0, leaves: S.leaves.length, leavesDrawn: S.leavesDrawn || 0, leafError: S.leafError || '', extrasError: S.extrasError || '', winterError: S.winterError || '', capError: S.capError || '', glow: S.glowDrawn || 0, glowOccluders: S.glowOccluders || 0, glowError: S.glowError || '', fpsShown: S.fpsShown || 0, raysMode: cfg.raysMode, shadowReused: S.shadowReused || 0, staticRedraws: S.staticRedraws || 0, dynReused: S.dynReused || 0, fogReused: S.fogReused || 0, ao: S.aoCount || 0, ca: +(S.caAmt || 0).toFixed(5), nvg: +(S.nvgNow || 0).toFixed(2), mudPrints: S.prints.filter(q => q.s === 3).length, blood: S.blood, menuOpen: MENU.open, frameCap: frameCap(), textures: Object.keys(S.texs).length, texFreed: S.texFreed || 0, fireflies: S.flies.length, firefliesDrawn: S.flyDrawn || 0, flySpots: (S.flySpots || []).length, waterEdges: S.waterEdgeState || '', shine: S.shineDrawn || 0, shineError: S.shineError || '', flyError: S.flyError || '', ents: (S.ents || []).length, fpsCap: +cfg.fpsCap || 0, fpsCapLoadedEarly: FPS.early,
            vision: V.on, visionError: V.error, visionWalls: V.n >> 2, visionDrawn: V.drawn, visionHidden: V.hid, visionLabelsHidden: V.labels })
    };
    if (TESTS) Object.assign(window.MDZLighting, {
        // collect the uids that got a shadow in the last frame
        _debug(on) { S.debug = !!on; S.lastDrawn = []; },
        _drawn: () => (S.lastDrawn || []).slice(),
        // force the ground wetness 0..1
        _setWet(v) { S.wet = clamp01(+v || 0); },
        // is the ground at (x, y) snow?
        _snowAt: (x, y) => snowAt(runtime(), x, y),
        _leaves: () => S.leaves.map(L => [Math.round(L.x), Math.round(L.y), L.rest < 0 ? 'fall' : 'rest', L.row, L.col]),
        _prints: () => S.prints.map(q => [Math.round(q.x), Math.round(q.y), +q.ux.toFixed(2), +q.uy.toFixed(2)]),
        _clearPrints() { S.prints = []; },
        _addPrint(x, y, ux, uy) { S.prints.push({ x, y, ux, uy, len: 6, wid: 4, t: (performance.now() - S.t0) / 1000, a: 0.9 }); },
        // the fireflies and where they could come out
        _flies: () => ({ flies: S.flies.map(f => ({ x: Math.round(f.x), y: Math.round(f.y), flee: f.flee, fade: +f.fade.toFixed(2) })), spots: (S.flySpots || []).length }),
        _spawnFlies(x, y, n) { for (let i = 0; i < (n || 5); i++) S.flies.push({ x: x + (Math.random() - 0.5) * 50, y: y + (Math.random() - 0.5) * 50, hx: x, hy: y, vx: 0, vy: 0, dir: Math.random() * 6.28, ph: Math.random() * 6.28, per: 1.5 + Math.random() * 2, age: 0, life: 60, fade: 1, flee: false, size: 6 }); return S.flies.length; },
        // the tier a GPU name would get
        _gpuTier: n => gpuTier(n),
        // switch the still-frame reuse off (for A/B checks)
        _reuse(on) { S.noReuse = !on; },
        // (debug) what went into the last hash
        _sig(on) { SIG.dbg = on ? [] : null; return on ? null : undefined; },
        _sigVals: () => (SIG.dbg || []).slice(),
        // line of sight: the eye, range, walls, and can (x, y) be seen
        _vision: () => ({ on: V.on, eye: [Math.round(V.ex), Math.round(V.ey)], R: V.R, segs: Array.from(V.segs).map(v => Math.round(v)), error: V.error, focus: V.focus, direction:[V.fx,V.fy], cone:V.fcos }),
        _visClear: (x, y) => visClear(x, y)
    });
})();
