(function(){
      'use strict';
      // ===== 参数 =====
      var HOLD_MS = 500;    // 长按判定阈值
      var CYCLE_MS = 1000;  // 每秒切换一个目标
      var BTN = { x1: 855, x2: 1045, y1: 458, y2: 568 };  // t798 瞄准按钮游戏坐标区域

      // ===== 运行时访问（C2 混淆映射文档确证）=====
      // rt.S[i] 类型表(.q=实例数组 .name) | rt.tD 布局变量表(.name/.data)
      // rt.jg[uid] UID→实例 | inst.P()=set_bbox_changed（改坐标后必须调用才重绘）
      function rt(){ try { return window.cr_getC2Runtime ? window.cr_getC2Runtime() : null; } catch(e){ return null; } }
      function getVar(name){
        try { var r = rt(); if (!r || !r.tD) return undefined;
          for (var i = 0; i < r.tD.length; i++) if (r.tD[i] && r.tD[i].name === name) return r.tD[i].data;
        } catch(e){} return undefined;
      }
      function setVar(name, val){
        try { var r = rt(); if (!r || !r.tD) return;
          for (var i = 0; i < r.tD.length; i++) if (r.tD[i] && r.tD[i].name === name) { r.tD[i].data = val; return; }
        } catch(e){}
      }
      function touch(inst){ try { if (inst && inst.P) inst.P(); } catch(e){} }
      function player(){ try { var r = rt(); return r.S[181].q[0]; } catch(e){ return null; } }

      // ===== 目标收集：视野 = 手持枪械攻击距离 weapon_r（需求6）=====
      // 可瞄准对象 = 带 attack 行为的类型（39 类：僵尸/狼/NPC）+ 农场动物/野生动物
      // t1221=动物实体核心（pig_sp 生成，动画前缀变量切换猪/鸡）、t1222=鸡身体、
      // t478/479=鹿、t615/616=兔（无 attack 但可被子弹命中，可瞄准可猎杀）
      // t252=敌对射手 t547=敌对拳击手 t556=敌方队友 t829=土匪
      // 友军 t529 已排除（不能瞄准自己人）；t254 bot刷新点；t1064 隐形控制对象
      var AIM_TYPES = [206, 221, 256, 279, 400, 401, 475, 476, 582, 583, 584, 585,
                       586, 587, 588, 589, 600, 715, 716, 718, 719, 720, 722, 729,
                       732, 783, 850, 886, 893, 932, 935, 956, 964, 982, 1250, 1316,
                       1331, 1376, 1413,
                       // 农场动物/野生动物（无 attack 行为但可瞄准可猎杀）
                       478, 479, 615, 616, 1221, 1222,
                       // NPC/bot（Run/Eyes/Aim/Gun 行为：敌对/中立 NPC）
                       // 252=敌对射手 547=敌对拳击手 556=敌方队友 829=土匪
                       // （友军 t529 不加入——不能瞄准自己人）
                       252, 547, 556, 829];
      // 实体核心层（同一生物多实例去重时优先保留；带 MainLook/Turret 的眼睛/实体层）
      var CORE_TYPES = [256, 279, 400, 719, 720, 475, 850, 935, 478, 615, 1221];

      // 障碍物类型（静态确证：带 Solid 碰撞行为的 66 类：建筑/树/车/墙/残骸等）
      // 用于视线遮挡检测：玩家到目标的连线被障碍物挡住 = 视野丢失，不可瞄准
      var OBSTACLE_TYPES = [182, 199, 205, 208, 211, 215, 242, 247, 248, 249, 250,
        286, 300, 301, 302, 303, 304, 305, 306, 308, 309, 310, 311, 312, 313, 345,
        348, 355, 398, 402, 432, 433, 516, 574, 644, 650, 656, 696, 699, 701, 702,
        777, 780, 786, 787, 788, 795, 854, 891, 958, 972, 1028, 1029, 1216, 1218,
        1252, 1254, 1310, 1312, 1313, 1314, 1352, 1398, 1400, 1402, 1404,
        // 车辆（fam11 17 类，无 Solid 行为但挡视线）
        260, 859, 860, 861, 190, 484, 213, 487, 214, 485, 486, 212, 483, 272,
        238, 239, 237,
        // 4.2.0 城市移植建筑外壳（带 Solid，生成到 Buildings_base 层）
        // 2026-09-10 修复：此前缺失导致墙后目标被轮换锁定
        1450, 1452, 1454, 1456, 1458, 1460, 1466, 1468, 1478, 1481, 1483,
        // 车辆（Vehicle 行为 + Solid2；静态地图车，2026-09-10 补）
        1067];

      // 线段与轴对齐矩形相交（Liang-Barsky 简化版）
      function segRectHit(x0, y0, x1, y1, rx, ry, rw, rh){
        var minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        var minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) return false;
        if (x0 >= rx && x0 <= rx + rw && y0 >= ry && y0 <= ry + rh) return true;
        if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
        var dx = x1 - x0, dy = y1 - y0, t;
        if (dx !== 0){
          t = (rx - x0) / dx; if (t > 0 && t < 1){ var yy = y0 + t * dy; if (yy >= ry && yy <= ry + rh) return true; }
          t = (rx + rw - x0) / dx; if (t > 0 && t < 1){ var yy2 = y0 + t * dy; if (yy2 >= ry && yy2 <= ry + rh) return true; }
        }
        if (dy !== 0){
          t = (ry - y0) / dy; if (t > 0 && t < 1){ var xx = x0 + t * dx; if (xx >= rx && xx <= rx + rw) return true; }
          t = (ry + rh - y0) / dy; if (t > 0 && t < 1){ var xx2 = x0 + t * dx; if (xx2 >= rx && xx2 <= rx + rw) return true; }
        }
        return false;
      }

      // 玩家(x0,y0) 到目标(x1,y1) 的视线是否被障碍物挡住
      function isBlocked(x0, y0, x1, y1){
        try {
          var r = rt();
          for (var i = 0; i < OBSTACLE_TYPES.length; i++){
            var t = r.S[OBSTACLE_TYPES[i]];
            if (!t || !t.q) continue;
            var q = t.q;
            for (var j = 0; j < q.length; j++){
              var it = q[j];
              if (!it || typeof it.x !== 'number' || it.visible === false) continue;
              var w = it.width || 30, h = it.height || 30;
              if (segRectHit(x0, y0, x1, y1, it.x - w / 2, it.y - h / 2, w, h)) return true;
            }
          }
        } catch(e){}
        return false;
      }

      // 排除层：GUI 类（大小写不敏感）+ 玩家身体/装备显示层（Pin 在玩家身上）
      function isBadLayer(name){
        if (!name) return false;
        var n = String(name).toLowerCase();
        if (n.indexOf('gui') >= 0) return true;
        if (n === 'player' || n.indexOf('player_') === 0 || n.indexOf('s_') === 0) return true;
        return false;
      }

      function collectTargets(){
        var r = rt(); if (!r) return [];
        var p = player(); if (!p || typeof p.x !== 'number') return [];
        var pr = 400; var w = getVar('weapon_r'); if (typeof w === 'number' && w > 0) pr = w;
        var rawList = [];
        for (var i = 0; i < r.S.length; i++){
          if (AIM_TYPES.indexOf(i) < 0) continue;   // 只收集可瞄准对象类型
          var t = r.S[i];
          if (!t || !t.q) continue;
          var q = t.q;
          for (var j = 0; j < q.length; j++){
            var it = q[j];
            if (!it || typeof it.x !== 'number' || typeof it.uid !== 'number') continue;
            if (it === p) continue;
            if (it.visible === false) continue;
            if (isBadLayer(it.layer && it.layer.name)) continue;
            var dx = it.x - p.x, dy = it.y - p.y;
            var d = Math.sqrt(dx * dx + dy * dy);
            // d<10 = Pin 在玩家身上的 UI/装备实例（dist≈0），排除（贴脸目标 10-30px 仍可瞄准）
            if (d > pr || d < 10) continue;
            // 视线遮挡：被建筑/障碍物挡住的目标不可瞄准（视野丢失）
            if (isBlocked(p.x, p.y, it.x, it.y)) continue;
            // 找该目标对应的 t1057 隐形标记（标记位置≈目标位置，原版开火/准星走标记链路）
            var markUid = -1, markD = 999999;
            try {
              var mq = r.S[1057].q;
              for (var mi = 0; mi < mq.length; mi++){
                var m = mq[mi];
                if (!m || typeof m.x !== 'number') continue;
                var mdx = m.x - it.x, mdy = m.y - it.y;
                var md = Math.sqrt(mdx * mdx + mdy * mdy);
                if (md < markD){ markD = md; markUid = m.uid; }
              }
            } catch(e){}
            rawList.push({ uid: it.uid, x: it.x, y: it.y, dist: d, type: t.name, ti: i,
                           core: CORE_TYPES.indexOf(i) >= 0, inst: it,
                           mark: (markUid >= 0 && markD < 60) ? markUid : -1 });
          }
        }
        // 按距离排序，再坐标去重（<15px 视为同一生物的多层实例，优先保留实体核心层）
        rawList.sort(function(a, b){ return a.dist - b.dist; });
        var out = [];
        for (var k = 0; k < rawList.length; k++){
          var item = rawList[k];
          var dup = false;
          for (var m = 0; m < out.length; m++){
            var o = out[m];
            var ddx = o.x - item.x, ddy = o.y - item.y;
            if (Math.sqrt(ddx * ddx + ddy * ddy) < 15){
              dup = true;
              if (item.core && !o.core) out[m] = item;   // 实体核心层优先
              break;
            }
          }
          if (!dup) out.push(item);
        }
        return out;
      }

      // ===== 核心：把瞄准钉到目标 =====
      // 确证链路：t1057(隐形瞄准点) → 开火时生成 t652 锁定标记并 Pin 到 t1057
      //          → t225.Turret 锁定 t652 开火（子弹落点 = t1057 位置）
      //          → t507(准星) 每帧移动+Pin 到 t1057；Target_aim_uid 全局变量同步
      // 所以：移动 t1057 + 同步 Target_aim_uid = 切换射击目标
      function applyTarget(t){
        var r = rt(); if (!r || !t) return;
        // 1) 准星坐标写回（兜底）
        try {
          var q2 = r.S[507].q;
          if (q2 && q2.length){ q2[0].x = t.x; q2[0].y = t.y; touch(q2[0]); }
        } catch(e){}
        // 2) ★ 终极接管：准星 Pin 行为实例的 Gb（Pin 目标）= 锁定目标实例
        //    dumpDeep 实测：t507.da[0].Gb = 原版当前 Pin 的生物实例，
        //    子弹方向 = 玩家→准星位置 = Pin 目标位置 → 改 Gb 即改射击目标
        //    同时清 Pin 偏移（pm/cq/Vj/mg/xd），否则准星会偏离目标中心
        try {
          var q2b = r.S[507].q;
          if (q2b && q2b.length && q2b[0].da && q2b[0].da[0]){
            var pinInst = q2b[0].da[0];
            if (pinInst.Gb !== t.inst){
              pinInst.Gb = t.inst;
              pinInst.pm = 0; pinInst.cq = 0; pinInst.Vj = 0; pinInst.mg = 0; pinInst.xd = 0;
            }
          }
        } catch(e){}
        // 3) 变量同步：Target_aim_uid = 目标实例 uid（原版语义，dumpDeep 确证）
        setVar('Target_aim_uid', t.uid);
        setVar('manual_target_on', 1);
        // 4) t507 变量0 同步（Player_check_targets 用它）
        try {
          var q2c = r.S[507].q;
          if (q2c && q2c.length && q2c[0].cc) q2c[0].cc[0] = t.uid;
        } catch(e){}
      }

      // ===== 轮换状态 =====
      var pressing = false, downT = 0, cycling = false, locked = false;
      var holdTimer = null;
      var savedAim = null;   // 轮换前准星状态（锁定无目标退出时恢复）
      var targets = [], curIdx = -1, curTarget = null;
      var rafId = null, cycleTimer = null, fastTimer = null;

      function pickTarget(uid){
        for (var i = 0; i < targets.length; i++) if (targets[i].uid === uid) return i;
        return -1;
      }

      // 每秒切换：由近到远循环（需求1：最近→第二近→…→最远→最近）
      // 用内部 curTarget 定位（不读 Target_aim_uid——它会被原版每帧覆盖导致顺序跳变）
      function cycleOnce(){
        targets = collectTargets();
        if (!targets.length){ console.log('[zcyc] 视野内无目标 weapon_r=' + getVar('weapon_r')); return; }
        var curUid = curTarget ? curTarget.uid : -1;
        var pos = -1;
        for (var i = 0; i < targets.length; i++) if (targets[i].uid === curUid) { pos = i; break; }
        // pos<0（当前目标失效/不在列表）→ 从最近开始；否则选下一个（末尾回绕到最近）
        var next = (pos >= 0) ? (pos + 1) % targets.length : 0;
        curIdx = next; curTarget = targets[next];
        applyTarget(curTarget);
        console.log('[zcyc] #' + next + '/' + (targets.length - 1) + ' uid=' + curTarget.uid + ' ' + curTarget.type +
          ' dist=' + Math.round(curTarget.dist) + ' @(' + Math.round(curTarget.x) + ',' + Math.round(curTarget.y) + ')');
      }

      // 每帧强制写回（对抗 PlayerAim/原版每帧重置）+ 实时坐标跟随 + 目标失效自动回最近（需求3）
      function findInst(uid, ti){
        try {
          var r = rt();
          if (r.jg && r.jg[uid]) return r.jg[uid];
          if (ti !== undefined && r.S[ti]){
            var q = r.S[ti].q;
            for (var k = 0; k < q.length; k++) if (q[k].uid === uid) return q[k];
          }
        } catch(e){}
        return null;
      }
      function forceLoop(){
        if (!cycling && !locked){ rafId = null; return; }
        if (curTarget){
          // 每帧刷新实时坐标（目标在移动）
          var inst = findInst(curTarget.uid, curTarget.ti);
          if (!inst || typeof inst.x !== 'number'){ curTarget = null; curIdx = -1; }
          else {
            curTarget.x = inst.x; curTarget.y = inst.y;
            curTarget.inst = inst;   // 刷新实例引用（Pin 目标用最新对象）
            // 丢失判定：目标超出瞄准范围 weapon_r（需求：丢失后自动回最近）
            try {
              var p = player();
              if (p && typeof p.x === 'number'){
                var dd = Math.sqrt((inst.x - p.x) * (inst.x - p.x) + (inst.y - p.y) * (inst.y - p.y));
                var w = getVar('weapon_r'); if (typeof w !== 'number') w = 400;
                // 丢失判定：超出射程 1.15 倍（滞后防边界抖动）/ 视线被障碍物遮挡；贴脸不算丢失
                if (dd > w * 1.15 || isBlocked(p.x, p.y, inst.x, inst.y)){ curTarget = null; }
              }
            } catch(e){}
          }
        }
        if (!curTarget){
          targets = collectTargets();
          if (targets.length){
            curTarget = targets[0]; curIdx = 0; applyTarget(curTarget);
            console.log('[zcyc] 目标丢失/失效 → 回最近 uid=' + curTarget.uid + ' ' + curTarget.type);
          } else if (locked) {
            // 无任何目标：退出锁定，恢复轮换前状态
            locked = false;
            restoreAim();
            console.log('[zcyc] 无目标，退出锁定');
            rafId = null;
            return;
          }
        } else {
          applyTarget(curTarget);
        }
        rafId = requestAnimationFrame(forceLoop);
      }

      function startCycling(){
        var r = rt(); if (!r || cycling) return;
        // 调试版：不强制开镜（需求1 最终版要求 isAim==1 才切换；验证通过后恢复检查）
        var aim = getVar('isAim');
        console.log('[zcyc] isAim=' + aim + ' (0=未开镜 1=开镜；调试版不拦截) 长按启动');
        cycling = true;
        // 记录轮换前的准星/瞄准点状态，松开时精确恢复
        savedAim = null;
        try {
          var q2 = r.S[507].q;
          if (q2 && q2.length)
            savedAim = { x: q2[0].x, y: q2[0].y, vis: q2[0].visible };
        } catch(e){}
        console.log('[zcyc] ===== 轮换开始 =====');
        cycleOnce();
        cycleTimer = setInterval(cycleOnce, CYCLE_MS);
        fastTimer = setInterval(function(){ if (cycling && curTarget) applyTarget(curTarget); }, 33);
        rafId = requestAnimationFrame(forceLoop);
      }

      // 恢复轮换前的瞄准状态（锁定无目标退出时调用）
      function restoreAim(){
        try {
          var r = rt();
          // 只恢复准星 t507；t1057 标记不动（原版 PlayerAim 会接管）
          var q2 = r.S[507].q;
          if (q2 && q2.length && savedAim){
            q2[0].x = savedAim.x; q2[0].y = savedAim.y;
            q2[0].visible = savedAim.vis;
            touch(q2[0]);
          }
        } catch(e){}
        setVar('Target_aim_uid', 0);
        setVar('manual_target_on', 0);
        targets = []; curIdx = -1; curTarget = null;
        console.log('[zcyc] ===== 已恢复轮换前瞄准状态 =====');
      }

      // 松开长按：停止轮换，锁定当前目标并持续跟随（直到死亡/超出范围）
      function lockCurrent(){
        if (!cycling) return;
        cycling = false;
        if (cycleTimer) clearInterval(cycleTimer);
        if (fastTimer) clearInterval(fastTimer);
        cycleTimer = fastTimer = null;
        if (!curTarget){
          targets = collectTargets();
          if (targets.length){ curTarget = targets[0]; curIdx = 0; }
        }
        if (curTarget){
          locked = true;
          applyTarget(curTarget);
          console.log('[zcyc] 松开 → 锁定目标 uid=' + curTarget.uid + ' ' + curTarget.type + '（跟随中）');
        } else {
          console.log('[zcyc] 松开，无目标可锁定');
          restoreAim();
          rafId = null;
        }
      }

      // 完全停止（再次按下时清理旧状态，不恢复——用户马上开始新操作）
      function stopAll(){
        cycling = false; locked = false;
        if (cycleTimer) clearInterval(cycleTimer);
        if (fastTimer) clearInterval(fastTimer);
        if (rafId) cancelAnimationFrame(rafId);
        cycleTimer = fastTimer = null; rafId = null;
        targets = []; curIdx = -1; curTarget = null;
        // 关键：清理残留变量，否则原版会保持"手动锁定"卡死（无法瞄准/攻击其他实体）
        setVar('Target_aim_uid', 0);
        setVar('manual_target_on', 0);
      }

      // ===== 攻击按钮区域（t505 射击按钮，右下角）=====
      // 开火瞬间原版会重置瞄准到最近目标——在 DOM 事件阶段（先于游戏 tick）强制写回锁定目标
      var ATK_BTN = { x1: 890, x2: 1024, y1: 415, y2: 525 };
      function inAtkBtn(e){
        var cv = document.getElementById('c2canvas');
        if (!cv) return false;
        var r = cv.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        var gx = (e.clientX - r.left) / r.width * 1024;
        var gy = (e.clientY - r.top) / r.height * 768;
        return (gx >= ATK_BTN.x1 && gx <= ATK_BTN.x2 && gy >= ATK_BTN.y1 && gy <= ATK_BTN.y2);
      }
      function fireForceWrite(e){
        // 锁定模式下开火：立即把瞄准钉回锁定目标（对抗原版开火重置）
        if (!locked || !curTarget) return;
        var t = e;
        if (t && t.touches && t.touches.length) t = { clientX: t.touches[0].clientX, clientY: t.touches[0].clientY };
        if (!inAtkBtn(t)) return;
        applyTarget(curTarget);
      }
      document.addEventListener('mousedown', fireForceWrite, true);
      document.addEventListener('touchstart', fireForceWrite, { passive: true, capture: true });

      // ===== 按钮区域检测（画布坐标 → 游戏坐标 1024x768）=====
      // 修复(2026-09-10)：攻击键 t505 与瞄准键 t798 的硬编码区域重叠，
      // 长按开火键会误触发轮换 → 改为实例级判定 + 攻击键互斥 + 硬编码兜底
      function hitInstType(typeNo, gx, gy){
        try {
          var r = rt(); if (!r) return false;
          var t = r.S[typeNo]; if (!t || !t.q) return false;
          var q = t.q;
          for (var i = 0; i < q.length; i++){
            var it = q[i];
            if (!it || typeof it.x !== 'number') continue;
            if (it.visible === false) continue;
            var w = it.width || 60, h = it.height || 60;
            // 兼容实例原点=中心 与 原点=左上 两种布局
            if ((gx >= it.x - w / 2 && gx <= it.x + w / 2 && gy >= it.y - h / 2 && gy <= it.y + h / 2) ||
                (gx >= it.x && gx <= it.x + w && gy >= it.y && gy <= it.y + h)) return true;
          }
        } catch(e){}
        return false;
      }
      function inBtn(e){
        var cv = document.getElementById('c2canvas');
        if (!cv) return false;
        var r = cv.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        var gx = (e.clientX - r.left) / r.width * 1024;
        var gy = (e.clientY - r.top) / r.height * 768;
        // 实例级判定优先：t798 存在实例时严格按实例判定
        try {
          var r2 = rt();
          if (r2 && r2.S[798] && r2.S[798].q && r2.S[798].q.length){
            if (hitInstType(505, gx, gy)) return false;  // 按在攻击键上 → 非瞄准长按
            return hitInstType(798, gx, gy);
          }
        } catch(e){}
        // 兜底：硬编码区域 + 与攻击键区域互斥
        var inZoom = (gx >= BTN.x1 && gx <= BTN.x2 && gy >= BTN.y1 && gy <= BTN.y2);
        var inAtk  = (gx >= ATK_BTN.x1 && gx <= ATK_BTN.x2 && gy >= ATK_BTN.y1 && gy <= ATK_BTN.y2);
        return inZoom && !inAtk;
      }

      document.addEventListener('mousedown', function(e){
        if (!inBtn(e)) return;
        pressing = true; downT = Date.now();
        if (cycling || locked) stopAll();   // 重新按下：清理旧的轮换/锁定
        // 按住 500ms 后开始轮换（保持按住期间持续切换）
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(function(){
          holdTimer = null;
          if (pressing && !cycling && !locked) startCycling();
        }, HOLD_MS);
      });
      document.addEventListener('mouseup', function(){
        if (!pressing) return;
        pressing = false;
        if (holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
        // 长按松开 → 锁定当前目标并跟随（需求：松开后锁定，直到丢失/死亡）
        if (cycling) lockCurrent();
      });

      // ===== 手机端触摸支持（游戏 CSS touch-action:none 会屏蔽兼容鼠标事件，必须单独监听 touch）=====
      document.addEventListener('touchstart', function(e){
        if (!e.touches || e.touches.length < 1) return;
        var t = e.touches[0];
        if (!inBtn({ clientX: t.clientX, clientY: t.clientY })) return;
        // 阻止长按触发系统菜单/页面缩放（按钮区域内）
        if (e.cancelable) e.preventDefault();
        pressing = true; downT = Date.now();
        if (cycling || locked) stopAll();
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(function(){
          holdTimer = null;
          if (pressing && !cycling && !locked) startCycling();
        }, HOLD_MS);
      }, { passive: false, capture: true });

      document.addEventListener('touchend', function(e){
        if (!pressing) return;
        pressing = false;
        if (holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
        if (cycling) lockCurrent();
      }, { passive: true, capture: true });

      document.addEventListener('touchcancel', function(e){
        if (!pressing) return;
        pressing = false;
        if (holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
        if (cycling) lockCurrent();
      }, { passive: true, capture: true });

      /* [发布版已剥离：__zcyc 调试工具] */
    })();