/*!
 * xx_tree_select.js
 * Oracle APEX friendly Tree + Checkbox widget
 * - Progressive loading (roots + children via plugin AJAX).
 * - Tri-state logic, allowParent/allowLeaf rules.
 * - Search (client or server) with highlight and ancestor expansion.
 * - Expand/Collapse All.
 *
 * Requires: apex.server, apex.jQuery, apex.util
 * Safe for CSP (no inline eval).
 */
(function (win, $, util) {
  "use strict";
var _hasIcons = true; // module-level default; set later from cfg

 // ADD THESE LINES (module-scope so renderers & search can use them)
var _lastSearchTerm = "";
var _lastSearchMode = "NONE";
function onSearchTermChanged(term) {
  _lastSearchTerm = term || "";
  _lastSearchMode = "NONE";
} 

// === Bulk Handlers (attached inside init) ================================
// =====================================================================
  // Polyfills / tiny utils
  // =====================================================================
  if (typeof util.debounce !== "function") {
    util.debounce = function (fn, wait) {
      var t = null;
      return function () {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait);
      };
    };
  }

  function toId(x) { return x == null ? null : String(x); }
  function esc(s) { return util.escapeHTML(String(s == null ? "" : s)); }
  // --- Convert a SQL LIKE pattern to a RegExp for client-side highlighting ---
function likeToRegExp(pattern) {
  if (!pattern) return /$a^/; // never matches
  // escape regex meta
  var s = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // convert SQL wildcards
  s = s.replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(s, 'ig');
}

  function escCSS(s) { return util.escapeCSS(String(s == null ? "" : s)); }
  function uniq(a) { var m = Object.create(null), out = []; a.forEach(function (v) { if (!m[v]) { m[v] = 1; out.push(v); } }); return out; }
  function asCSV(ids) { return ids.join(","); }
  function asJSON(ids) { return JSON.stringify(ids); }
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }



  function setItemValue(itemName, value) {
    if (!itemName) return;
    var item = apex.item(itemName);
    if (item && item.setValue) { item.setValue(value); return; }
    var $el = $("#" + itemName);
    if ($el.length) { $el.val(value).trigger("change"); }
  }

  // Resolve boolean-ish flags across different key styles  :contentReference[oaicite:5]{index=5}
  function flagOf(row, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (hasOwn(row, keys[i])) {
        var v = row[keys[i]];
        if (v === true || v === 1 || v === "1" || v === "true") return 1;
        return 0;
      }
    }
    return 0;
  }

  function firstOf(row, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (row[keys[i]] != null) return row[keys[i]];
    }
    return null;
  }

  function normalizeRow(row) {
    var id = toId(firstOf(row, ["id"]));
    var label = firstOf(row, ["label", "text", "name"]);
    var parent = firstOf(row, ["parent_id", "parentId", "pid"]);
    var isLeaf = flagOf(row, ["is_leaf", "leaf"]);
    var hasKids = flagOf(row, ["has_children", "hasChildren"]);
    var selected = flagOf(row, ["selected", "checked", "isChecked"]);
    var disabled = flagOf(row, ["disabled", "isDisabled"]);
    var icon = firstOf(row, ["icon", "icon_css", "iconClass"]); // NEW

    if (!isLeaf && !hasKids) { isLeaf = 1; hasKids = 0; }
    else if (isLeaf && !hasKids) { hasKids = 0; }
    else if (!isLeaf && hasKids) { isLeaf = 0; }

    return {
      id: id,
      label: String(label == null ? id : label),
      parent_id: parent,
      is_leaf: isLeaf,
      has_children: hasKids,
      selected: selected,
      disabled: disabled,
      icon: icon // NEW
    };
  }

  // =====================================================================
  // AJAX plumbing
  // =====================================================================
  function callAjax(cfg, payload) {
  var region = (apex.region && cfg.staticId) ? apex.region(cfg.staticId) : null;
  if (region && region.showSpinner) region.showSpinner();

  return new Promise(function (resolve, reject) {
    apex.server.plugin(
      cfg.ajaxIdentifier,
      payload,
      {
        dataType: "json",
        success: function (data) { resolve(data || []); },
        error: function (jqXHR) {
  var msg = (jqXHR && (jqXHR.responseJSON || jqXHR.responseText)) || jqXHR;
  console.error("[TreeSelect] AJAX error:", msg);
  reject(jqXHR);
},
        complete: function () {
          if (region && region.hideSpinner) region.hideSpinner();
        }
      }
    );
  });
}

//function withBusy($region, promise) {
//  var $overlay = $('<div class="ts-overlay"></div>');
  function withBusy($region, promise) {
   var $overlay = $('<div class="ts-busyOverlay"></div>');
  $region.append($overlay).addClass("is-busy");
  var r = (apex.region && $region.attr("id")) ? apex.region($region.attr("id")) : null;
  if (r && r.showSpinner) r.showSpinner();

  return Promise.resolve()
    .then(() => promise)
    .finally(() => {
      $overlay.remove();
      $region.removeClass("is-busy");
      if (r && r.hideSpinner) r.hideSpinner();
    });
}

  function loadRoots(cfg) { return callAjax(cfg, { x01: "roots" }); }
  function loadChildren(cfg, parentId) { return callAjax(cfg, { x01: "children", x02: toId(parentId) }); }
  function searchServer(cfg, term) { return callAjax(cfg, { x01: "search", x03: term }); }
