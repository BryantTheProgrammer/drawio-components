/**
 * Page Explorer - draw.io plugin
 * Adds a collapsible, searchable tree panel for navigating pages and page groups.
 * Toggle panel: Ctrl+Shift+E, or Extras > Page Explorer
 */
Draw.loadPlugin(function (ui) {
    'use strict';

    var STORAGE_KEY = 'pageExplorer.state';
    var UNGROUPED = '(Ungrouped)';
    var PREFIX_SEPARATOR = ' / ';

    var state = { visible: true, collapsed: {}, left: 70, top: 80, width: 260, dock: 'left' }; // dock: 'left' | 'right' | 'float'
    try {
        var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved) { for (var k in saved) { state[k] = saved[k]; } }
    } catch (e) { /* ignore */ }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }

    function getPageName(page) {
        if (!page) { return 'Unnamed'; }
        if (typeof page.getName === 'function') { return page.getName() || 'Unnamed'; }
        return page.name || 'Unnamed';
    }

    function readAttr(node, names) {
        if (!node || typeof node.getAttribute !== 'function') { return null; }
        for (var i = 0; i < names.length; i++) {
            var v = node.getAttribute(names[i]);
            if (v) { return v; }
        }
        return null;
    }

    function getGroupNameLookup() {
        var lookup = {};
        var sources = [ui.pageGroups, ui.groups, ui.currentFile && ui.currentFile.pageGroups];
        sources.forEach(function (src) {
            if (!src) { return; }
            var list = Array.isArray(src) ? src : Object.keys(src).map(function (key) {
                var g = src[key];
                return typeof g === 'object' ? g : { id: key, name: g };
            });
            list.forEach(function (g) {
                if (g && (g.id != null)) { lookup[g.id] = g.name || g.title || g.label || g.id; }
            });
        });
        return lookup;
    }

    function getPageGroup(page, lookup) {
        var raw = page.group || page.groupId || page.pageGroup || page.groupName ||
            readAttr(page.node, ['group', 'groupId', 'pageGroup', 'groupName']);

        if (raw && typeof raw === 'object') {
            return { group: raw.name || raw.title || raw.id || UNGROUPED, label: getPageName(page) };
        }
        if (raw) {
            return { group: lookup[raw] || raw, label: getPageName(page) };
        }

        var name = getPageName(page);
        var idx = name.indexOf(PREFIX_SEPARATOR);
        if (idx > 0) {
            return { group: name.substring(0, idx), label: name.substring(idx + PREFIX_SEPARATOR.length) };
        }
        return { group: UNGROUPED, label: name };
    }

    function buildTree() {
        var lookup = getGroupNameLookup();
        var order = [];
        var groups = {};
        (ui.pages || []).forEach(function (page) {
            var info = getPageGroup(page, lookup);
            if (!groups[info.group]) { groups[info.group] = []; order.push(info.group); }
            groups[info.group].push({ page: page, label: info.label });
        });
        return { order: order, groups: groups };
    }

    function openPage(page) {
        if (page && page !== ui.currentPage && typeof ui.selectPage === 'function') {
            ui.selectPage(page);
        }
    }

    var style = document.createElement('style');
    style.textContent = [
        '.pe-panel{position:absolute;z-index:1000;display:flex;flex-direction:column;max-height:75vh;',
        '  min-width:180px;font:13px/1.3 Helvetica,Arial,sans-serif;background:#fff;color:#222;',
        '  border:1px solid #c4c4c4;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.18);overflow:hidden;resize:horizontal}',
        '.pe-dark{background:#2a2a2a;color:#e6e6e6;border-color:#505050}',
        '.pe-header{display:flex;align-items:center;gap:4px;padding:6px 8px;cursor:move;font-weight:bold;',
        '  background:rgba(0,0,0,.05);user-select:none}',
        '.pe-header span{flex:1}',
        '.pe-icon{border:0;background:transparent;color:inherit;cursor:pointer;padding:2px 6px;border-radius:3px;font-size:13px}',
        '.pe-icon:hover{background:rgba(0,0,0,.1)}',
        '.pe-search{margin:6px 8px;padding:5px 7px;border:1px solid #bbb;border-radius:4px;font-size:12px;',
        '  background:inherit;color:inherit}',
        '.pe-body{overflow:auto;padding:0 4px 6px}',
        '.pe-group{display:flex;align-items:center;width:100%;border:0;background:transparent;color:inherit;',
        '  text-align:left;cursor:pointer;padding:5px 6px;font-weight:bold;border-radius:4px}',
        '.pe-group:hover,.pe-page:hover{background:rgba(0,0,0,.07)}',
        '.pe-caret{display:inline-block;width:14px;font-size:10px}',
        '.pe-count{margin-left:auto;font-weight:normal;opacity:.6;font-size:11px}',
        '.pe-page{display:block;width:100%;border:0;background:transparent;color:inherit;text-align:left;',
        '  cursor:pointer;padding:4px 6px 4px 26px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.pe-page.pe-active{background:#dbeafe;color:#1d4ed8;font-weight:bold}',
        '.pe-dark .pe-page.pe-active{background:#1e3a5f;color:#93c5fd}',
        '.pe-docked{border-radius:0;box-shadow:none;border-top:0;border-bottom:0}',
        '.pe-empty{padding:8px;opacity:.6;font-style:italic}'
    ].join('\n');
    document.head.appendChild(style);

    var panel = document.createElement('div');
    panel.className = 'pe-panel';
    panel.style.left = state.left + 'px';
    panel.style.top = state.top + 'px';
    panel.style.width = state.width + 'px';

    var header = document.createElement('div');
    header.className = 'pe-header';
    var title = document.createElement('span');
    title.textContent = 'Page Explorer';

    function iconButton(text, tip, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pe-icon';
        b.textContent = text;
        b.title = tip;
        b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        b.addEventListener('click', onClick);
        return b;
    }

    header.appendChild(title);
    header.appendChild(iconButton('⊞', 'Expand all', function () { setAllCollapsed(false); }));
    header.appendChild(iconButton('⊟', 'Collapse all', function () { setAllCollapsed(true); }));
    var dockBtn = iconButton('', '', function () { cycleDock(); });
    header.appendChild(dockBtn);
    header.appendChild(iconButton('✕', 'Hide (Ctrl+Shift+E)', function () { setVisible(false); }));

    var search = document.createElement('input');
    search.className = 'pe-search';
    search.type = 'search';
    search.placeholder = 'Filter pages...';
    search.addEventListener('input', render);
    search.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            var first = body.querySelector('.pe-page');
            if (first) { first.click(); }
        }
    });

    var body = document.createElement('div');
    body.className = 'pe-body';

    panel.appendChild(header);
    panel.appendChild(search);
    panel.appendChild(body);
    document.body.appendChild(panel);

    function setAllCollapsed(value) {
        buildTree().order.forEach(function (g) { state.collapsed[g] = value; });
        saveState();
        render();
    }

    function render() {
        var dark = typeof Editor !== 'undefined' && typeof Editor.isDarkMode === 'function' && Editor.isDarkMode();
        panel.classList.toggle('pe-dark', !!dark);

        body.innerHTML = '';
        var filter = search.value.trim().toLowerCase();
        var tree = buildTree();

        tree.order.forEach(function (groupName) {
            var items = tree.groups[groupName].filter(function (item) {
                return !filter || item.label.toLowerCase().indexOf(filter) >= 0 ||
                    groupName.toLowerCase().indexOf(filter) >= 0;
            });
            if (items.length === 0) { return; }

            var hasActive = items.some(function (i) { return i.page === ui.currentPage; });
            var collapsed = !filter && state.collapsed[groupName] && !hasActive;

            var gBtn = document.createElement('button');
            gBtn.type = 'button';
            gBtn.className = 'pe-group';
            gBtn.innerHTML = '<span class="pe-caret">' + (collapsed ? '▶' : '▼') + '</span>';
            gBtn.appendChild(document.createTextNode(groupName));
            var count = document.createElement('span');
            count.className = 'pe-count';
            count.textContent = items.length;
            gBtn.appendChild(count);
            gBtn.addEventListener('click', function () {
                state.collapsed[groupName] = !collapsed;
                saveState();
                render();
            });
            body.appendChild(gBtn);

            if (collapsed) { return; }

            items.forEach(function (item) {
                var pBtn = document.createElement('button');
                pBtn.type = 'button';
                pBtn.className = 'pe-page' + (item.page === ui.currentPage ? ' pe-active' : '');
                pBtn.textContent = item.label;
                pBtn.title = item.label;
                pBtn.addEventListener('click', function () { openPage(item.page); render(); });
                body.appendChild(pBtn);
            });
        });

        if (body.children.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'pe-empty';
            empty.textContent = filter ? 'No matching pages' : 'No pages';
            body.appendChild(empty);
        }
    }

    function setVisible(v) {
        state.visible = v;
        panel.style.display = v ? 'flex' : 'none';
        saveState();
        if (v) { render(); }
        if (ui.refresh) { ui.refresh(); }
    }

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
            e.preventDefault();
            setVisible(!state.visible);
        }
    });

    ui.actions.addAction('pageExplorerToggle', function () { setVisible(!state.visible); });
    ui.actions.addAction('pageExplorerDebug', function () {
        console.group('Page Explorer debug');
        console.log('ui.pages:', ui.pages);
        (ui.pages || []).forEach(function (p, i) {
            var attrs = {};
            if (p.node && p.node.attributes) {
                for (var a = 0; a < p.node.attributes.length; a++) {
                    attrs[p.node.attributes[a].name] = p.node.attributes[a].value;
                }
            }
            console.log(i, getPageName(p), { ownKeys: Object.keys(p), nodeAttributes: attrs });
        });
        console.groupEnd();
        alert('Page details written to the browser console (F12).');
    });

    var extrasMenu = ui.menus.get('extras');
    if (extrasMenu) {
        var oldFunct = extrasMenu.funct;
        extrasMenu.funct = function (menu, parent) {
            oldFunct.apply(this, arguments);
            menu.addSeparator(parent);
            ui.menus.addMenuItems(menu, ['pageExplorerToggle', 'pageExplorerDock', 'pageExplorerDebug'], parent);
        };
    }
    ui.actions.addAction('pageExplorerDock', function () { cycleDock(); });
    var dockAction = ui.actions.get('pageExplorerDock');
    if (dockAction) { dockAction.label = 'Page Explorer: Change Dock (Left / Right / Floating)'; }
    var toggleAction = ui.actions.get('pageExplorerToggle');
    if (toggleAction) { toggleAction.label = 'Page Explorer'; }
    var debugAction = ui.actions.get('pageExplorerDebug');
    if (debugAction) { debugAction.label = 'Page Explorer: Debug Page Data'; }


    // ---------- Docking ----------
    function dockLabel() {
        return { left: '⇤', right: '⇥', float: '◱' }[state.dock] || '◱';
    }

    function cycleDock() {
        var order = ['left', 'right', 'float'];
        setDock(order[(order.indexOf(state.dock) + 1) % order.length]);
    }

    function setDock(mode) {
        state.dock = mode;
        saveState();
        ui.refresh();
    }

    function shiftEl(el, side, amount) {
        if (!el) { return; }
        var cur = parseFloat(el.style[side]) || 0;
        el.style[side] = (cur + amount) + 'px';
    }

    // Re-run after draw.io lays out its own panels so the canvas makes room for us.
    function applyLayout() {
        dockBtn.textContent = dockLabel();
        dockBtn.title = 'Dock: ' + state.dock + ' (click to change)';
        var dc = ui.diagramContainer;
        var docked = state.visible && state.dock !== 'float' && dc;

        panel.classList.toggle('pe-docked', !!docked);
        header.style.cursor = docked ? 'default' : 'move';

        if (!docked) {
            panel.style.position = 'absolute';
            panel.style.left = state.left + 'px';
            panel.style.top = state.top + 'px';
            panel.style.width = state.width + 'px';
            panel.style.height = '';
            panel.style.maxHeight = '75vh';
            return;
        }

        var r = dc.getBoundingClientRect();
        var w = state.width;
        panel.style.position = 'fixed';
        panel.style.top = r.top + 'px';
        panel.style.height = r.height + 'px';
        panel.style.maxHeight = 'none';
        panel.style.width = w + 'px';

        if (state.dock === 'left') {
            panel.style.left = r.left + 'px';
            shiftEl(dc, 'left', w);
            shiftEl(ui.tabContainer, 'left', w);
        } else {
            panel.style.left = (r.right - w) + 'px';
            shiftEl(dc, 'right', w);
            shiftEl(ui.tabContainer, 'right', w);
        }

        if (dc.style.width) { dc.style.width = Math.max(100, r.width - w) + 'px'; }
        if (ui.editor && ui.editor.graph) { ui.editor.graph.sizeDidChange(); }
    }

    var originalRefresh = ui.refresh;
    ui.refresh = function () {
        var result = originalRefresh.apply(ui, arguments);
        try { applyLayout(); } catch (e) { console.warn('Page Explorer layout:', e); }
        return result;
    };

    header.addEventListener('mousedown', function (e) {
        if (state.dock !== 'float') { return; }
        var startX = e.clientX, startY = e.clientY;
        var startLeft = panel.offsetLeft, startTop = panel.offsetTop;
        function move(ev) {
            state.left = Math.max(0, startLeft + ev.clientX - startX);
            state.top = Math.max(0, startTop + ev.clientY - startY);
            panel.style.left = state.left + 'px';
            panel.style.top = state.top + 'px';
        }
        function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            saveState();
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        e.preventDefault();
    });

    panel.addEventListener('mouseup', function () {
        if (panel.offsetWidth !== state.width) { state.width = panel.offsetWidth; saveState(); if (state.dock !== 'float') { ui.refresh(); } }
    });

    var lastSignature = '';
    function signature() {
        var lookup = getGroupNameLookup();
        return (ui.pages || []).map(function (p) {
            var g = getPageGroup(p, lookup);
            return g.group + '|' + g.label + (p === ui.currentPage ? '*' : '');
        }).join('\n');
    }
    window.setInterval(function () {
        if (!state.visible) { return; }
        var sig = signature();
        if (sig !== lastSignature) { lastSignature = sig; render(); }
    }, 750);

    setVisible(state.visible);
});
