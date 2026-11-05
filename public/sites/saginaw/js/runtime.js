/* Minimal runtime for the Garber Collision site pages.
   Renders component templates (compiled to JSON at build time) with
   {{holes}}, <sc-for>, <sc-if> and <dc-import>, and re-renders on setState
   using morphdom so focus and form state survive updates. */
(function () {
  var SVG = 'http://www.w3.org/2000/svg';
  var defs = {};          // name -> { tpl, cls }
  var instances = {};     // path -> component instance
  var root = null, rootName = null, scheduled = false;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, p);
    schedule();
  };
  window.DCLogic = DCLogic;

  window.DC = {
    def: function (name, tpl, cls) { defs[name] = { tpl: tpl, cls: cls }; },
    mount: function (name, el) { rootName = name; root = el; render(!el.firstElementChild); }
  };

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(function () { scheduled = false; render(false); });
  }

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  function lookup(path, scope) {
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function evalAttr(raw, scope) {
    var m = WHOLE.exec(raw);
    if (m) return lookup(m[1], scope);
    return raw.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }

  function instanceFor(name, props, path) {
    var inst = instances[path];
    var def = defs[name];
    if (!def) { console.warn('Missing component', name); return null; }
    if (!inst || inst.__name !== name) {
      inst = new def.cls(props);
      if (!inst.props) inst.props = props;
      if (!inst.state) inst.state = {};
      inst.__name = name;
      instances[path] = inst;
    } else {
      var prev = inst.props;
      var changed = false;
      for (var k in props) if (props[k] !== prev[k]) changed = true;
      for (var k2 in prev) if (!(k2 in props)) changed = true;
      if (changed) {
        inst.props = props;
        if (typeof inst.componentDidUpdate === 'function') inst.componentDidUpdate(prev, inst.state);
      }
    }
    return inst;
  }

  function renderComponent(name, props, path, parent, inSvg) {
    var inst = instanceFor(name, props, path);
    if (!inst) return;
    var vals = (inst.renderVals && inst.renderVals()) || {};
    var ctx = { path: path, n: 0 };
    renderNodes(defs[name].tpl, vals, ctx, parent, inSvg);
  }

  function renderNodes(nodes, scope, ctx, parent, inSvg) {
    for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scope, ctx, parent, inSvg);
  }

  function eventName(attr, tag, type) {
    var ev = attr.slice(2).toLowerCase();
    if (ev === 'change' && (tag === 'textarea' || (tag === 'input' && !/^(checkbox|radio|file)$/.test(type || 'text')))) return 'input';
    return ev;
  }

  function renderNode(node, scope, ctx, parent, inSvg) {
    if (typeof node === 'string') {
      var txt = node.indexOf('{{') >= 0 ? node.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); }) : node;
      parent.appendChild(document.createTextNode(txt));
      return;
    }
    var tag = node.n, a = node.a || {};
    if (tag === 'sc-for') {
      var list = evalAttr(a.list || '', scope) || [];
      var as = a.as || 'item';
      for (var j = 0; j < list.length; j++) {
        var s = Object.create(scope); s[as] = list[j];
        renderNodes(node.c, s, ctx, parent, inSvg);
      }
      return;
    }
    if (tag === 'sc-if') {
      if (evalAttr(a.value || '', scope)) renderNodes(node.c, scope, ctx, parent, inSvg);
      return;
    }
    if (tag === 'dc-import') {
      var props = {};
      for (var k in a) {
        if (k === 'name' || k.indexOf('hint-') === 0) continue;
        props[k] = evalAttr(a[k], scope);
      }
      ctx.n++;
      renderComponent(a.name, props, ctx.path + '/' + ctx.n + ':' + a.name, parent, inSvg);
      return;
    }
    var svg = inSvg || tag === 'svg';
    var el = svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
    var handlers = null, valueProp, hasValue = false;
    for (var name in a) {
      var raw = a[name];
      if (/^on[A-Z]/.test(name)) {
        var fn = evalAttr(raw, scope);
        if (typeof fn === 'function') { handlers = handlers || {}; handlers[eventName(name, tag, a.type)] = fn; }
        continue;
      }
      var v = raw.indexOf('{{') >= 0 ? evalAttr(raw, scope) : raw;
      if (v === false || v == null) continue;
      if (v === true) v = '';
      if (name === 'value' && (tag === 'input' || tag === 'select' || tag === 'textarea')) { valueProp = String(v); hasValue = true; if (tag !== 'select') el.setAttribute('value', valueProp); continue; }
      if (name === 'checked') { el.__dcc = true; el.checked = true; }
      if (name === 'aria-pressed' || name === 'aria-expanded' || name === 'aria-checked') v = String(v);
      el.setAttribute(name, String(v).replace(/\/_blob\/([0-9a-f]{32})/g, (window.__WSB || '') + '/img/$1.webp'));
    }
    if (tag === 'input' && a.type === 'checkbox' && !('__dcc' in el)) el.__dcc = false;
    if (handlers) el.__dc = handlers;
    if (node.c) renderNodes(node.c, scope, ctx, el, svg && tag !== 'foreignObject');
    if (hasValue) { el.__dcv = valueProp; el.value = valueProp; }
    parent.appendChild(el);
  }

  function render(first) {
    var tmp = document.createElement('div');
    renderComponent(rootName, {}, 'root', tmp, false);
    if (first) {
      while (root.firstChild) root.removeChild(root.firstChild);
      while (tmp.firstChild) root.appendChild(tmp.firstChild);
      if (window.__wsApply) window.__wsApply(root);
      return;
    }
    // Elements marked data-dc-keep hold third-party content (the reviews
    // widget). Set the live ones aside and put them back after the update.
    var kept = Array.prototype.slice.call(root.querySelectorAll('[data-dc-keep]'));
    morphdom(root, tmp, {
      childrenOnly: true,
      onBeforeElUpdated: function (from, to) {
        if (from.hasAttribute('data-dc-keep') || from.tagName === 'VIDEO') return false;
        if (from.tagName === 'IMG' && from.getAttribute('src') === to.getAttribute('src') && from.getAttribute('alt') === to.getAttribute('alt')) return false;
        from.__dc = to.__dc;
        if ('__dcv' in to) { from.__dcv = to.__dcv; }
        if ('__dcc' in to) { from.checked = to.__dcc; }
        return true;
      },
      onElUpdated: function (el) {
        if ('__dcv' in el && el.value !== el.__dcv) el.value = el.__dcv;
      }
    });
    var fresh = root.querySelectorAll('[data-dc-keep]');
    for (var i = 0; i < fresh.length && i < kept.length; i++) {
      if (fresh[i] !== kept[i]) fresh[i].parentNode.replaceChild(kept[i], fresh[i]);
    }
    // Website Studio: re-apply published content edits after every render.
    if (window.__wsApply) window.__wsApply(root);
  }

  // Pages arrive pre-rendered. Wire up the interactive parts on the first
  // sign of interaction (or right away when pre-rendering at build time).
  var hydrated = false;
  function hydrate() {
    var src = document.getElementById('dc-defs');
    if (hydrated || !src) return;
    hydrated = true;
    (new Function(src.textContent))();
  }
  var defsEl = document.getElementById('dc-defs');
  if (/[?&]prerender/.test(location.search) || (defsEl && defsEl.hasAttribute('data-eager'))) hydrate();
  else ['pointerdown', 'touchstart', 'keydown', 'focusin', 'mouseover'].forEach(function (t) {
    window.addEventListener(t, hydrate, { capture: true, passive: true, once: true });
  });

  ['click', 'input', 'change', 'submit'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.__dc && el.__dc[type]) { el.__dc[type](e); return; }
        el = el.parentNode;
      }
    });
  });
})();