function highlightLabel(text) {
  if (!_lastSearchTerm) return esc(text);
  var rx = likeToRegExp(_lastSearchTerm);
  var raw = String(text);
  var highlighted = esc(raw).replace(rx, function (m) {
    return '<mark class="ts-hit">' + m + '</mark>';
  });
  return highlighted;
}

  // =====================================================================
  // Rendering
  // =====================================================================
  function nodeHTML(row, level) {
    var r = normalizeRow(row);
    var hasKids = r.has_children === 1 || r.is_leaf === 0;
    var isLeaf = r.is_leaf === 1;
    //var icn = r.icon || (isLeaf ? "fa fa-file" : "fa fa-folder"); // NEW
    var icn = r.icon || (isLeaf ? "fa fa-file" : "fa fa-folder");
    var iconHtml = _hasIcons ? ('<span class="ts-icon ' + esc(icn) + '" aria-hidden="true"></span>') : '';
    return '' +
      '<li class="ts-node" data-node="' + esc(r.id) + '"' +
      ' data-level="' + level + '"' +
      ' data-has-children="' + (hasKids ? "1" : "0") + '"' +
      ' data-leaf="' + (isLeaf ? "1" : "0") + '"' +
      ' aria-expanded="false" role="treeitem" aria-selected="false" tabindex="-1" aria-disabled="' + (r.disabled ? "true" : "false") + '">' +
      (hasKids
        ? '<button class="ts-toggle" type="button" aria-label="Toggle" aria-expanded="false"></button>'
        : '<span class="ts-spacer" aria-hidden="true"></span>') +
      '<label class="ts-label">' +
      '<input class="ts-check" type="checkbox" ' +
      (r.selected ? 'checked ' : '') +
      (r.disabled ? 'disabled ' : '') +
      '/>' +
      //'<span class="ts-icon ' + esc(icn) + '" aria-hidden="true"></span>' + // NEW
      iconHtml +
      '<span class="ts-text">' + highlightLabel(r.label || r.id) + '</span>' +
      '</label>' +
      '<ul class="ts-children" role="group" hidden></ul>' +
      '</li>';
  }

  function renderList($ul, rows, level) {
    var html = [];
    (rows || []).forEach(function (r) { html.push(nodeHTML(r, level)); });
    $ul.html(html.join(""));
  }

  // =====================================================================
  // Selection + tri-state propagation
  // =====================================================================
  function collectCheckedIds($root) {
    var ids = [];
    $root.find("input.ts-check:checked").each(function () {
      var id = $(this).closest("li.ts-node").attr("data-node");
      if (id) ids.push(id);
    });
    return uniq(ids);
  }

  function updateStore(cfg, $root) {
    if (!cfg.storeItem) return;
    var ids = collectCheckedIds($root);

    if (!cfg.allowParent) {
      ids = ids.filter(function (id) {
        var $li = $root.find('li.ts-node[data-node="' + escCSS(id) + '"]');
        return $li.attr("data-leaf") === "1";
      });
    }
    if (!cfg.allowLeaf) {
      ids = ids.filter(function (id) {
        var $li = $root.find('li.ts-node[data-node="' + escCSS(id) + '"]');
        return $li.attr("data-leaf") !== "1";
      });
    }

    var value = cfg.storeFormat === "CSV" ? asCSV(ids) : asJSON(ids);
    setItemValue(cfg.storeItem, value);
  }

  function setIndeterminate(input, flag) {
    if (input && typeof input.indeterminate !== "undefined") input.indeterminate = !!flag;
  }

function recalcUpwards($li, cfg) {
  if (!cfg.triState) return;
  var $parent = $li.parent().closest("li.ts-node");
  if (!$parent.length) return;

  // ---- Only consider enabled (checkable) children ----
  var $kids = $parent.find("> ul.ts-children > li.ts-node");
  if (!$kids.length) return;

  var $checkableKids = $kids.filter(function () {
    var $kid = $(this);
    // li marked disabled or checkbox disabled → not checkable
    if ($kid.hasClass("is-disabled")) return false;
    var cb = $kid.children(".ts-label").find("input.ts-check").get(0);
    return cb && !cb.disabled;
  });

  var allChecked = true, anyChecked = false, anyInd = false;

  $checkableKids.each(function () {
    var cb = $(this).children(".ts-label").find("input.ts-check").get(0);
    if (cb) {
      allChecked = allChecked && cb.checked && !cb.indeterminate;
      anyChecked = anyChecked || cb.checked;
      anyInd     = anyInd     || cb.indeterminate;
    }
  });

  // ---- Never change a disabled parent ----
  var pcb = $parent.children(".ts-label").find("input.ts-check").get(0);
  if (pcb && !pcb.disabled) {
    if ($checkableKids.length && allChecked) {
      pcb.checked = true;  setIndeterminate(pcb, false);
      $parent.addClass("is-checked").removeClass("is-mixed");
    } else if (anyChecked || anyInd) {
      pcb.checked = false; setIndeterminate(pcb, true);
      $parent.addClass("is-mixed").removeClass("is-checked");
    } else {
      pcb.checked = false; setIndeterminate(pcb, false);
      $parent.removeClass("is-checked is-mixed");
    }
  }

  recalcUpwards($parent, cfg);
}

// Recompute tri-state for the whole tree bottom-up (used by bulk)
function recomputeAllFromLeaves($root, cfg) {
  var nodes = $root.find("li.ts-node").get();
  nodes.sort(function (a, b) {
    return $(b).parents("li.ts-node").length - $(a).parents("li.ts-node").length;
  });
  for (var i = 0; i < nodes.length; i++) {
    recalcUpwards($(nodes[i]), cfg);
  }
}
  function propDown($li, checked) {
    $li.find("> .ts-label > input.ts-check").each(function () {
      this.checked = !!checked; setIndeterminate(this, false);
    });
    $li.find("> ul.ts-children input.ts-check").each(function () {
      this.checked = !!checked; setIndeterminate(this, false);
    });
  }

  // =====================================================================
  // Expand / children loading
  // =====================================================================
  function ensureChildren($li, cfg, cache) {
    var $ul = $li.children("ul.ts-children");
    if ($li.data("loaded")) return Promise.resolve(true);

    var id = $li.attr("data-node");
    if (cache.children[id]) {
      renderList($ul, cache.children[id], Number($li.attr("data-level")) + 1);
      $li.data("loaded", true).attr("data-loaded", "1");
      return Promise.resolve(true);
    }
    return loadChildren(cfg, id).then(function (rows) {
      cache.children[id] = rows || [];
      renderList($ul, cache.children[id], Number($li.attr("data-level")) + 1);
      $li.data("loaded", true).attr("data-loaded", "1");
      return true;
    });
  }

  function toggleExpand($li, expand) {
    var $ul  = $li.children('ul.ts-children');
    var $btn = $li.children('.ts-toggle');
    if (expand) {
      $li.attr('aria-expanded', 'true');
      if ($btn.length) $btn.attr('aria-expanded', 'true');
      $ul.prop('hidden', false);
    } else {
      $li.attr('aria-expanded', 'false');
      if ($btn.length) $btn.attr('aria-expanded', 'false');
      $ul.prop('hidden', true);
    }
  }

  // Build a parent->children map (used by server-search pruning)
  function buildTreeMap(rows) {
    var map = Object.create(null);
    rows.forEach(function (r) {
      var pid = r.parentId == null ? "_ROOT_" : String(r.parentId);
      if (!map[pid]) map[pid] = [];
      map[pid].push(r);
    });
    return map;
  }

  function nodeHTMLFromRow(r, level) {
    var hasKids = r.hasChildren === true || r.hasChildren === 1 || r.leaf === false || r.leaf === 0;
    var isLeaf  = r.leaf === true || r.leaf === 1;
    //var icn     = r.icon || (isLeaf ? "fa fa-file" : "fa fa-folder"); // NEW
    var icn     = r.icon || (isLeaf ? "fa fa-file" : "fa fa-folder");
    var iconHtml = _hasIcons ? ('<span class="ts-icon ' + esc(icn) + '" aria-hidden="true"></span>') : '';
    return '' +
      '<li class="ts-node" data-node="' + esc(r.id) + '"' +
      ' data-level="' + level + '"' +
      ' data-has-children="' + (hasKids ? "1" : "0") + '"' +
      ' data-leaf="' + (isLeaf ? "1" : "0") + '"' +
      ' aria-expanded="false" role="treeitem" aria-selected="false" tabindex="-1">' +
        (hasKids
          ? '<button class="ts-toggle" type="button" aria-label="Toggle" aria-expanded="false"></button>'
          : '<span class="ts-spacer" aria-hidden="true"></span>') +
        '<label class="ts-label">' +
          '<input class="ts-check" type="checkbox"' + (r.selected ? ' checked' : '') + (r.disabled ? ' disabled' : '') + '>' +
          //'<span class="ts-icon ' + esc(icn) + '" aria-hidden="true"></span>' + // NEW
          iconHtml +
          '<span class="ts-text">' + highlightLabel(r.label || r.id) + '</span>' +
        '</label>' +
        '<ul class="ts-children" role="group" hidden></ul>' +
      '</li>';
  }

  function renderHierarchy($ul, map, parentKey, level) {
    var rows = map[parentKey] || [];
    rows.sort(function (a, b) {
      var la = (a.label || '').toLowerCase(), lb = (b.label || '').toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });

    var html = rows.map(function (r) { return nodeHTMLFromRow(r, level); }).join('');
    $ul.html(html);

    $ul.children('li.ts-node').each(function () {
      var id = $(this).attr('data-node');
      var childKey = String(id);
      if (map[childKey] && map[childKey].length) {
        var $childUl = $(this).children('ul.ts-children');
        renderHierarchy($childUl, map, childKey, level + 1);
        toggleExpand($(this), true);
      }
    });
  }
function loadChildrenBatch(cfg, parentIdsCSV) {
  return callAjax(cfg, { x01: "children_batch", x02: parentIdsCSV });
}


function yieldUI() { return new Promise(r => setTimeout(r, 0)); }

  // Preload entire tree so client search can see everything
function preloadAllChildren($container, cfg, cache) {
  // Collect unopened parents in this container
  var $targets = $container.find('li.ts-node[data-has-children="1"]').filter(function () {
    return !$(this).data('loaded');
  });

  if (!$targets.length) return Promise.resolve(true);

  // Build one CSV for the server
  var ids = [];
  $targets.each(function () { ids.push($(this).attr('data-node')); });

  // Single round-trip for all those parents
  return loadChildrenBatch(cfg, ids.join(',')).then(function (rows) {
    rows = rows || [];
// 🔧 Fallback: if the server didn't implement children_batch for this source,
  // load each unopened parent one-by-one using ensureChildren, then continue.
  if (rows.length === 0) {
    var fixes = [];
    $targets.each(function () {
      var $li = $(this);
      if (!$li.data('loaded')) {
        fixes.push(ensureChildren($li, cfg, cache));
      }
    });
    return Promise.all(fixes).then(function () {
      var $all = $container.find('> li.ts-node, ul.ts-children > li.ts-node');
      return preloadAllChildren($all, cfg, cache);
    });
  }
    // Group rows by parentId
    var byPid = Object.create(null);
    rows.forEach(function (r) {
      var key = String(r.parentId);
      (byPid[key] = byPid[key] || []).push(r);
    });

    // Render each UL once and mark as loaded
    var count = 0;
    $targets.each(function () {
      var $li = $(this);
      var pid = String($li.attr('data-node'));
      var $ul = $li.children('ul.ts-children');
      var kids = byPid[pid] || [];
      cache.children[pid] = kids;
      renderList($ul, kids, Number($li.attr('data-level')) + 1);
      $li.data('loaded', true).attr('data-loaded', '1');

      // Yield every ~100 renders so the browser can paint
      count++;
      if (count % 100 === 0) {
        // queue a micro break before continuing
        // note: we don't "await" here because this isn't async/await code;
        // the recursive call below gets a new microtask turn anyway
      }
    });

    // Recurse into the newly added children
    var $all = $container.find('> li.ts-node, ul.ts-children > li.ts-node');
    return preloadAllChildren($all, cfg, cache);
  });
}



  // Client filter with highlight & ancestor expansion
  function filterTreeClient($region, term) {
    var $nodes = $region.find('li.ts-node');
    //var needle = term.trim().toLowerCase();
var needle = term.trim(); // don't .toLowerCase() here; regex is /i

    // Clear previous state
    $nodes.removeClass('ts-hidden-by-search');
    $region.find('mark.ts-hit').each(function () {
      var $m = $(this); $m.replaceWith($m.text());
    });

    if (!needle) return 0;

function markAndTest($li) {
  var $txt = $li.children('.ts-label').find('.ts-text');
  var text = $txt.text();
  var rx   = likeToRegExp(needle); // <-- use LIKE semantics

  // Test first (copy because /g regex maintains state)
  var rxTest = new RegExp(rx.source, 'i');
  if (!rxTest.test(text)) return false;

  // Highlight all hits
  $txt.html(text.replace(rx, function (m) {
    return '<mark class="ts-hit">' + m + '</mark>';
  }));
  return true;
}


    var stack = [].slice.call($nodes.get()).reverse();
    var hits = 0;
    stack.forEach(function (li) {
      var $li = $(li);
      var kids = $li.find('> ul.ts-children > li.ts-node');
      var match = markAndTest($li);

      var childMatch = false;
      kids.each(function () {
        var hidden = $(this).hasClass('ts-hidden-by-search');
        if (!hidden) childMatch = true;
      });

      var keep = match || childMatch;
      if (!keep) {
        $li.addClass('ts-hidden-by-search');
      } else {
        if (match) hits++;
        $li.parents('li.ts-node').each(function () {
          toggleExpand($(this), true);
          $(this).removeClass('ts-hidden-by-search');
        });
      }
    });

    // Collapse branches with no visible descendants
    $region.find('li.ts-node[aria-expanded="true"]').each(function () {
      var $li = $(this);
      var $visDesc = $li.find('> ul.ts-children > li.ts-node:not(.ts-hidden-by-search)');
      if ($visDesc.length === 0) toggleExpand($li, false);
    });

    return hits;
  }

  // =====================================================================
  // Search (client/server)
  // =====================================================================
  function attachSearch($region, cfg, cache, refreshRoots) {
    var $box  = $region.find('[data-tree-role="search"], .ts-search');
    if (!$box.length || cfg.searchMode === "NONE") return;

    var $list = $region.find('ul.t-TreeSelect-list');

    function restoreView() {
      $region.find('.ts-hidden-by-search').removeClass('ts-hidden-by-search');
      $region.find('mark.ts-hit').each(function () {
        var $m = $(this); $m.replaceWith($m.text());
      });
      renderList($list, cache.roots, 1);
      var target = Number(cfg.defaultExpand || 0);
      if (target > 0) {
        (function expandToLevelLocal($container, level, target) {
          if (level >= target) return Promise.resolve();
          var jobs = [];
          $container.children('li.ts-node[data-has-children="1"]').each(function () {
            var $li = $(this);
            jobs.push(ensureChildren($li, cfg, cache).then(function () {
              toggleExpand($li, true);
            }));
          });
          return Promise.all(jobs).then(function () {
            return expandToLevelLocal($region.find('ul.ts-children:not([hidden])'), level + 1, target);
          });
        })($list, 0, target);
      }
    }

    var run = util.debounce(function () {
      var term = ($box.val() || "").trim();
      onSearchTermChanged(term);


      if (!term) {
  if (cfg.searchMode === "SERVER") { refreshRoots(); }
  else { restoreView(); }
  return;
}


if (cfg.searchMode === "SERVER") {
  var previouslyChecked = collectCheckedIds($region);

  // If search box is cleared -> reload full tree from DB (not just cached view)
  // if (!term) { refreshRoots(); return; }

  searchServer(cfg, term).then(function (rows) {
    // Build an id -> row map, ensure ancestors exist (defensive; PL/SQL already sends them)
    var byId = Object.create(null);
    (rows || []).forEach(function (r) { byId[String(r.id)] = r; });

    function addAncestors(row) {
      var pid = row.parent_id || row.parentId;
      if (!pid) return;
      var key = String(pid);
      if (!byId[key]) {
        var anc = null;
        (cache.roots || []).forEach(function (x) { if (String(x.id) === key) anc = x; });
        if (!anc) {
          Object.keys(cache.children).some(function (k) {
            var hit = (cache.children[k] || []).find(function (x) { return String(x.id) === key; });
            if (hit) { anc = hit; return true; }
            return false;
          });
        }
        if (anc) { byId[key] = anc; addAncestors(anc); }
      }
    }
    (rows || []).forEach(addAncestors);

    // Render hierarchically
    var list = Object.keys(byId).map(function (k) { return byId[k]; });
    var map  = buildTreeMap(list);
    $list.empty();
    renderHierarchy($list, map, "_ROOT_", 1);

    // Expand everything once to mimic client filtering
    $region.find('li.ts-node[data-has-children="1"]').each(function () { toggleExpand($(this), true); });

    // Re-apply previous checks so search doesn't clear selection
    previouslyChecked.forEach(function (id) {
      var $li = $region.find('.ts-node[data-node="' + apex.util.escapeCSS(String(id)) + '"]');
      if ($li.length) {
        var cb = $li.find('> .ts-label .ts-check').get(0);
        if (cb && !cb.checked) { cb.checked = true; $(cb).trigger('change'); }
      }
    });


  });

  return;
}


      // CLIENT mode
      var needPreload = $region.find('li.ts-node[data-has-children="1"]').filter(function () {
        return !$(this).data('loaded');
      }).length > 0;

      var start = needPreload ? preloadAllChildren($list, cfg, cache) : Promise.resolve(true);
  withBusy($region, start.then(function(){ return filterTreeClient($region, term); }));
    }, 200);

    $box.off('input.ts search.ts').on('input.ts search.ts', run);
    $box.off('keydown.ts').on('keydown.ts', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); run(); }
    });
  }

  // =====================================================================
  // Keyboard navigation
  // =====================================================================
  function focusNode($region, $target) {
    $region.find("li.ts-node[tabindex='0']").attr("tabindex", "-1");
    $target.attr("tabindex", "0").focus();
  }

  function nextNode($li) {
    var $openChildren = $li.attr("aria-expanded") === "true" ? $li.find("> ul.ts-children > li.ts-node") : $();
    if ($openChildren.length) return $($openChildren.get(0));
    var $n = $li.next("li.ts-node");
    if ($n.length) return $n;
    var $p = $li.parent().closest("li.ts-node");
    while ($p.length && !$p.next("li.ts-node").length) { $p = $p.parent().closest("li.ts-node"); }
    return $p.length ? $p.next("li.ts-node") : $();
  }

  function prevNode($li) {
    var $p = $li.prev("li.ts-node");
    if ($p.length) {
      while ($p.attr("aria-expanded") === "true" && $p.find("> ul.ts-children > li.ts-node").length) {
        var $kids = $p.find("> ul.ts-children > li.ts-node");
        $p = $($kids.get($kids.length - 1));
      }
      return $p;
    }
    return $li.parent().closest("li.ts-node");
  }

  // =====================================================================
  // Public API
  // =====================================================================
  function apiOf($region, cfg, cache, refreshRoots) {
    return {
      refresh: refreshRoots,
      getSelectedIds: function () { return collectCheckedIds($region); },
      checkAllVisible: function () {
        $region.find("input.ts-check:not(:disabled)").each(function () { this.checked = true; setIndeterminate(this, false); });
        updateStore(cfg, $region);
      },
      uncheckAllVisible: function () {
        $region.find("input.ts-check:not(:disabled)").each(function () { this.checked = false; setIndeterminate(this, false); });
        updateStore(cfg, $region);
      },
      expandAllOneLevel: function () {
        $region.find("li.ts-node[data-has-children='1']").each(function () {
          var $li = $(this);
          ensureChildren($li, cfg, cache).then(function () { toggleExpand($li, true); });
        });
      },
      destroy: function () {
        $region.off(".ts");
        $region.removeData("treeSelect");
        $region.find("ul.t-TreeSelect-list").empty();
      }
    };
  }

  // =====================================================================
  // Init (called from PL/SQL via apex_javascript.add_onload_code)
  // =====================================================================
  win.xxTreeSelectInit = function init(cfg) {


    var defaults = {
      storeFormat: "JSON",
      allowParent: true,
      allowLeaf: true,
      triState: true,
      defaultExpand: 0,
      searchMode: "NONE",
      hotkeys: true
    };
    cfg = $.extend({}, defaults, cfg || {});
    if (!cfg.staticId && cfg.regionStaticId) cfg.staticId = cfg.regionStaticId;

    // Resolve container
    var $region = $("#" + cfg.staticId);
    
    if ($region.length && !$region.find("ul.t-TreeSelect-list").length) {
      var $inner = $region.find(".t-TreeSelect").first();
      if ($inner.length) $region = $inner;
    }
    $region.attr('data-has-icons', cfg.hasIcons ? 'true' : 'false');
    _hasIcons = !!cfg.hasIcons; // keep JS and CSS in sync
    if (!$region.length) { $region = $('.t-TreeSelect#' + util.escapeCSS(cfg.staticId)); }
    if (!$region.length) { console.warn("[TreeSelect] Container not found for staticId:", cfg.staticId); return; }

    var $list = $region.find("ul.t-TreeSelect-list");
    if (!$list.length) { console.warn("[TreeSelect] Missing <ul class='t-TreeSelect-list'> inside region."); }

    var cache = { roots: [], children: Object.create(null) };

    function expandToLevel($container, current, target) {
      if (current >= target) return Promise.resolve();
      var tasks = [];
      $container.children("li.ts-node").each(function () {
        var $li = $(this);
        if ($li.attr("data-has-children") === "1") {
          tasks.push(ensureChildren($li, cfg, cache).then(function () { toggleExpand($li, true); }));
        }
      });
      return Promise.all(tasks).then(function () {
        var $next = $region.find('ul.ts-children:not([hidden])');
        return expandToLevel($next, current + 1, target);
      });
    }

    function refreshRoots() {
      return loadRoots(cfg).then(function (rows) {
  rows = rows || [];
  if (cfg.dataSourceType === "STATIC_JSON") {
    // Build a parent->children map and render a proper tree from the flat list
    var map = buildTreeMap(rows);              // already in your file
    cache.roots = map["_ROOT_"] || [];         // keep a minimal cache of root rows
    $list.empty();
    renderHierarchy($list, map, "_ROOT_", 1);  // already in your file
  } else {
    cache.roots = rows;
    renderList($list, cache.roots, 1);
  }

  var target = Number(cfg.defaultExpand || 0);
  if (target > 0) {
    expandToLevel($list, 0, target).then(function () {
      updateStore(cfg, $region);
      var $first = $list.children("li.ts-node").first();
      if ($first.length) { $first.attr("tabindex", "0"); }
    });
  } else {
    updateStore(cfg, $region);
    var $first = $list.children("li.ts-node").first();
    if ($first.length) { $first.attr("tabindex", "0"); }
  }
});
    }

    // Prime roots
    refreshRoots();

    // ----------------------- Mouse: expand/collapse -----------------------
    $region.on("click.ts", "button.ts-toggle", function () {
      var $li = $(this).closest("li.ts-node");
      var open = $li.attr("aria-expanded") === "true";
      if (!open) {
        ensureChildren($li, cfg, cache).then(function () { toggleExpand($li, true); });
      } else {
        toggleExpand($li, false);
      }
    });

    // ----------------------- Mouse: checkbox change -----------------------
    $region.on("change.ts", "input.ts-check", function () {
      var $li = $(this).closest("li.ts-node");
      if (!cfg.allowParent && $li.attr("data-leaf") !== "1") { this.checked = false; this.indeterminate = false; return; }
      if (!cfg.allowLeaf && $li.attr("data-leaf") === "1") { this.checked = false; this.indeterminate = false; return; }

      if (cfg.triState && $li.attr("data-has-children") === "1") {
        if ($li.attr("aria-expanded") !== "true") {
          var self = this;
          ensureChildren($li, cfg, cache).then(function () {
            propDown($li, !!self.checked);
            recalcUpwards($li, cfg);
            updateStore(cfg, $region);
          });
          return;
        } else {
          propDown($li, !!this.checked);
        }
      }
      recalcUpwards($li, cfg);
      updateStore(cfg, $region);
    });

    // ----------------------- Expand / Collapse ALL ------------------------
    $region.on("click.ts", ".ts-expandAll", function () {
      var whenRoots = $list.children("li.ts-node").length ? Promise.resolve() : refreshRoots();
  withBusy($region,
   whenRoots
      .then(function(){ return preloadAllChildren($list, cfg, cache); })
      .then(function(){
        var fixes = [];
        $region.find('li.ts-node[data-has-children="1"]').each(function () {
          var $li = $(this);
          if (!$li.data('loaded')) { fixes.push(ensureChildren($li, cfg, cache)); }
        });
        return Promise.all(fixes);
      })
      .then(function () {
       // Now expand everything
        $region.find('li.ts-node[data-has-children="1"]').each(function () {
          toggleExpand($(this), true);
        });
      })
  );
    });

    $region.on("click.ts", ".ts-collapseAll", function () {
      $region.find('li.ts-node[aria-expanded="true"]').each(function () {
        toggleExpand($(this), false);
      });
    });

// ----------------------- Check / Uncheck ALL ------------------------------
// ----------------------- Keyboard navigation -------------------------
    if (cfg.hotkeys) {
      $region.attr("role", "tree");
      $region.on("click.ts", "li.ts-node", function (e) {
        if ($(e.target).is("input,button,label")) return;
        focusNode($region, $(this));
      });

      $region.on("keydown.ts", function (e) {
        var $focused = $region.find("li.ts-node[tabindex='0']");
        if (!$focused.length) return;

        var handled = true;
        switch (e.key) {
          case "ArrowDown": {
            var $n = nextNode($focused);
            if ($n && $n.length) focusNode($region, $n);
            break;
          }
          case "ArrowUp": {
            var $p = prevNode($focused);
            if ($p && $p.length) focusNode($region, $p);
            break;
          }
          case "ArrowRight": {
            if ($focused.attr("data-has-children") === "1") {
              if ($focused.attr("aria-expanded") !== "true") {
                ensureChildren($focused, cfg, cache).then(function () { toggleExpand($focused, true); });
              } else {
                var $kids = $focused.find("> ul.ts-children > li.ts-node");
                if ($kids.length) focusNode($region, $($kids.get(0)));
              }
            }
            break;
          }
          case "ArrowLeft": {
            if ($focused.attr("aria-expanded") === "true") {
              toggleExpand($focused, false);
            } else {
              var $par = $focused.parent().closest("li.ts-node");
              if ($par.length) focusNode($region, $par);
            }
            break;
          }
          case " ":
          case "Enter": {
            var cb = $focused.children(".ts-label").find("input.ts-check").get(0);
            if (cb && !cb.disabled) {
              cb.checked = !cb.checked;
              $(cb).trigger("change");
            }
            break;
          }
          default: handled = false;
        }
        if (handled) { e.preventDefault(); e.stopPropagation(); }
      });
    }

    // ----------------------- Search wiring --------------------------------
    attachSearch($region, cfg, cache, refreshRoots);
// Inline bulk handlers (acts on visible scope; Shift = entire tree with preload)
(function(){
  var $scope = (typeof $list !== "undefined" && $list && $list.length) ? $list : $region;

  function applyToScope(checked) {
    var cbs = $scope.find('li.ts-node > .ts-label > input.ts-check:not(:disabled)').get();
    for (var i=0;i<cbs.length;i++){ cbs[i].checked = checked; cbs[i].indeterminate = false; }
    if (typeof recomputeAllFromLeaves === "function") { recomputeAllFromLeaves($region, cfg); }
    if (typeof updateStore === "function") updateStore(cfg, $region);
    if ($region[0]) {
      var ids = (typeof collectCheckedIds==='function') ? collectCheckedIds($region) : [];
      $region[0].dispatchEvent(new CustomEvent("xx:change", {
        detail: { ids: ids, changed: { id: null, state: checked, branch: false }, mode: "bulk", staticId: cfg.staticId }
      }));
    }
  }

  function ensureRootsLoaded() {
    if (typeof refreshRoots === "function") {
      return $scope.find('li.ts-node').length ? Promise.resolve() : refreshRoots();
    }
    return Promise.resolve();
  }

  $region.off("click.ts", ".ts-checkAll").on("click.ts", ".ts-checkAll", function(e){
    var entire = e.shiftKey === true;
    if (entire && typeof preloadAllChildren === "function" && typeof withBusy === "function") {
      withBusy($region, ensureRootsLoaded().then(function(){ return preloadAllChildren($scope, cfg, cache); }).then(function(){ applyToScope(true); }));
    } else {
      applyToScope(true);
    }
  });

  $region.off("click.ts", ".ts-uncheckAll").on("click.ts", ".ts-uncheckAll", function(e){
    var entire = e.shiftKey === true;
    if (entire && typeof preloadAllChildren === "function" && typeof withBusy === "function") {
      withBusy($region, ensureRootsLoaded().then(function(){ return preloadAllChildren($scope, cfg, cache); }).then(function(){ applyToScope(false); }));
    } else {
      applyToScope(false);
    }
  });
})
(); // end inline bulk handlers

// --- 2-item context menu + HTML dialog -----------------------------------
(function(){
  // 1) Create one floating menu and one dialog per page (once)
  // Create overlay + dialog once
 var $menu = $region.children('.ts-menu');
 if (!$menu.length) $menu = $('<div class="ts-menu" role="menu" aria-hidden="true"></div>').appendTo($region);

 var $overlay = $region.children('.ts-overlay');
 if (!$overlay.length) $overlay = $('<div class="ts-overlay" aria-hidden="true"></div>').appendTo($region);

 var $dlg = $overlay.children('.ts-dialog');
 if (!$dlg.length) {
   $dlg = $(
     '<div class="ts-dialog" role="dialog" aria-modal="true" aria-labelledby="tsDialogTitle" aria-describedby="tsDialogBody">' +
       '<div class="ts-dialog__hdr">' +
         '<div id="tsDialogTitle">Node Info</div>' +
         '<button type="button" class="ts-dialog__close" aria-label="Close">Close</button>' +
       '</div>' +
       '<div class="ts-dialog__body" id="tsDialogBody"></div>' +
     '</div>'
   ).appendTo($overlay);
 }

  var openForLi = null;
  var lastFocus = null;

  function closeMenu() {
    $menu.hide().attr('aria-hidden','true').empty();
    openForLi = null;
    $(document).off('.tsMenu'); $(window).off('.tsMenu');
  }

  function posMenu(x, y) {
    var mw = $menu.outerWidth(), mh = $menu.outerHeight();
    var vw = $(window).width(), vh = $(window).height();
    var nx = Math.min(Math.max(0, x), vw - mw - 4);
    var ny = Math.min(Math.max(0, y), vh - mh - 4);
    $menu.css({ left: nx, top: ny });
  }

  // Extract node ID and label safely from your markup
function getNodeInfo($li){
  // try several common attributes
  var id =
        $li.attr('data-id') ||
        $li.data('id') ||
        $li.attr('data-node') ||
        $li.attr('id') || '';

  // label: prefer a plain-text span if present; else strip child controls
  var $labelEl = $li.find('> .ts-label');
  var label = ($labelEl.find('.ts-text').text() ||
               $labelEl.clone().children().remove().end().text()
              ).trim();

  return { id: String(id), label: label };
}


  // HTML dialog open/close with focus management
var lastFocus = null;
function tsApplyBottomInset($overlay){
  // Detect APEX dev toolbar (runs only in Builder sessions)
  var tb = document.querySelector(".u-DeveloperToolbar, .apex-dev-toolbar, #apexDevToolbar");
  var h  = tb ? tb.getBoundingClientRect().height : 0;
  // Also respect iOS safe area if available
  var safe = 0; try { safe = parseInt(getComputedStyle(document.documentElement).getPropertyValue("padding-bottom")) || 0; } catch(_){}
  $overlay.css("padding-bottom", (h + safe + 16) + "px"); // 16px breathing room
}
 function openDialog(html){
   lastFocus = document.activeElement;
   $dlg.find('.ts-dialog__body').html(html);
   // region-contained modal: no global overflow changes
   $overlay.attr('aria-hidden','false').css('display','flex'); // flex centers children
   $dlg.show();
   // move focus *into* dialog
   var focusable = $dlg.find('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])').get(0);
   (focusable || $dlg[0]).focus();
   // esc to close + click outside
   $(document).on('keydown.tsDlg', function(e){ if (e.key === 'Escape') closeDialog(); });
   $overlay.on('mousedown.tsDlg', function(e){
     if (!$(e.target).closest('.ts-dialog').length) closeDialog();
   });
 }
 function closeDialog(){
   // restore focus *before* hiding aria-hidden content (prevents console warning)
   if (lastFocus && typeof lastFocus.focus === 'function') { try { lastFocus.focus(); } catch(_){} }
   $overlay.attr('aria-hidden','true').hide(); // hiding parent is enough
   $(document).off('keydown.tsDlg'); $overlay.off('mousedown.tsDlg');
 }
$dlg.on('click', '.ts-dialog__close', function(e){
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  closeDialog();
});



  function escapeHTML(s){
  try { return apex.util.escapeHTML(s); } catch(_){ return String(s).replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
}

function buildMenu($li){
  var bits = getNodeInfo($li);

  // Info…
  $('<div class="ts-mi" role="menuitem" tabindex="-1">Info…</div>')
    .on('click', function(e){
      e.preventDefault(); e.stopPropagation(); closeMenu();
      var body = '<p><strong>ID:</strong> ' + (bits.id ? escapeHTML(bits.id) : '<em>—</em>') + '</p>' +
                 '<p><strong>Label:</strong> ' + escapeHTML(bits.label) + '</p>';
      openDialog(body);
    })
    .appendTo($menu);

  // Open Oracle APEX site
  $('<div class="ts-mi" role="menuitem" tabindex="-1">Open Oracle APEX site</div>')
    .on('click', function(e){
      e.preventDefault(); e.stopPropagation(); closeMenu();
      var href = 'https://apex.oracle.com/';
      if (apex.navigation && apex.navigation.openInNewWindow) {
        apex.navigation.openInNewWindow(href);
      } else {
        window.open(href, '_blank', 'noopener');
      }
    })
    .appendTo($menu);
}


  // Right-click opens menu
  $region.on('contextmenu.ts', 'li.ts-node > .ts-label', function(ev){
    ev.preventDefault(); ev.stopPropagation();
    openForLi = $(this).closest('li.ts-node');
    $menu.empty(); buildMenu(openForLi);
    $menu.show().attr('aria-hidden','false');
    posMenu(ev.clientX, ev.clientY);

    // Close on outside / Esc / scroll / resize
    setTimeout(function(){
      $(document).on('mousedown.tsMenu', function(e){ if (!$(e.target).closest('.ts-menu').length) closeMenu(); });
      $(document).on('keydown.tsMenu', function(e){ if (e.key === 'Escape') closeMenu(); });
      $(window).on('scroll.tsMenu resize.tsMenu', closeMenu);
    }, 0);
  });

  // Keyboard: Shift+F10 for focused labels
  $region.on('keydown.ts', 'li.ts-node > .ts-label', function(e){
    if (e.shiftKey && e.key === 'F10') {
      e.preventDefault(); e.stopPropagation();
      var rect = this.getBoundingClientRect();
      openForLi = $(this).closest('li.ts-node');
      $menu.empty(); buildMenu(openForLi);
      $menu.show().attr('aria-hidden','false');
      posMenu(rect.left + 8, rect.top + 8);

      setTimeout(function(){
        $(document).on('mousedown.tsMenu', function(ev){ if (!$(ev.target).closest('.ts-menu').length) closeMenu(); });
        $(document).on('keydown.tsMenu', function(ev){ if (ev.key === 'Escape') closeMenu(); });
        $(window).on('scroll.tsMenu resize.tsMenu', closeMenu);
      }, 0);
    }
  });
})(); // end context menu + dialog

    

// === Bulk Handlers (attached inside init) ================================
// ----------------------- Public API -----------------------------------
    $region.data("treeSelect", apiOf($region, cfg, cache, refreshRoots));
  };

})(window, apex.jQuery, apex.util);


    
